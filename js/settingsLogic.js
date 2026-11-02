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
        if (ref.includes('admin')) {
            origin = 'admin';
        } else if (ref.includes('principal')) {
            origin = 'principal';
        } else {
            origin = 'teacher';
        }
    }

    sessionStorage.setItem('kandili_user_role', origin);

    // 2. Adjust dashboard destination
    const dashboardLink = document.getElementById('navDashboardLink');
    if (dashboardLink) {
        if (origin === 'admin') {
            dashboardLink.setAttribute('href', '../admin/admindashboard.html');
            const label = dashboardLink.querySelector('span');
            if (label) label.textContent = 'Admin Console';
        } else if (origin === 'principal') {
            dashboardLink.setAttribute('href', '../principal/principaldashboard.html');
            const label = dashboardLink.querySelector('span');
            if (label) label.textContent = 'Dashboard';
        } else {
            dashboardLink.setAttribute('href', '../teacher/teacherdashboard.html');
            const label = dashboardLink.querySelector('span');
            if (label) label.textContent = 'Dashboard';
        }
    }

    // Direct profile edit link based on role
    const quickProfileLink = document.getElementById('quickProfileLink');
    if (quickProfileLink) {
        if (origin === 'admin') {
            quickProfileLink.setAttribute('href', '../admin/admindashboard.html');
        } else if (origin === 'principal') {
            quickProfileLink.setAttribute('href', '../principal/principalprofilepage.html');
        } else {
            quickProfileLink.setAttribute('href', '../teacher/teacherprofilepage.html');
        }
    }

    // Preserve ?origin= on sibling general navigation links
    const linksToPreserve = [
        { id: 'navSettingsLink', file: 'settings.html' },
        { id: 'navNotificationsLink', file: 'notification.html' },
        { id: 'navMessagesLink', file: 'message.html' },
        { id: 'navCalendarLink', file: 'calendar.html' },
        { id: 'navHistoryLink', file: 'history.html' }
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
            if (currentRole === 'admin') {
                targetDashboard = '../admin/admindashboard.html';
            } else if (currentRole === 'principal') {
                targetDashboard = '../principal/principaldashboard.html';
            }
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
   6. Account Profile Details (Added Admin Scope)
   ========================================================================== */
function loadProfileIdent() {
    const origin = sessionStorage.getItem('kandili_user_role') || 'teacher';
    const emailElem = document.getElementById('accountEmail');
    const roleElem = document.getElementById('accountRole');

    if (origin === 'admin') {
        if (emailElem) emailElem.textContent = 'superadmin.division@deped.gov.ph';
        if (roleElem) roleElem.textContent = 'Superadmin / Division IT Officer';
    } else if (origin === 'principal') {
        if (emailElem) emailElem.textContent = 'mylene.panaguiton@deped.gov.ph';
        if (roleElem) roleElem.textContent = 'School Head / Principal';
    } else {
        if (emailElem) emailElem.textContent = 'sarah.cruz@deped.gov.ph';
        if (roleElem) roleElem.textContent = 'Teacher / Class Adviser';
    }
}