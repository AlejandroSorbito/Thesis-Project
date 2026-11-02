/**
 * Messages Center Controller
 * Kandili Workspace - Shared Role Messaging Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    initRoleRouting();
    initLogoutHandler();
    initTabSwitching();
    initModalControls();
    loadMessages();
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
        { id: 'navMessagesLink', file: 'message.html' },
        { id: 'navNotificationsLink', file: 'notification.html' },
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
   3. Tabs Switching & Messaging Feed
   ========================================================================== */
let activeTab = 'inbox';

const mockMessages = {
    inbox: [
        {
            id: 'msg-1',
            sender: 'Principal Mylene Panaguiton',
            role: 'School Head',
            time: 'Today, 10:15 AM',
            subject: 'Mid-Year Instructional Workload Review Notice',
            body: 'Good morning faculty. Please ensure your respective eSF7 teaching loads and ancillary task distributions are verified before Friday.',
            unread: true
        },
        {
            id: 'msg-2',
            sender: 'Department Head (Science)',
            role: 'Academic Department',
            time: 'Yesterday, 3:30 PM',
            subject: 'LAC Session Materials & Room Assignment',
            body: 'Colleagues, the presentation slides for tomorrow’s Learning Action Cell are available in the shared folder. See you in Room 204.',
            unread: false
        }
    ],
    sent: [
        {
            id: 'msg-3',
            sender: 'You',
            recipient: 'Principal Mylene Panaguiton',
            role: 'Direct Message',
            time: 'July 18, 2026',
            subject: 'Clarification regarding SDRRM Ancillary Load',
            body: 'Dear Principal, acknowledging receipt of the latest schedule. Inquiring regarding the 5-hour coordination allotment for DRRM.',
            unread: false
        }
    ]
};

function initTabSwitching() {
    const tabInboxBtn = document.getElementById('tabInboxBtn');
    const tabSentBtn = document.getElementById('tabSentBtn');
    const refreshBtn = document.getElementById('refreshMessagesBtn');

    tabInboxBtn?.addEventListener('click', () => {
        activeTab = 'inbox';
        tabInboxBtn.classList.add('active');
        tabSentBtn?.classList.remove('active');
        renderMessageList();
    });

    tabSentBtn?.addEventListener('click', () => {
        activeTab = 'sent';
        tabSentBtn.classList.add('active');
        tabInboxBtn?.classList.remove('active');
        renderMessageList();
    });

    refreshBtn?.addEventListener('click', () => {
        loadMessages();
    });

    document.getElementById('composeMessageForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const recipient = document.getElementById('recipient')?.value;
        const subject = document.getElementById('subject')?.value;
        const message = document.getElementById('message')?.value;

        if (!recipient || !subject || !message) return;

        mockMessages.sent.unshift({
            id: `msg-${Date.now()}`,
            sender: 'You',
            recipient: recipient,
            role: 'Official Broadcast',
            time: 'Just now',
            subject: subject,
            body: message,
            unread: false
        });

        alert("Message dispatched securely through the DepEd internal workspace channel.");
        e.target.reset();

        if (activeTab === 'sent') {
            renderMessageList();
        }
    });
}

function loadMessages() {
    renderMessageList();
}

function renderMessageList() {
    const container = document.getElementById('messageListContainer');
    if (!container) return;

    const list = mockMessages[activeTab] || [];
    const unreadCount = mockMessages.inbox.filter(m => m.unread).length;

    const inboxBadge = document.getElementById('inboxTabBadge');
    const headerBadge = document.getElementById('unreadBadge');
    const sidebarBadge = document.getElementById('sidebarUnreadBadge');

    if (inboxBadge) inboxBadge.textContent = unreadCount;
    if (headerBadge) headerBadge.textContent = unreadCount;
    if (sidebarBadge) sidebarBadge.textContent = unreadCount;

    if (list.length === 0) {
        container.innerHTML = `
            <div class="message-empty-placeholder">
                <i class="fas fa-inbox"></i>
                <p>No ${activeTab} messages available.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(item => `
        <div class="message-item ${item.unread ? 'unread' : ''}" data-id="${item.id}">
            <div class="message-item-header">
                <span class="sender-name">${item.sender}</span>
                <span class="msg-time">${item.time}</span>
            </div>
            <div class="msg-subject">${item.subject}</div>
            <div class="msg-preview">${item.body.substring(0, 95)}...</div>
        </div>
    `).join('');

    container.querySelectorAll('.message-item').forEach(el => {
        el.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            const found = list.find(m => m.id === id);
            if (found) {
                found.unread = false;
                openMessageModal(found);
                renderMessageList();
            }
        });
    });
}

/* ==========================================================================
   4. Modal Show / Hide
   ========================================================================== */
function initModalControls() {
    const modal = document.getElementById('messageModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const closeIcon = document.getElementById('closeModalIconBtn');

    const closeModal = () => {
        modal?.classList.remove('active');
        document.body.style.overflow = '';
    };

    closeBtn?.addEventListener('click', closeModal);
    closeIcon?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function openMessageModal(message) {
    const modal = document.getElementById('messageModal');
    if (!modal) return;

    document.getElementById('modalSender').textContent = message.sender;
    document.getElementById('modalRole').textContent = message.role || 'DepEd Member';
    document.getElementById('modalTime').textContent = message.time;
    document.getElementById('modalSubject').textContent = message.subject;
    document.getElementById('modalBody').textContent = message.body;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}