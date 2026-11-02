/**
 * Notifications Controller
 * Kandili Workspace - Shared Role Notification Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    initRoleRouting();
    initLogoutHandler();
    initNotificationFeed();
});

/* ==========================================================================
   1. Role-Aware Dynamic Navigation Routing (Bulletproof Back Button)
   ========================================================================== */
function initRoleRouting() {
    const params = new URLSearchParams(window.location.search);
    let origin = params.get('origin');

    // 1. Resolve role from query param, sessionStorage, or referrer
    if (!origin) {
        origin = sessionStorage.getItem('kandili_user_role');
    }
    if (!origin) {
        const ref = (document.referrer || '').toLowerCase();
        origin = ref.includes('principal') ? 'principal' : 'teacher';
    }

    // Persist active role
    sessionStorage.setItem('kandili_user_role', origin);

    // 2. Adjust sidebar links to match active role
    const dashboardLink = document.getElementById('navDashboardLink');
    if (dashboardLink) {
        dashboardLink.setAttribute(
            'href',
            origin === 'principal' 
                ? '../principal/principaldashboard.html' 
                : '../teacher/teacherdashboard.html'
        );
    }

    // Preserve ?origin= on sibling general navigation links
    const linksToPreserve = [
        { id: 'navNotificationsLink', file: 'notification.html' },
        { id: 'navMessagesLink', file: 'message.html' },
        { id: 'navCalendarLink', file: 'calendar.html' },
        { id: 'navHistoryLink', file: 'history.html' },
        { id: 'navSettingsLink', file: 'settings.html' }
    ];

    linksToPreserve.forEach(item => {
        const elem = document.getElementById(item.id);
        if (elem) {
            elem.setAttribute('href', `${item.file}?origin=${origin}`);
        }
    });

    // 3. Fail-safe Back Button click handler
    const backBtn = document.getElementById('navBackBtn');
    if (backBtn) {
        backBtn.removeAttribute('onclick');
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            let targetDashboard = '../teacher/teacherdashboard.html';
            const currentRole = (sessionStorage.getItem('kandili_user_role') || origin || '').toLowerCase();
            if (currentRole === 'admin') targetDashboard = '../admin/admindashboard.html';
            else if (currentRole === 'principal') targetDashboard = '../principal/principaldashboard.html';
            window.location.href = targetDashboard;
        });
    }

    // 4. Refresh button handler
    const refreshBtn = document.getElementById('navRefreshBtn');
    if (refreshBtn) {
        refreshBtn.removeAttribute('onclick');
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.reload();
        });
    }
}

/* ==========================================================================
   2. Authentication & Logout
   ========================================================================== */
function initLogoutHandler() {
    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof kandiliLogout === 'function') {
            kandiliLogout();
        } else if (confirm("Are you sure you want to log out?")) {
            window.location.href = "../login.html";
        }
    });
}

/* ==========================================================================
   3. Notifications Feed & Interactions
   ========================================================================== */
const notificationsData = [
    {
        id: 'notif-1',
        icon: 'fa-triangle-exclamation',
        iconType: 'warning',
        title: 'Workload Threshold Warning (Overload Risk)',
        message: 'Faculty entry TCH-012 has reached 48.0 hrs/wk, exceeding Magna Carta guidelines by 8.0 hours. Task rebalance is recommended.',
        time: '15 minutes ago',
        unread: true
    },
    {
        id: 'notif-2',
        icon: 'fa-clipboard-check',
        iconType: 'success',
        title: 'eSF7 Teaching Load Approved',
        message: 'Mid-Year class schedule upload for Grade 2 (ROVCMS) has been approved and logged into DepEd official records.',
        time: '2 hours ago',
        unread: true
    },
    {
        id: 'notif-3',
        icon: 'fa-heartbeat',
        iconType: 'danger',
        title: 'Pulse Check-in Response Flagged',
        message: 'Anonymized MBI-ES subscale flags high Emotional Exhaustion (EE: 31/54). Rest buffer protocol suggested.',
        time: '5 hours ago',
        unread: true
    },
    {
        id: 'notif-4',
        icon: 'fa-shield-halved',
        iconType: 'info',
        title: 'System Audit Trail Logged',
        message: 'Master timetable optimization report exported and archived for statutory verification.',
        time: 'Yesterday, 4:15 PM',
        unread: false
    }
];

function initNotificationFeed() {
    const listContainer = document.getElementById('notificationListContainer');
    const markAllBtn = document.getElementById('markAllReadBtn');

    function renderFeed() {
        if (!listContainer) return;

        const unreadCount = notificationsData.filter(n => n.unread).length;
        const topBadge = document.getElementById('unreadCountBadge');
        const sidebarBadge = document.getElementById('sidebarNotificationBadge');

        if (topBadge) topBadge.textContent = unreadCount;
        if (sidebarBadge) sidebarBadge.textContent = unreadCount;

        if (notificationsData.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state-notice">
                    <i class="fas fa-bell-slash"></i>
                    <p>No notifications at this time.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = notificationsData.map(item => `
            <div class="notification-item ${item.unread ? 'unread' : ''}" data-id="${item.id}">
                <div class="notification-icon-box ${item.iconType}">
                    <i class="fas ${item.icon}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-item-header">
                        <span class="notification-title">${item.title}</span>
                        <span class="notification-timestamp">${item.time}</span>
                    </div>
                    <p class="notification-text">${item.message}</p>
                </div>
            </div>
        `).join('');

        listContainer.querySelectorAll('.notification-item').forEach(el => {
            el.addEventListener('click', function () {
                const id = this.getAttribute('data-id');
                const notif = notificationsData.find(n => n.id === id);
                if (notif && notif.unread) {
                    notif.unread = false;
                    renderFeed();
                }
            });
        });
    }

    markAllBtn?.addEventListener('click', () => {
        notificationsData.forEach(n => n.unread = false);
        renderFeed();
    });

    renderFeed();
}