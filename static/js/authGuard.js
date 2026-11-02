// static/authGuard.js

// Helper to resolve relative path from current page's subfolder to target relative path in kandili
function getKandiliPath(targetSubfolder, targetPage) {
    const path = window.location.pathname.replace(/\\/g, '/');
    if (path.includes('/admin/') || path.includes('/general/') || path.includes('/principal/') || path.includes('/teacher/')) {
        const parts = path.split('/');
        const currentSubfolder = parts[parts.length - 2];
        if (currentSubfolder === targetSubfolder) {
            return targetPage;
        } else {
            return `../${targetSubfolder}/${targetPage}`;
        }
    }
    return `../${targetSubfolder}/${targetPage}`;
}

async function checkAuthAndRole(requiredRole) {
    if (!window.supabaseClient) return;

    // 1. Check active session
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();

    if (sessionError || !session) {
        console.warn("No active session. Redirecting to login.");
        window.location.href = getKandiliPath('general', 'login.html');
        return;
    }

    const userId = session.user.id;

    // 2. Fetch role from profiles
    const { data: profile, error: profileError } = await window.supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
        console.error("Could not verify user profile.");
        window.location.href = getKandiliPath('general', 'login.html');
        return;
    }

    const rawRole = profile.role || '';
    const userRole = rawRole.trim().toLowerCase();
    if (userRole) {
        sessionStorage.setItem('kandili_user_role', userRole);
    }

    // 3. Role enforcement check
    const allowedRoles = requiredRole ? requiredRole.split(',').map(r => r.trim().toLowerCase()).filter(Boolean) : [];
    const isAuthorized = requiredRole === 'any' || allowedRoles.includes(userRole);

    if (requiredRole && !isAuthorized) {
        console.warn(`Unauthorized Access. User is a ${userRole}, required ${requiredRole}.`);
        if (userRole === 'teacher') {
            window.location.href = getKandiliPath('teacher', 'teacherdashboard.html');
        } else if (userRole === 'principal') {
            window.location.href = getKandiliPath('principal', 'principaldashboard.html');
        } else if (userRole === 'admin') {
            window.location.href = getKandiliPath('admin', 'admindashboard.html');
        } else {
            window.location.href = getKandiliPath('general', 'login.html');
        }
        return;
    }

    // 4. Adapt Burger Menu links dynamically based on user role
    adaptNavMenuForRole(userRole);

    // Verification PASSED! Safe to reveal the page
    document.body.classList.remove('protected-page');
    document.body.style.display = 'block';
}

