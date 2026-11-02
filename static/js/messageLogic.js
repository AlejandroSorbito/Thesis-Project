// static/messageLogic.js

let currentMessageTab = 'inbox';

document.addEventListener('DOMContentLoaded', async () => {
    updateSidebarDashboardLink();
    await populateRecipientDropdown();
    await loadMessages(currentMessageTab);
    await updateUnreadCount();
    setupComposeForm();

    document.getElementById('tabInboxBtn')?.addEventListener('click', () => window.switchMessageTab('inbox'));
    document.getElementById('tabSentBtn')?.addEventListener('click', () => window.switchMessageTab('sent'));
    document.getElementById('closeModalIconBtn')?.addEventListener('click', () => window.closeMessageModal());
    document.getElementById('closeModalBtn')?.addEventListener('click', () => window.closeMessageModal());
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

// Unread Badge Count Update
async function updateUnreadCount() {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        const { count, error } = await window.supabaseClient
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('recipient_id', session.user.id)
            .eq('is_read', false);

        if (!error && typeof count === 'number') {
            const badge = document.getElementById('unreadBadge');
            const tabBadge = document.getElementById('inboxTabBadge');

            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }
            if (tabBadge) {
                tabBadge.textContent = count;
                tabBadge.style.display = count > 0 ? 'inline-block' : 'none';
            }
        }
    } catch (err) {
        console.error("Failed to update unread badge:", err);
    }
}

// Tab Switcher
window.switchMessageTab = async function(tab) {
    currentMessageTab = tab;

    const inboxBtn = document.getElementById('tabInboxBtn');
    const sentBtn = document.getElementById('tabSentBtn');

    if (tab === 'inbox') {
        if (inboxBtn) inboxBtn.className = 'btn-blue';
        if (sentBtn) sentBtn.className = 'btn-outline';
    } else {
        if (inboxBtn) inboxBtn.className = 'btn-outline';
        if (sentBtn) sentBtn.className = 'btn-blue';
    }

    await loadMessages(currentMessageTab);
    await updateUnreadCount();
};

// Modal Functions
window.openMessageModal = async function(msg, personName, prefix) {
    const modal = document.getElementById('messageModal');
    const modalSender = document.getElementById('modalSender');
    const modalRole = document.getElementById('modalRole');
    const modalTime = document.getElementById('modalTime');
    const modalBody = document.getElementById('modalBody');

    if (!modal) return;

    const formattedTime = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedDate = new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    if (modalSender) modalSender.textContent = `${prefix}${personName}`;
    if (modalRole) modalRole.textContent = prefix.includes('From') ? 'Received Message' : 'Sent Message';
    if (modalTime) modalTime.textContent = `${formattedDate} | ${formattedTime}`;
    if (modalBody) modalBody.textContent = msg.content;

    modal.style.display = 'flex';

    // Mark as read in database if unread inbox message
    if (!msg.is_read && prefix.includes('From')) {
        await window.supabaseClient
            .from('messages')
            .update({ is_read: true })
            .eq('id', msg.id);
        msg.is_read = true;
        await updateUnreadCount();
    }
};

window.closeMessageModal = function() {
    const modal = document.getElementById('messageModal');
    if (modal) modal.style.display = 'none';
};

// 1. Populate Recipients Dropdown (Only Registered Users)
async function populateRecipientDropdown() {
    try {
        const select = document.getElementById('recipient');
        if (!select) return;

        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        // Fetch all registered user profiles except self
        const { data: profiles, error } = await window.supabaseClient
            .from('profiles')
            .select('id, first_name, last_name, role, department')
            .neq('id', session.user.id);

        if (error) {
            console.error("Error loading profiles for recipient dropdown:", error.message);
            return;
        }

        // Reset to default placeholder
        select.innerHTML = `<option value="">-- Select Recipient --</option>`;

        if (profiles && profiles.length > 0) {
            window.globalProfilesCache = window.globalProfilesCache || {};
            profiles.forEach(p => {
                window.globalProfilesCache[p.id] = p;
                const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
                const roleLower = (p.role || '').toLowerCase();
                const roleTitle = roleLower === 'principal' ? 'Principal' : (roleLower === 'admin' ? 'Administrator' : 'Teacher');
                const displayName = fullName ? `${fullName} (${roleTitle})` : `${roleTitle}'s Office`;

                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = displayName;
                select.appendChild(opt);
            });
        } else {
            const opt = document.createElement('option');
            opt.value = "";
            opt.disabled = true;
            opt.textContent = "No other registered users found";
            select.appendChild(opt);
        }
    } catch (err) {
        console.error("Failed to populate recipients:", err);
    }
}

