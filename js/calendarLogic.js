/**
 * Master Calendar Management Engine
 * Kandili Workspace - DepEd Master Calendar
 */

let currentDate = new Date();
let selectedDate = new Date(currentDate);

let eventsData = [
    {
        id: 'evt-1',
        title: 'Midyear InSET Workshop (Day 1)',
        type: 'SCHOOL EVENT',
        audience: 'All Faculty',
        date: '2026-09-16',
        startTime: '08:00',
        endTime: '12:00',
        daysSpan: 1,
        createdByRole: 'principal'
    },
    {
        id: 'evt-2',
        title: 'eSF7 Load Audit Submission Deadline',
        type: 'DEPED REQUIREMENTS',
        audience: 'Department Heads',
        date: '2026-09-21',
        startTime: '17:00',
        endTime: '18:00',
        daysSpan: 1
    },
    {
        id: 'evt-3',
        title: 'Science Dept LAC Session',
        type: 'PERSONAL GROWTH',
        audience: 'Junior High School',
        date: '2026-09-24',
        startTime: '13:00',
        endTime: '15:00',
        daysSpan: 1
    },
    {
        id: 'evt-4',
        title: 'Division Evaluator Visit',
        type: 'ACADEMIC ASSESSMENT',
        audience: 'All Faculty',
        date: '2026-09-28',
        startTime: '09:00',
        endTime: '12:00',
        daysSpan: 1
    },
    {
        id: 'evt-5',
        title: 'SDRRM and Inventory Coordination',
        type: 'ANCILLARY TASK',
        audience: 'Ancillary Coordinators',
        date: '2026-09-30',
        startTime: '13:00',
        endTime: '15:00',
        daysSpan: 1
    }
];

function getDashboardRole() {
    const roleHints = [
        new URLSearchParams(window.location.search).get('origin'),
        document.referrer,
        localStorage.getItem('kandili_role'),
        sessionStorage.getItem('kandili_role'),
        localStorage.getItem('kandili_user_role'),
        sessionStorage.getItem('kandili_user_role')
    ];
    const roleHint = roleHints
        .map(hint => hint?.toLowerCase() || '')
        .find(hint => hint.includes('teacher') || hint.includes('principal'));

    return roleHint?.includes('teacher') ? 'teacher' : 'principal';
}

function getChipCategoryClass(type) {
    const categoryClasses = {
        'ACADEMIC ASSESSMENT': 'chip-deadline',
        'DEPED REQUIREMENTS': 'chip-evaluation',
        'PERSONAL GROWTH': 'chip-appointment',
        'ANCILLARY TASK': 'chip-department',
        'SCHOOL EVENT': 'chip-schoolwide'
    };

    return categoryClasses[type] || 'chip-appointment';
}

document.addEventListener('DOMContentLoaded', () => {
    initCalendar();
    initTopNavActions();
    initFormHandlers();
    configureEventFormForRole();
    initLogoutHandler();
});

function initCalendar() {
    // Keep the sidebar dashboard route aligned with the role-aware back button.
    const userRole = getDashboardRole();
    const dashLink = document.getElementById('navDashboardLink');
    if (dashLink) {
        dashLink.href = userRole === 'teacher' ? '../teacher/teacherdashboard.html' : '../principal/principaldashboard.html';
    }

    const navDateDisplay = document.getElementById('navDateDisplay');
    if (navDateDisplay) {
        navDateDisplay.innerHTML = `<i class="far fa-calendar-alt"></i> ${new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })}`;
    }

    renderCalendar();
    updateSidebarSelectedDay();
    updateSidebarStats();

    // Month Navigation triggers
    document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
        updateSidebarStats();
    });

    document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
        updateSidebarStats();
    });

    document.getElementById('todayBtn')?.addEventListener('click', () => {
        currentDate = new Date();
        selectedDate = new Date(currentDate);
        renderCalendar();
        updateSidebarSelectedDay();
        updateSidebarStats();
    });

    // Open the event form and bring it into view for users below the calendar.
    document.getElementById('addEventBtn')?.addEventListener('click', () => {
        const form = document.getElementById('eventForm');
        form.reset();
        document.getElementById('eventId').value = '';
        document.getElementById('eventTargetDate').value = formatDate(selectedDate);
        document.getElementById('formHeader').textContent = 'Create New Event';
        document.getElementById('deleteEventBtn')?.classList.add('hidden');
        configureEventFormForRole();
        form.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
            document.getElementById('eventTitle').focus({ preventScroll: true });
        }, 300);
    });

    document.getElementById('cancelEventBtn')?.addEventListener('click', () => {
        document.getElementById('eventForm')?.classList.add('hidden');
    });
}

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function configureEventFormForRole() {
    const role = getDashboardRole();
    const eventType = document.getElementById('eventType');
    const audience = document.getElementById('targetAudience');
    const roleBadge = document.getElementById('userRoleBadge');

    if (roleBadge) {
        roleBadge.innerHTML = `<i class="fas fa-user-shield"></i> Active Role: ${role === 'teacher' ? 'Teacher' : 'Principal'}`;
    }

    if (!eventType || !audience) return;

    const isTeacher = role === 'teacher';
    Array.from(eventType.options).forEach(option => {
        option.hidden = isTeacher && option.value !== 'PERSONAL GROWTH';
    });
    Array.from(audience.options).forEach(option => {
        option.hidden = isTeacher && option.value !== 'My Classroom';
    });

    eventType.disabled = isTeacher;
    audience.disabled = isTeacher;
    if (isTeacher) {
        eventType.value = 'PERSONAL GROWTH';
        audience.value = 'My Classroom';
    }
}