// Dynamically filter burger menu links based on the user's role
function adaptNavMenuForRole(role) {
    const themeNavMenu = document.getElementById('themeNavMenu');
    if (!themeNavMenu) return;

    const links = themeNavMenu.querySelectorAll('a');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        if (role === 'teacher') {
            // Hide Principal / Admin links for Teachers
            if (href.includes('principaldashboard.html') || href.includes('admindashboard.html') || href.includes('principalprofilepage.html')) {
                link.style.display = 'none';
            } else {
                link.style.display = 'flex';
                if (href.includes('teacherdashboard.html')) {
                    link.href = getKandiliPath('teacher', 'teacherdashboard.html');
                    link.innerHTML = '<i class="fas fa-chart-line"></i> Teacher Dashboard';
                }
                if (href.includes('teacherprofilepage.html')) {
                    link.href = getKandiliPath('teacher', 'teacherprofilepage.html');
                    link.innerHTML = '<i class="fas fa-user"></i> My Profile';
                }
                if (href.includes('message.html')) link.href = getKandiliPath('general', 'message.html');
                if (href.includes('notification.html')) link.href = getKandiliPath('general', 'notification.html');
                if (href.includes('history.html')) link.href = getKandiliPath('general', 'history.html');
                if (href.includes('calendar.html')) link.href = getKandiliPath('general', 'calendar.html');
                if (href.includes('settings.html')) link.href = getKandiliPath('general', 'settings.html');
            }
        } else if (role === 'principal') {
            // Hide Teacher / Admin links for Principals
            if (href.includes('teacherdashboard.html') || href.includes('admindashboard.html') || href.includes('teacherprofilepage.html')) {
                link.style.display = 'none';
            } else {
                link.style.display = 'flex';
                if (href.includes('principaldashboard.html')) {
                    link.href = getKandiliPath('principal', 'principaldashboard.html');
                    link.innerHTML = '<i class="fas fa-chart-pie"></i> Principal Dashboard';
                }
                if (href.includes('principalprofilepage.html')) {
                    link.href = getKandiliPath('principal', 'principalprofilepage.html');
                    link.innerHTML = '<i class="fas fa-user"></i> My Profile';
                }
                if (href.includes('message.html')) link.href = getKandiliPath('general', 'message.html');
                if (href.includes('notification.html')) link.href = getKandiliPath('general', 'notification.html');
                if (href.includes('history.html')) link.href = getKandiliPath('general', 'history.html');
                if (href.includes('calendar.html')) link.href = getKandiliPath('general', 'calendar.html');
                if (href.includes('settings.html')) link.href = getKandiliPath('general', 'settings.html');
            }
        } else if (role === 'admin') {
            if (href.includes('teacherdashboard.html') || href.includes('principaldashboard.html')) {
                link.style.display = 'none';
            } else {
                link.style.display = 'flex';
                if (href.includes('admindashboard.html')) link.href = getKandiliPath('admin', 'admindashboard.html');
                if (href.includes('message.html')) link.href = getKandiliPath('general', 'message.html');
                if (href.includes('notification.html')) link.href = getKandiliPath('general', 'notification.html');
                if (href.includes('history.html')) link.href = getKandiliPath('general', 'history.html');
                if (href.includes('calendar.html')) link.href = getKandiliPath('general', 'calendar.html');
                if (href.includes('settings.html')) link.href = getKandiliPath('general', 'settings.html');
            }
        }
    });
}

// Live Real-Time Header Clock & Calendar
function initRealtimeHeaderClock() {
    function updateClock() {
        const dateElement = document.querySelector('.theme-nav__date, #navDateDisplay, #settingsDate');
        if (!dateElement) return;

        const now = new Date();
        const options = { month: 'long', day: 'numeric', year: 'numeric' };
        const dateString = now.toLocaleDateString('en-US', options);
        const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        dateElement.innerHTML = `<i class="far fa-calendar-alt"></i> ${dateString} | ${timeString}`;
    }

    updateClock();
    setInterval(updateClock, 1000);
}

// Burger Navigation Menu Handler
function initBurgerMenu() {
    const burgerMenuBtn = document.getElementById('burgerMenuBtn');
    const themeNavMenu  = document.getElementById('themeNavMenu');

    if (burgerMenuBtn && themeNavMenu) {
        if (burgerMenuBtn.dataset.burgerBound === 'true') return;
        burgerMenuBtn.dataset.burgerBound = 'true';

        burgerMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = themeNavMenu.classList.toggle('active');
            burgerMenuBtn.setAttribute('aria-expanded', String(isOpen));
        });

        document.addEventListener('click', (event) => {
            if (!themeNavMenu.contains(event.target) && !burgerMenuBtn.contains(event.target)) {
                themeNavMenu.classList.remove('active');
                burgerMenuBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

// Auto-run auth guard based on data-allowed-roles on script tag
function autoRunAuthGuard() {
    initRealtimeHeaderClock();
    initBurgerMenu();

    const scriptTag = document.querySelector('script[data-allowed-roles]');
    if (scriptTag) {
        const requiredRole = scriptTag.getAttribute('data-allowed-roles');
        checkAuthAndRole(requiredRole);
    } else {
        if (window.supabaseClient) {
            window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (session) {
                    window.supabaseClient.from('profiles').select('role').eq('id', session.user.id).single()
                        .then(({ data: profile }) => {
                            if (profile) adaptNavMenuForRole(profile.role);
                        });
                }
            });
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoRunAuthGuard);
} else {
    autoRunAuthGuard();
}