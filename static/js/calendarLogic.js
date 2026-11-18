// static/calendarLogic.js

(function() {
    let eventsList = [];
    let currentDate = new Date();
    let selectedDate = new Date();
    let userRole = 'teacher';
    let userId = null;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            await initCalendar();
            setupEventListeners();
        });
    } else {
        initCalendar().then(() => setupEventListeners());
    }

    async function initCalendar() {
        // 0. Resolve role immediately from sessionStorage or query param fallback
        let sessionRole = sessionStorage.getItem('kandili_user_role') || new URLSearchParams(window.location.search).get('role') || 'Teacher';
        userRole = sessionRole.toLowerCase();
        updateUserRoleBadge(userRole);
        updateCategoryDropdown();

        // 1. Render calendar grid & live header clock immediately with current date
        updateHeaderClock();
        renderCalendar();

        // 2. Safely check auth & fetch events in background
        try {
            if (window.supabaseClient && window.supabaseClient.auth) {
                const { data } = await window.supabaseClient.auth.getSession();
                const session = data ? data.session : null;
                if (session) {
                    userId = session.user.id;
                    const { data: profile } = await window.supabaseClient
                        .from('profiles')
                        .select('role')
                        .eq('id', userId)
                        .maybeSingle();

                    if (profile && profile.role) {
                        userRole = profile.role.toLowerCase();
                        sessionStorage.setItem('kandili_user_role', profile.role);
                        updateUserRoleBadge(userRole);
                        updateCategoryDropdown();
                    }
                }
            }
        } catch (err) {
            console.warn("Calendar auth notice:", err);
        }

        await fetchCalendarEvents();
        renderCalendar();
    }

    function updateUserRoleBadge(role) {
        const badge = document.getElementById('userRoleBadge');
        if (!badge) return;
        const rawRole = (role || 'Teacher').trim();
        const displayRole = rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase();
        badge.innerHTML = `<i class="fas fa-user-shield"></i> Active Role: ${displayRole}`;
    }

    function updateHeaderClock() {
        const navDate = document.getElementById('navDateDisplay') || document.querySelector('.theme-nav__date');
        if (!navDate) return;

        function tick() {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            navDate.innerHTML = `<i class="far fa-calendar-alt"></i> ${dateStr} | ${timeStr}`;
        }
        tick();
        setInterval(tick, 1000);
    }

    function updateCategoryDropdown() {
        const eventTypeSelect = document.getElementById('eventType');
        if (!eventTypeSelect) return;

        if (userRole === 'principal' || userRole === 'admin') {
            eventTypeSelect.innerHTML = `
                <option value="schoolwide">Schoolwide Event (Visible to entire school)</option>
                <option value="personal">Personal Note (Visible only to you)</option>
            `;
        } else {
            eventTypeSelect.innerHTML = `
                <option value="personal">Personal Event (Visible only to you)</option>
            `;
        }
    }

    function formatTime12h(time24) {
        if (!time24) return '';
        const parts = time24.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1] || '0', 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    function calculateDurationHrs(start24, end24) {
        if (!start24 || !end24) return '';
        const [h1, m1] = start24.split(':').map(Number);
        const [h2, m2] = end24.split(':').map(Number);
        let diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diffMins <= 0) diffMins += 24 * 60;
        const hrs = (diffMins / 60).toFixed(1).replace(/\.0$/, '');
        return `${hrs} hr${hrs === '1' ? '' : 's'}`;
    }

    // Fetch Events from Supabase (with automatic sample & localStorage fallback)
    async function fetchCalendarEvents() {
        const yearStr = currentDate.getFullYear();
        const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');

        const defaultSampleEvents = [
            { id: 'sample-1', date: `${yearStr}-${monthStr}-05`, title: 'Division Academic Evaluation', type: 'schoolwide', time: '08:00 AM - 11:30 AM (3.5 hrs)', target: 'All Faculty' },
            { id: 'sample-2', date: `${yearStr}-${monthStr}-14`, title: 'Grade Level Learning Action Cell (LAC)', type: 'schoolwide', time: '01:00 PM - 03:00 PM (2 hrs)', target: 'Grade 2 Teachers' },
            { id: 'sample-3', date: `${yearStr}-${monthStr}-22`, title: 'Parent-Teacher Conference (PTC)', type: 'personal', time: '09:00 AM - 11:00 AM (2 hrs)', target: 'Grade 2 - Sampaguita' }
        ];

        let localCustom = [];
        try {
            const stored = localStorage.getItem('kandili_custom_events');
            if (stored) localCustom = JSON.parse(stored);
        } catch(e){}

        let deletedIds = [];
        try {
            const delStored = localStorage.getItem('kandili_deleted_events');
            if (delStored) deletedIds = JSON.parse(delStored);
        } catch(e){}

        const activeSamples = defaultSampleEvents.filter(e => !deletedIds.includes(String(e.id)));
        const activeCustom = localCustom.filter(e => !deletedIds.includes(String(e.id)));

        try {
            if (!window.supabaseClient) {
                eventsList = [...activeSamples, ...activeCustom];
                return;
            }

            const { data: events, error } = await window.supabaseClient
                .from('events')
                .select('*')
                .order('start_time', { ascending: true });

            if (error || !events || events.length === 0) {
                eventsList = [...activeSamples, ...activeCustom];
                return;
            }

            const fetchedList = events.map(e => {
                let parsedTime = e.description || 'All Day';
                let parsedTarget = 'All Faculty';
                try {
                    if (e.description && e.description.trim().startsWith('{')) {
                        const parsed = JSON.parse(e.description);
                        parsedTime = parsed.time || parsedTime;
                        parsedTarget = parsed.target || parsedTarget;
                    }
                } catch(err) {}

                return {
                    id: e.id,
                    date: e.start_time ? e.start_time.split('T')[0] : formatDateKey(new Date()),
                    title: e.title,
                    type: e.event_type || 'schoolwide',
                    time: parsedTime,
                    target: parsedTarget,
                    createdBy: e.created_by,
                    canDelete: e.created_by === userId || (e.event_type === 'schoolwide' && (userRole === 'principal' || userRole === 'admin'))
                };
            });

            // Filter out deleted IDs from fetched list as well
            const activeFetched = fetchedList.filter(e => !deletedIds.includes(String(e.id)));
            const fetchedIds = new Set(activeFetched.map(e => String(e.id)));
            const uniqueCustom = activeCustom.filter(e => !fetchedIds.has(String(e.id)));
            eventsList = [...activeFetched, ...uniqueCustom];

        } catch (err) {
            console.warn("Calendar events fetch notice:", err.message);
            eventsList = [...activeSamples, ...activeCustom];
        }
    }

    function isEventOnDate(event, dateObj) {
        if (!event || !event.date) return false;
        const dateKey = formatDateKey(dateObj);
        const span = parseInt(event.daysSpan || 1, 10);
        if (span <= 1) {
            return event.date === dateKey;
        }

        const startDate = new Date(event.date + 'T00:00:00');
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + (span - 1));

        const targetDate = new Date(dateKey + 'T00:00:00');
        return targetDate >= startDate && targetDate <= endDate;
    }

    // Render Calendar Grid & Sidebar
    function renderCalendar() {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const firstWeekday = firstDay.getDay();
        const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

        const monthLabel = document.getElementById('monthLabel');
        const calendarGrid = document.getElementById('calendarMonthGrid') || document.getElementById('calendarGrid');

        if (monthLabel) monthLabel.textContent = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!calendarGrid) return;

        calendarGrid.innerHTML = '';

        const todayKey = formatDateKey(new Date());
        const selectedKey = formatDateKey(selectedDate);
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

        const monthEvents = eventsList.filter(e => isEventOnDate(e, selectedDate) || (e.date && e.date.startsWith(monthKey)));
        
        const countTotal = document.getElementById('statTotalMonth') || document.getElementById('monthEventCount');
        const countSchool = document.getElementById('statSchoolwide') || document.getElementById('schoolCount');
        const countPersonal = document.getElementById('deptCount');

        if (countTotal) countTotal.textContent = monthEvents.length;
        if (countSchool) countSchool.textContent = monthEvents.filter(e => e.type === 'schoolwide').length;
        if (countPersonal) countPersonal.textContent = monthEvents.filter(e => e.type === 'personal').length;

        for (let i = 0; i < totalCells; i++) {
            const dayNumber = i - firstWeekday + 1;
            const cellDate = new Date(year, month, dayNumber);
            const isCurrentMonth = cellDate.getMonth() === month;
            const cellKey = formatDateKey(cellDate);
            const isToday = cellKey === todayKey;
            const isSelected = cellKey === selectedKey;

            const dayEl = document.createElement('div');
            dayEl.className = `calendar-day${isCurrentMonth ? '' : ' disabled other-month'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`;
            dayEl.innerHTML = `
                <div class="date-row">
                    <span class="day-number date-number">${cellDate.getDate()}</span>
                    ${isToday ? '<span class="today-pill" style="background:#0038A8; color:#fff; padding:1px 6px; border-radius:10px; font-size:0.7rem;">Today</span>' : ''}
                </div>
            `;

            if (isCurrentMonth) {
                const dayEvents = eventsList.filter(e => isEventOnDate(e, cellDate));
                dayEvents.slice(0, 2).forEach(event => {
                    const pill = document.createElement('div');
                    pill.className = `event-pill event-${event.type}`;
                    pill.style.cssText = `padding: 2px 6px; margin-top: 4px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; ${event.type === 'schoolwide' ? 'background: #0038A8; color: #ffffff;' : 'background: #10b981; color: #ffffff;'}`;
                    pill.textContent = (event.daysSpan > 1 ? `[${event.daysSpan}D] ` : '') + event.title;
                    pill.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectedDate = cellDate;
                        renderCalendar();
                    });
                    dayEl.appendChild(pill);
                });

                if (dayEvents.length > 2) {
                    const more = document.createElement('div');
                    more.className = 'event-pill event-more';
                    more.style.cssText = 'font-size: 0.7rem; color: #64748b; margin-top: 2px;';
                    more.textContent = `+${dayEvents.length - 2} more`;
                    dayEl.appendChild(more);
                }
            }

            dayEl.addEventListener('click', () => {
                if (!isCurrentMonth) return;
                selectedDate = cellDate;
                renderCalendar();
            });

            calendarGrid.appendChild(dayEl);
        }

        updateSelectedEvents();
    }

    function updateSelectedEvents() {
        const selectedDateLabel = document.getElementById('inspectorDateText') || document.getElementById('selectedDateLabel');
        const selectedEvents = document.getElementById('inspectorEventsList') || document.getElementById('selectedEvents');
        const dayEvents = eventsList.filter(e => isEventOnDate(e, selectedDate));

        if (selectedDateLabel) selectedDateLabel.textContent = formatDisplayDate(selectedDate);
        if (!selectedEvents) return;

        if (dayEvents.length === 0) {
            selectedEvents.innerHTML = '<div class="empty-state" style="padding: 1rem 0; color: #94a3b8; font-size: 0.9rem;">No events scheduled for this day.</div>';
            return;
        }

        selectedEvents.innerHTML = dayEvents.map(event => `
            <div class="detail-card" style="padding: 0.85rem; margin-bottom: 0.75rem; background: #ffffff; border-left: 4px solid ${event.type === 'schoolwide' ? '#0038A8' : '#10b981'}; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <strong style="color: #0f172a; font-size: 0.95rem;">${event.title}</strong>
                        <div style="font-size: 0.8rem; color: #475569; margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
                            <span><i class="far fa-clock" style="width: 14px; color: #0038A8;"></i> ${event.time}</span>
                            <span><i class="fas fa-users" style="width: 14px; color: #059669;"></i> Target: <strong>${event.target || 'All Faculty'}</strong></span>
                            <span style="font-size: 0.75rem; text-transform: capitalize; font-weight: 600; color: ${event.type === 'schoolwide' ? '#0038A8' : '#059669'}; margin-top: 2px;">
                                &bull; ${event.type === 'schoolwide' ? 'Schoolwide Event' : 'Personal Note'} ${event.daysSpan > 1 ? `(${event.daysSpan}-Day Span)` : ''}
                            </span>
                        </div>
                    </div>
                    ${event.canDelete ? `<button class="delete-evt-btn" data-id="${event.id}" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.9rem;" title="Delete Event"><i class="fas fa-trash-alt"></i></button>` : ''}
                </div>
            </div>
        `).join('');

        // Attach event listener for delete buttons
        document.querySelectorAll('.delete-evt-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteCalendarEvent(btn.dataset.id));
        });
    }

    function setupEventListeners() {
        const prevBtn = document.getElementById('prevMonthBtn');
        const nextBtn = document.getElementById('nextMonthBtn');
        const todayBtn = document.getElementById('todayBtn');
        const addEventBtn = document.getElementById('addEventBtn');
        const cancelEventBtn = document.getElementById('cancelEventBtn');
        const eventForm = document.getElementById('eventForm');
        const refreshBtn = document.getElementById('navRefreshBtn');

        if (prevBtn) prevBtn.addEventListener('click', () => { currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1); renderCalendar(); });
        if (nextBtn) nextBtn.addEventListener('click', () => { currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1); renderCalendar(); });
        if (todayBtn) todayBtn.addEventListener('click', () => { currentDate = new Date(); selectedDate = new Date(); renderCalendar(); });
        if (refreshBtn) refreshBtn.addEventListener('click', async () => { await fetchCalendarEvents(); renderCalendar(); });

        if (addEventBtn && eventForm) {
            addEventBtn.addEventListener('click', () => {
                updateCategoryDropdown();
                const titleInput = document.getElementById('eventTitle');
                if (titleInput) titleInput.value = '';
                const targetDateInput = document.getElementById('eventTargetDate');
                if (targetDateInput) targetDateInput.value = formatDateKey(selectedDate);
                eventForm.classList.remove('hidden');
                eventForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (titleInput) titleInput.focus();
            });
        }

        if (cancelEventBtn && eventForm) {
            cancelEventBtn.addEventListener('click', () => eventForm.classList.add('hidden'));
        }

        if (eventForm) {
            eventForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = document.getElementById('eventTitle').value.trim();
                const type = document.getElementById('eventType').value;
                const targetVal = document.getElementById('targetAudience')?.value || 'All Faculty';
                const daysSpanVal = parseInt(document.getElementById('eventDaysSpan')?.value || '1', 10);
                
                const startTimeVal = document.getElementById('eventStartTime')?.value || '08:00';
                const endTimeVal = document.getElementById('eventEndTime')?.value || '12:00';

                const startStr = formatTime12h(startTimeVal);
                const endStr = formatTime12h(endTimeVal);
                const durationStr = calculateDurationHrs(startTimeVal, endTimeVal);
                
                const timeDisplay = (daysSpanVal > 1) 
                    ? `${daysSpanVal} Days Duration (${startStr} - ${endStr})` 
                    : ((startStr && endStr) ? `${startStr} - ${endStr} (${durationStr})` : 'All Day');

                if (!title) {
                    alert("Please enter an event title.");
                    return;
                }

                const targetDateVal = document.getElementById('eventTargetDate')?.value || formatDateKey(selectedDate);
                const newEvent = {
                    id: 'evt-' + Date.now(),
                    date: targetDateVal,
                    daysSpan: daysSpanVal,
                    title: title,
                    type: type,
                    time: timeDisplay,
                    target: targetVal,
                    createdBy: userId,
                    canDelete: true
                };

                // Add to local events list & save to localStorage immediately
                eventsList.push(newEvent);
                try {
                    const localCustom = JSON.parse(localStorage.getItem('kandili_custom_events') || '[]');
                    localCustom.push(newEvent);
                    localStorage.setItem('kandili_custom_events', JSON.stringify(localCustom));
                } catch(err){}

                renderCalendar();
                eventForm.classList.add('hidden');
                document.getElementById('eventTitle').value = '';

                // Background Supabase Sync
                if (window.supabaseClient) {
                    try {
                        const payloadDesc = JSON.stringify({ time: timeDisplay, target: targetVal, daysSpan: daysSpanVal });
                        const dbRecord = {
                            title: title,
                            event_type: type === 'personal' ? 'personal' : 'schoolwide',
                            description: payloadDesc,
                            start_time: targetDateVal + 'T00:00:00Z'
                        };
                        if (userId) dbRecord.created_by = userId;

                        const { error: insertErr } = await window.supabaseClient
                            .from('events')
                            .insert([dbRecord]);

                        if (insertErr) {
                            console.warn("Supabase event insert notice:", insertErr.message);
                        } else {
                            console.log("Successfully inserted event into Supabase!");
                        }
                    } catch (err) {
                        console.warn("Background event sync notice:", err.message);
                    }
                }
            });
        }
    }

    async function deleteCalendarEvent(eventId) {
        if (!confirm("Are you sure you want to delete this event?")) return;

        // 1. Remove locally immediately & update UI
        eventsList = eventsList.filter(e => String(e.id) !== String(eventId));

        // 2. Persist deletion in localStorage so custom & sample events don't return on refresh
        try {
            let customEvents = JSON.parse(localStorage.getItem('kandili_custom_events') || '[]');
            customEvents = customEvents.filter(e => String(e.id) !== String(eventId));
            localStorage.setItem('kandili_custom_events', JSON.stringify(customEvents));

            let deletedIds = JSON.parse(localStorage.getItem('kandili_deleted_events') || '[]');
            if (!deletedIds.includes(String(eventId))) {
                deletedIds.push(String(eventId));
                localStorage.setItem('kandili_deleted_events', JSON.stringify(deletedIds));
            }
        } catch(err){}

        renderCalendar();

        // 3. Background Supabase delete if applicable
        if (window.supabaseClient && userId && !String(eventId).startsWith('evt-') && !String(eventId).startsWith('sample-')) {
            try {
                await window.supabaseClient
                    .from('events')
                    .delete()
                    .eq('id', eventId);
            } catch(err) {
                console.warn("Background delete notice:", err.message);
            }
        }
    }

    function formatDateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function formatDisplayDate(date) {
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
})();