function initTopNavActions() {
    const backBtn = document.getElementById('navBackBtn');
    backBtn?.addEventListener('click', handleRoleAwareBack);

    document.getElementById('navRefreshBtn')?.addEventListener('click', () => {
        window.location.reload();
    });
}

function renderCalendar() {
    const grid = document.getElementById('calendarMonthGrid');
    const monthLabel = document.getElementById('monthLabel');
    if (!grid || !monthLabel) return;

    grid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const today = new Date();

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    monthLabel.textContent = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const prevLastDay = new Date(year, month, 0).getDate();

    // Previous month padding days
    for (let i = firstDayIndex; i > 0; i--) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day other-month';
        dayCell.innerHTML = `<span class="day-number">${prevLastDay - i + 1}</span>`;
        grid.appendChild(dayCell);
    }

    // Current month days
    for (let day = 1; day <= lastDay; day++) {
        const dayCell = document.createElement('div');
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        dayCell.className = 'calendar-day';
        if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
            dayCell.classList.add('today');
        }
        if (
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month &&
            selectedDate.getDate() === day
        ) {
            dayCell.classList.add('selected');
        }

        const eventsToday = eventsData.filter(e => e.date === dateStr);
        const chipsHtml = eventsToday.map(e => `
            <div class="event-chip ${getChipCategoryClass(e.type)}" title="${e.title} (${e.startTime})">
                ${e.title}
            </div>
        `).join('');

        dayCell.innerHTML = `
            <span class="day-number">${day}</span>
            <div class="calendar-day-events">${chipsHtml}</div>
        `;

        dayCell.addEventListener('click', () => {
            selectedDate = new Date(year, month, day);
            document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
            dayCell.classList.add('selected');
            updateSidebarSelectedDay();
        });

        grid.appendChild(dayCell);
    }

    // Next month padding days to complete 7-day grid rows
    const totalCells = firstDayIndex + lastDay;
    const remaining = 7 - (totalCells % 7);
    if (remaining < 7) {
        for (let i = 1; i <= remaining; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day other-month';
            dayCell.innerHTML = `<span class="day-number">${i}</span>`;
            grid.appendChild(dayCell);
        }
    }
}

function updateSidebarSelectedDay() {
    const label = document.getElementById('inspectorDateText');
    const container = document.getElementById('inspectorEventsList');
    if (!label || !container) return;

    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    label.textContent = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    const eventsToday = eventsData.filter(e => e.date === dateStr);
    if (eventsToday.length === 0) {
        container.innerHTML = '<p style="font-size: 0.8rem; color: #94a3b8; margin: 0;">No activities scheduled for this date.</p>';
        return;
    }

    container.innerHTML = eventsToday.map(e => `
        <div class="event-sidebar-item" onclick="openEventForEdit('${e.id}')">
            <strong>${e.title}</strong>
            <span><i class="far fa-clock"></i> ${e.startTime} - ${e.endTime} | ${e.audience}</span>
        </div>
    `).join('');
}

function updateSidebarStats() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    const monthEvents = eventsData.filter(e => e.date?.startsWith(monthPrefix));

    const total = document.getElementById('statTotalMonth');
    const schoolwide = document.getElementById('statSchoolwide');
    const department = document.getElementById('deptCount');
    if (total) total.textContent = monthEvents.length;
    if (schoolwide) schoolwide.textContent = monthEvents.filter(e => e.type === 'SCHOOL EVENT').length;
    if (department) {
        department.textContent = monthEvents.filter(
            e => e.type === 'ANCILLARY TASK' || e.type === 'PERSONAL GROWTH'
        ).length;
    }
}

