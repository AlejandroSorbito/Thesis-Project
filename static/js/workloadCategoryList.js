// static/js/workloadCategoryList.js - Unified Workload Directory & Category List

document.addEventListener('DOMContentLoaded', () => {
    loadCategoryTable();
});

async function loadCategoryTable() {
    const directoryBody = document.getElementById('directoryTableBody');
    const isReportsDirectory = Boolean(directoryBody);
    const tableBody = directoryBody || document.querySelector('table tbody');
    if (!tableBody) {
        console.warn('[workloadCategoryList] No <tbody> found on this page.');
        return;
    }

    const colSpan = isReportsDirectory ? 6 : 7;

    try {
        let profiles = [];
        if (typeof window.fetchScopedTeachersForPrincipal === 'function') {
            const result = await window.fetchScopedTeachersForPrincipal();
            if (result.error) {
                tableBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding: 2rem; color: #dc2626; font-weight: 500;">${result.error}</td></tr>`;
                const counter = document.getElementById('visibleReportCount');
                if (counter) counter.textContent = '0';
                return;
            }
            profiles = result.teachers || [];
        } else {
            // Safe fallback if workloadManager.js is not loaded on a legacy admin page
            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select(`
                    id, first_name, last_name, role, department, teacher_code, school, class_program,
                    teaching_loads ( minutes_per_week ),
                    ancillary_duties ( * )
                `)
                .eq('role', 'teacher');
            if (error) throw error;
            profiles = data || [];
        }

        tableBody.innerHTML = '';

        const getWLU = (profile) => {
            if (typeof window.calculateWLUDetails === 'function') {
                return window.calculateWLUDetails(profile);
            }
            let teachingHrs = (profile.teaching_loads?.reduce((sum, item) => sum + (item.minutes_per_week || 0), 0) || 0) / 60;
            let ancillaryHrs = 0;
            let ancillaryWLU = 0;
            profile.ancillary_duties?.forEach(duty => {
                const hrs = parseFloat(duty.hours_per_week || duty.hours || 0);
                const name = (duty.duty_name || duty.duty_title || duty.name || duty.title || '').toLowerCase();
                ancillaryWLU += (name.includes('coordinator') || name.includes('chair') || name.includes('paper') || name.includes('sdrrm'))
                    ? hrs * 2.0 : hrs * 1.5;
                ancillaryHrs += hrs;
            });
            if (teachingHrs === 0 && profile.class_program) {
                teachingHrs = parseFloat(profile.class_program.coreHours || profile.class_program.totalLogged || 0);
                if (ancillaryHrs === 0 && parseFloat(profile.class_program.ancillaryHours || 0) > 0) {
                    ancillaryHrs = parseFloat(profile.class_program.ancillaryHours);
                    ancillaryWLU = ancillaryHrs * 1.5;
                }
            }
            const totalJDS = parseFloat((teachingHrs + ancillaryWLU).toFixed(2));
            const totalHours = parseFloat((teachingHrs + ancillaryHrs).toFixed(1));
            let status = 'UNDERLOAD';
            let tierKey = 'underload';
            if (totalJDS > 75) { status = 'OVERLOAD'; tierKey = 'overload'; }
            else if (totalJDS >= 66) { status = 'MAXIMIZED'; tierKey = 'high'; }
            else if (totalJDS >= 54) { status = 'HIGH'; tierKey = 'high'; }
            else if (totalJDS >= 36) { status = 'OPTIMAL'; tierKey = 'optimal'; }
            return { totalJDS, totalHours, status, tierKey };
        };

        const enriched = profiles.map((profile, index) => {
            const wlu = getWLU(profile);
            const tCode = profile.teacher_code || `TCH2026-${String(index + 1).padStart(3, '0')}`;
            const fullName = `${profile.last_name || ''}, ${profile.first_name || 'Faculty'}`;
            const dept = profile.department || 'General Education';
            return { ...profile, wlu, tCode, fullName, dept };
        });

        // Mode 1: Principal Workload Reports Directory (workload_reports_directory.html)
        if (isReportsDirectory) {
            if (enriched.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2.5rem; color: #64748b;">No faculty workload records found for your school.</td></tr>`;
                const counter = document.getElementById('visibleReportCount');
                if (counter) counter.textContent = '0';
                return;
            }

            enriched.forEach(item => {
                const wlu = item.wlu;
                let badgeStyle = 'background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd;';
                if (wlu.tierKey === 'overload') badgeStyle = 'background: #fef2f2; color: #e11d48; border: 1px solid #fecdd3;';
                else if (wlu.tierKey === 'high') badgeStyle = 'background: #fffbeb; color: #d97706; border: 1px solid #fde68a;';
                else if (wlu.tierKey === 'optimal') badgeStyle = 'background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;';

                const row = document.createElement('tr');
                row.setAttribute('data-tier', wlu.tierKey);
                row.innerHTML = `
                    <td class="cell-name"><strong>${item.fullName}</strong></td>
                    <td class="cell-code"><code style="font-weight:700; color:#0038A8;">${item.tCode}</code></td>
                    <td class="cell-dept">${item.dept}</td>
                    <td>
                        <strong style="color:#0f172a;">${wlu.totalHours} hrs</strong>
                        <span style="font-size:0.78rem; color:#64748b;">(${wlu.totalJDS} WLU)</span>
                    </td>
                    <td><span style="padding:0.25rem 0.65rem; border-radius:999px; font-size:0.72rem; font-weight:700; text-transform:uppercase; display:inline-block; ${badgeStyle}">${wlu.status}</span></td>
                    <td class="text-right" style="text-align:right;">
                        <a href="workload_report.html?code=${encodeURIComponent(item.tCode)}" class="btn-view-report" style="padding:0.4rem 0.8rem; background:#f1f5f9; color:#0f172a; border-radius:6px; text-decoration:none; font-size:0.82rem; font-weight:600;">
                            <i class="fas fa-file-alt"></i> View Report
                        </a>
                    </td>
                `;
                tableBody.appendChild(row);
            });

            initWorkloadDirectoryFilters();
            return;
        }

        // Mode 2: Category-specific pages (underload_teachers.html, optimal_teachers.html, etc.)
        const path = window.location.pathname.toLowerCase();
        let targetTier = 'optimal';
        if (path.includes('underload')) targetTier = 'underload';
        else if (path.includes('optimal')) targetTier = 'optimal';
        else if (path.includes('high') || path.includes('maximized')) targetTier = 'high';
        else if (path.includes('overload')) targetTier = 'overload';

        const filteredProfiles = enriched.filter(item => item.wlu.tierKey === targetTier);

        if (filteredProfiles.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2.5rem; color: #64748b;">No faculty members currently fall under this capacity category.</td></tr>`;
            return;
        }

        filteredProfiles.forEach(item => {
            const wlu = item.wlu;
            let badgeColor = 'background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd;';
            let actionText = 'Available Capacity';

            if (wlu.tierKey === 'overload') { badgeColor = 'background: #fef2f2; color: #e11d48; border: 1px solid #fecdd3;'; actionText = 'Requires Reallocation'; }
            else if (wlu.tierKey === 'high') { badgeColor = 'background: #fffbeb; color: #d97706; border: 1px solid #fde68a;'; actionText = 'Monitor Assignment'; }
            else if (wlu.tierKey === 'optimal') { badgeColor = 'background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;'; actionText = 'Well Balanced'; }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="cell-id"><strong>${item.tCode}</strong></td>
                <td class="cell-name teacher-name">
                    <strong style="color: #0f172a;">${item.fullName}</strong>
                    <span class="sub-text" style="display: block; font-size: 0.8rem; color: #64748b;">${item.dept}</span>
                </td>
                <td>${item.dept}</td>
                <td>
                    <strong style="color: #0f172a; font-size: 1.05rem;">${wlu.totalJDS} WLU</strong>
                    <br><span style="font-size: 0.75rem; color: #64748b;">(${wlu.totalHours} raw hrs)</span>
                </td>
                <td><span style="font-size: 0.85rem; font-weight: 600; color: #475569;">${actionText}</span></td>
                <td><span style="padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; display: inline-block; ${badgeColor}">${wlu.status}</span></td>
                <td style="text-align: right;">
                    <button class="action-btn btn-outline" style="padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer;" onclick="window.location.href='../principal/workload_report.html?code=${encodeURIComponent(item.tCode)}'">
                        <i class="fas fa-eye"></i> Manage
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error('Error loading category list:', err);
        tableBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding: 2rem; color: #ef4444;">Error loading live roster data.</td></tr>`;
    }
}

function initWorkloadDirectoryFilters() {
    const searchInput = document.getElementById('directorySearch');
    const statusSelect = document.getElementById('statusFilter');

    // Pre-select ?tier= URL parameter when navigated from Principal Dashboard KPI card
    const urlTier = (new URLSearchParams(window.location.search).get('tier') || '').toLowerCase();
    if (statusSelect && ['overload', 'high', 'optimal', 'underload'].includes(urlTier)) {
        statusSelect.value = urlTier;
    }

    const applyFilter = () => {
        const searchVal = (searchInput?.value || '').toLowerCase().trim();
        const statusVal = statusSelect?.value || 'all';
        const rows = document.querySelectorAll('#directoryTableBody tr');
        let visibleCount = 0;

        rows.forEach(row => {
            const name = row.querySelector('.cell-name')?.textContent.toLowerCase() || '';
            const code = row.querySelector('.cell-code')?.textContent.toLowerCase() || '';
            const dept = row.querySelector('.cell-dept')?.textContent.toLowerCase() || '';
            const tier = row.getAttribute('data-tier') || '';

            const matchesQuery = !searchVal || name.includes(searchVal) || code.includes(searchVal) || dept.includes(searchVal);
            const matchesTier = statusVal === 'all' || tier === statusVal;

            if (matchesQuery && matchesTier) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        const counter = document.getElementById('visibleReportCount');
        if (counter) counter.textContent = visibleCount;

        const emptyBox = document.getElementById('noDirectoryResults');
        if (emptyBox) emptyBox.style.display = visibleCount === 0 ? 'block' : 'none';
    };

    if (searchInput) searchInput.addEventListener('input', applyFilter);
    if (statusSelect) statusSelect.addEventListener('change', applyFilter);

    // Wire logout button cleanly
    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof kandiliLogout === 'function') kandiliLogout();
    });

    applyFilter();
}
