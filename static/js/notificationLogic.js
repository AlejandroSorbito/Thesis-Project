// static/notificationLogic.js

document.addEventListener('DOMContentLoaded', async () => {
    updateSidebarDashboardLink();
    await loadNotifications();
});

function updateSidebarDashboardLink() {
    const dashboardLink = document.getElementById('sidebarDashboardLink') || document.getElementById('navDashboardLink');
    if (!dashboardLink) return;

    let role = (sessionStorage.getItem('kandili_user_role') || '').trim().toLowerCase();
    if (!role) {
        const urlParams = new URLSearchParams(window.location.search);
        role = (urlParams.get('origin') || '').trim().toLowerCase();
    }

    if (role === 'principal') {
        dashboardLink.href = '../principal/principaldashboard.html';
    } else if (role === 'admin') {
        dashboardLink.href = '../admin/admindashboard.html';
    } else if (role === 'teacher') {
        dashboardLink.href = '../teacher/teacherdashboard.html';
    }
}

async function loadNotifications() {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        // Fetch notifications for current user
        const { data: notifications, error } = await window.supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        // Find notification container (handles common class/ID patterns)
        const container = document.querySelector('.notification-list') || 
                          document.querySelector('.notifications-container') ||
                          document.querySelector('.card-body');

        if (!container) return;

        container.innerHTML = '';

        if (error) {
            console.error("Error loading notifications:", error.message);
            container.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #ef4444;">Failed to load notifications.</div>`;
            return;
        }

        if (!notifications || notifications.length === 0) {
            container.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #64748b;">No recent notifications.</div>`;
            return;
        }

        notifications.forEach(notif => {
            const formattedDate = new Date(notif.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            const card = document.createElement('div');
            card.style.cssText = 'padding: 1rem; margin-bottom: 0.75rem; background: #ffffff; border-left: 4px solid #0038A8; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);';
            if (notif.type === 'warning' || notif.type === 'alert') {
                card.style.borderLeftColor = '#C8102E';
            }

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                    <strong style="color: #0f172a; font-size: 1rem;">${notif.title}</strong>
                    <span style="color: #94a3b8; font-size: 0.8rem;">${formattedDate}</span>
                </div>
                <p style="color: #475569; margin: 0; font-size: 0.9rem;">${notif.message}</p>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        console.error("Failed to fetch notifications:", err);
    }
}