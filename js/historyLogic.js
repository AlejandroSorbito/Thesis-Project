/**
 * Activity History Controller
 * Kandili Workspace - DepEd Immutable Audit Ledger
 */

document.addEventListener('DOMContentLoaded', () => {
    initRoleRouting();
    initLogoutHandler();
    initHistoryFilters();
});

/* ==========================================================================
   1. Role-Aware Dynamic Navigation Routing (Bulletproof Back Button)
   ========================================================================== */
function initRoleRouting() {
    const params = new URLSearchParams(window.location.search);
    let origin = params.get('origin');

    // 1. Check URL param first, then sessionStorage, then referrer
    if (!origin) {
        origin = sessionStorage.getItem('kandili_user_role');
    }
    if (!origin) {
        const ref = (document.referrer || '').toLowerCase();
        if (ref.includes('admin')) {
            origin = 'admin';
        } else if (ref.includes('principal')) {
            origin = 'principal';
        } else {
            origin = 'teacher';
        }
    }

    // Lock in the active role
    sessionStorage.setItem('kandili_user_role', origin);

    // 2. Adjust Dashboard Destination Link
    const dashboardLink = document.getElementById('navDashboardLink');
    if (dashboardLink) {
        if (origin === 'admin') {
            dashboardLink.setAttribute('href', '../admin/admindashboard.html');
            dashboardLink.querySelector('span') && (dashboardLink.querySelector('span').textContent = 'Admin Console');
        } else if (origin === 'principal') {
            dashboardLink.setAttribute('href', '../principal/principaldashboard.html');
            dashboardLink.querySelector('span') && (dashboardLink.querySelector('span').textContent = 'Dashboard');
        } else {
            dashboardLink.setAttribute('href', '../teacher/teacherdashboard.html');
            dashboardLink.querySelector('span') && (dashboardLink.querySelector('span').textContent = 'Dashboard');
        }
    }

    // 3. Preserve ?origin= on ALL sidebar links so clicking them doesn't drop role
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

    // 4. Safe Back Button Handler
    const backBtn = document.getElementById('navBackBtn');
    if (backBtn) {
        backBtn.removeAttribute('onclick');
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();

            let targetDashboard = '../teacher/teacherdashboard.html';
            const currentRole = (sessionStorage.getItem('kandili_user_role') || origin || '').toLowerCase();
            if (currentRole === 'admin') targetDashboard = '../admin/admindashboard.html';
            else if (currentRole === 'principal') targetDashboard = '../principal/principaldashboard.html';
            window.location.href = targetDashboard;
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
   3. Search & Activity Ledger Filters
   ========================================================================== */
function initHistoryFilters() {
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('filterType');
    const searchBtn = document.getElementById('searchBtn');
    const resetBtn = document.getElementById('resetBtn');
    const historyList = document.getElementById('historyList');
    const emptyState = document.getElementById('historyEmpty');
    const modeButtons = Array.from(document.querySelectorAll('[data-history-mode]'));

    if (!historyList) return;

    const items = Array.from(historyList.querySelectorAll('.history-item'));
    let activeMode = 'recent';

    function applyFilters() {
        const query = (searchInput?.value || '').trim().toLowerCase();
        const selectedCategory = (filterSelect?.value || 'all').toLowerCase();
        const role = (
            new URLSearchParams(window.location.search).get('origin') ||
            sessionStorage.getItem('kandili_user_role') ||
            'teacher'
        ).toLowerCase();
        const highPriorityActions = {
            teacher: new Set(['leave-approval', 'schedule-shift', 'assessment-submission', 'submission']),
            principal: new Set(['leave-approval', 'schedule-shift', 'assessment-submission', 'approval', 'review']),
            admin: new Set(['leave-approval', 'schedule-shift', 'assessment-submission', 'approval', 'review'])
        };
        const relevantActions = highPriorityActions[role] || highPriorityActions.teacher;
        const sortedItems = [...items].sort((a, b) => {
            const timestampA = Date.parse(a.dataset.timestamp || '');
            const timestampB = Date.parse(b.dataset.timestamp || '');
            return (Number.isFinite(timestampB) ? timestampB : 0) -
                (Number.isFinite(timestampA) ? timestampA : 0);
        });
        let visibleCount = 0;

        sortedItems.forEach(item => {
            const keywords = (item.getAttribute('data-keywords') || '').toLowerCase();
            const textContent = item.textContent.toLowerCase();
            const category = (item.getAttribute('data-category') || '').toLowerCase();
            const actionCategory = (item.getAttribute('data-action-category') || '').toLowerCase();
            const relevantRoles = (item.getAttribute('data-relevant-roles') || '')
                .toLowerCase()
                .split(',')
                .map(itemRole => itemRole.trim())
                .filter(Boolean);

            const matchesQuery = !query || keywords.includes(query) || textContent.includes(query);
            const matchesCategory = selectedCategory === 'all' || category === selectedCategory;
            const matchesMode = activeMode === 'recent' ||
                (relevantActions.has(actionCategory) && relevantRoles.includes(role));

            historyList.appendChild(item);
            if (matchesQuery && matchesCategory && matchesMode) {
                item.style.display = 'flex';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });

        if (emptyState) {
            emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
            const emptyMessage = emptyState.querySelector('p');
            if (emptyMessage && activeMode === 'relevant') {
                emptyMessage.textContent = 'No relevant activity found for your role and current filters.';
            } else if (emptyMessage) {
                emptyMessage.textContent = 'Try adjusting your search keywords or switching category filters.';
            }
        }
    }

    // Trigger filters on search click, enter key, and dropdown select change
    searchBtn?.addEventListener('click', applyFilters);
    searchInput?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') applyFilters();
    });
    filterSelect?.addEventListener('change', applyFilters);
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            activeMode = button.dataset.historyMode === 'relevant' ? 'relevant' : 'recent';
            modeButtons.forEach(modeButton => {
                const isActive = modeButton === button;
                modeButton.classList.toggle('is-active', isActive);
                modeButton.setAttribute('aria-pressed', String(isActive));
            });
            applyFilters();
        });
    });

    // Reset button
    resetBtn?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (filterSelect) filterSelect.value = 'all';
        activeMode = 'recent';
        modeButtons.forEach(button => {
            const isActive = button.dataset.historyMode === 'recent';
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        applyFilters();
    });

    applyFilters();
}