window.openEventForEdit = function(id) {
    const event = eventsData.find(e => e.id === id);
    if (!event) return;
    if (getDashboardRole() === 'teacher' && event.createdByRole !== 'teacher') return;

    const form = document.getElementById('eventForm');
    form.classList.remove('hidden');

    document.getElementById('eventId').value = event.id;
    document.getElementById('eventTitle').value = event.title;
    const legacyTypeMap = {
        schoolwide: 'SCHOOL EVENT',
        department: 'PERSONAL GROWTH',
        deadline: 'DEPED REQUIREMENTS',
        evaluation: 'ACADEMIC ASSESSMENT',
        'school-event': 'SCHOOL EVENT',
        'personal-growth': 'PERSONAL GROWTH',
        'ancillary-task': 'ANCILLARY TASK',
        'academic-assessment': 'ACADEMIC ASSESSMENT',
        'deped-requirements': 'DEPED REQUIREMENTS'
    };
    document.getElementById('eventType').value = legacyTypeMap[event.type] || event.type;
    const legacyAudienceMap = {
        'Junior High School': 'Grades 4-6 Intermediate',
        'Department Heads': 'Ancillary Coordinators'
    };
    document.getElementById('targetAudience').value = legacyAudienceMap[event.audience] || event.audience;
    document.getElementById('eventStartTime').value = event.startTime;
    document.getElementById('eventEndTime').value = event.endTime;
    document.getElementById('eventDaysSpan').value = event.daysSpan || 1;
    document.getElementById('eventTargetDate').value = event.date || formatDate(selectedDate);
    configureEventFormForRole();

    document.getElementById('formHeader').textContent = 'Edit Event Details';
    document.getElementById('deleteEventBtn')?.classList.remove('hidden');
};

function initFormHandlers() {
    const form = document.getElementById('eventForm');
    form?.addEventListener('submit', (e) => {
        e.preventDefault();

        const id = document.getElementById('eventId').value;
        const title = document.getElementById('eventTitle').value.trim();
        const role = getDashboardRole();
        const type = role === 'teacher' ? 'PERSONAL GROWTH' : document.getElementById('eventType').value;
        const audience = role === 'teacher' ? 'My Classroom' : document.getElementById('targetAudience').value;
        const dateStr = document.getElementById('eventTargetDate').value;
        const startTime = document.getElementById('eventStartTime').value;
        const endTime = document.getElementById('eventEndTime').value;
        const daysSpan = parseInt(document.getElementById('eventDaysSpan').value, 10) || 1;

        if (!title || !dateStr) {
            form.reportValidity();
            return;
        }

        if (id) {
            // Edit existing
            const target = eventsData.find(e => e.id === id);
            if (target) {
                target.title = title;
                target.type = type;
                target.audience = audience;
                target.startTime = startTime;
                target.endTime = endTime;
                target.daysSpan = daysSpan;
                target.date = dateStr;
                target.createdByRole = role;
            }
        } else {
            // Create new
            eventsData.push({
                id: `evt-${Date.now()}`,
                title,
                type,
                audience,
                date: dateStr,
                startTime,
                endTime,
                daysSpan,
                createdByRole: role
            });
        }

        selectedDate = new Date(`${dateStr}T00:00:00`);
        currentDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        form.classList.add('hidden');
        renderCalendar();
        updateSidebarSelectedDay();
        updateSidebarStats();
    });

    document.getElementById('deleteEventBtn')?.addEventListener('click', () => {
        const id = document.getElementById('eventId').value;
        if (!id) return;
        const event = eventsData.find(e => e.id === id);
        if (getDashboardRole() === 'teacher' && event?.createdByRole !== 'teacher') return;

        if (confirm('Are you sure you want to remove this calendar entry?')) {
            eventsData = eventsData.filter(e => e.id !== id);
            document.getElementById('eventForm').classList.add('hidden');
            renderCalendar();
            updateSidebarSelectedDay();
            updateSidebarStats();
        }
    });
}

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

function handleRoleAwareBack(e) {
    if (e) e.preventDefault();
    const role = (sessionStorage.getItem('kandili_user_role') || getDashboardRole() || '').toLowerCase();
    if (role === 'admin') {
        window.location.href = '../admin/admindashboard.html';
    } else if (role === 'principal') {
        window.location.href = '../principal/principaldashboard.html';
    } else {
        window.location.href = '../teacher/teacherdashboard.html';
    }
}