// 2. Load Messages (Inbox vs Sent)
async function loadMessages(tab = 'inbox') {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        const messageList = document.querySelector('.message-list');
        if (!messageList) return;

        messageList.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>`;

        let query = window.supabaseClient.from('messages').select('*');
        if (tab === 'inbox') {
            query = query.eq('recipient_id', session.user.id);
        } else {
            query = query.eq('sender_id', session.user.id);
        }

        const { data: messages, error } = await query.order('created_at', { ascending: false });

        if (error) {
            console.error(`Error loading ${tab} messages:`, error.message);
            messageList.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #ef4444;">Failed to load messages.</div>`;
            return;
        }

        if (!messages || messages.length === 0) {
            const emptyText = tab === 'inbox' ? 'No received messages in your inbox.' : 'No sent messages in your outbox.';
            messageList.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #64748b;">${emptyText}</div>`;
            return;
        }

        // Fetch all user profiles for display
        const { data: userProfiles, error: pError } = await window.supabaseClient
            .from('profiles')
            .select('id, first_name, last_name, role, department');

        if (pError) {
            console.error("Error fetching sender profiles:", pError.message);
        }

        const profileMap = {};
        const allProfiles = userProfiles || [];

        if (window.globalProfilesCache) {
            Object.values(window.globalProfilesCache).forEach(cp => {
                if (!allProfiles.some(p => p.id === cp.id)) {
                    allProfiles.push(cp);
                }
            });
        }

        allProfiles.forEach(p => {
            const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
            const roleLower = (p.role || '').toLowerCase();
            const roleTitle = roleLower === 'principal' ? 'Principal' : (roleLower === 'admin' ? 'Administrator' : 'Teacher');

            if (fullName.length > 0) {
                profileMap[p.id] = `${fullName} (${roleTitle})`;
            } else if (p.email) {
                profileMap[p.id] = `${p.email} (${roleTitle})`;
            } else {
                profileMap[p.id] = `${roleTitle}'s Office`;
            }
        });

        // Find principal name from database or local cache for inbox messages
        const savedPrincipalName = localStorage.getItem('kandili_principal_name');
        const principalProfile = allProfiles.find(p => (p.role || '').toLowerCase() === 'principal');
        
        let foundPrincipalName = "";
        if (principalProfile && (principalProfile.first_name || principalProfile.last_name)) {
            foundPrincipalName = `${principalProfile.first_name || ''} ${principalProfile.last_name || ''}`.trim();
            try { localStorage.setItem('kandili_principal_name', foundPrincipalName); } catch(e){}
        } else if (savedPrincipalName) {
            foundPrincipalName = savedPrincipalName;
        }

        const defaultPrincipalName = foundPrincipalName ? `${foundPrincipalName} (Principal)` : "Jim Hawkins (Principal)";

        messageList.innerHTML = '';

        // Render Message Cards
        messages.forEach(msg => {
            const personId = tab === 'inbox' ? msg.sender_id : msg.recipient_id;
            const defaultName = tab === 'inbox' ? defaultPrincipalName : "Faculty Member";
            const personName = profileMap[personId] || defaultName;
            const prefix = tab === 'inbox' ? 'From: ' : 'To: ';
            const formattedTime = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const formattedDate = new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

            const item = document.createElement('div');
            item.className = `message-item ${tab === 'inbox' && !msg.is_read ? 'unread' : ''}`;
            item.style.cssText = 'cursor: pointer; padding: 1rem; border-radius: 8px; margin-bottom: 0.75rem; border: 1px solid #e2e8f0; background: #ffffff; transition: all 0.15s ease;';
            item.innerHTML = `
                <div class="message-meta" style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: #0f172a; font-size: 0.95rem;">${prefix}${personName}</strong>
                    <span style="font-size: 0.78rem; color: #64748b;">${formattedDate} | ${formattedTime}</span>
                </div>
                <p style="margin-top: 0.4rem; color: #334155; white-space: pre-line; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.4; font-size: 0.9rem;">${msg.content}</p>
                <div style="margin-top: 0.5rem; font-size: 0.78rem; color: #0038A8; font-weight: 600;"><i class="fas fa-eye"></i> Click to read full message</div>
            `;

            item.addEventListener('click', () => {
                openMessageModal(msg, personName, prefix);
                item.classList.remove('unread');
            });

            messageList.appendChild(item);
        });
    } catch (err) {
        console.error("Failed to fetch messages:", err);
    }
}

// 3. Setup Compose Form
function setupComposeForm() {
    const form = document.querySelector('.message-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const recipientSelect = document.getElementById('recipient');
        const subjectText = document.getElementById('subject')?.value.trim();
        const messageText = document.getElementById('message')?.value.trim();
        const recipientId = recipientSelect?.value;

        if (!recipientId || !messageText) {
            alert("Please select a recipient and enter a message.");
            return;
        }

        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.innerText = "Sending...";
        submitBtn.disabled = true;

        const fullContent = subjectText ? `📌 ${subjectText}\n${messageText}` : messageText;

        const { error } = await window.supabaseClient
            .from('messages')
            .insert({
                sender_id: session.user.id,
                recipient_id: recipientId,
                content: fullContent
            });

        submitBtn.innerText = "Send Message";
        submitBtn.disabled = false;

        if (error) {
            alert("Failed to send message: " + error.message);
        } else {
            alert("Message sent successfully!");
            document.getElementById('message').value = '';
            if (document.getElementById('subject')) document.getElementById('subject').value = '';
            
            // Switch to Sent tab to show the newly sent message
            if (window.switchMessageTab) {
                await window.switchMessageTab('sent');
            } else {
                await loadMessages(currentMessageTab);
            }
        }
    });
}