// static/js/burnoutDirectory.js - Unified Anonymized MBI-ES Diagnostic Directory

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkAuthAndRole === 'function') {
        checkAuthAndRole('principal');
    }
    await loadBurnoutDirectory();
    setupFilters();

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => window.location.reload());
    }
});

async function loadBurnoutDirectory() {
    const tableBody = document.getElementById('burnoutTableBody') || document.querySelector('table tbody');
    if (!tableBody) return;

    try {
        const result = (typeof window.fetchScopedTeachersForPrincipal === 'function')
            ? await window.fetchScopedTeachersForPrincipal()
            : { teachers: [], error: 'Unified burnout engine not loaded.' };

        if (result.error) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #dc2626; font-weight: 500;">${result.error}</td></tr>`;
            const counter = document.getElementById('visibleBurnoutCount');
            if (counter) counter.textContent = '0';
            return;
        }

        const teachers = result.teachers || [];
        tableBody.innerHTML = '';

        if (teachers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #64748b;">No teacher burnout records found for your school.</td></tr>`;
            const counter = document.getElementById('visibleBurnoutCount');
            if (counter) counter.textContent = '0';
            return;
        }

        teachers.forEach((teacher, index) => {
            const tCode = teacher.teacher_code || `TCH2026-${String(index + 1).padStart(3, '0')}`;
            const burnout = window.classifyBurnoutStatus(teacher);

            const eeText = burnout.hasAssessment && burnout.ee != null ? `${burnout.ee} / 54` : '—';
            const dpText = burnout.hasAssessment && burnout.dp != null ? `${burnout.dp} / 30` : '—';
            const paText = burnout.hasAssessment && burnout.pa != null ? `${burnout.pa} / 48` : '—';
            const riskAttr = burnout.tier;

            let tierBadge = `<span class="badge-risk" style="background:#f1f5f9; color:#64748b; padding:0.25rem 0.65rem; border-radius:999px; font-weight:700; font-size:0.75rem;">UNASSESSED</span>`;
            if (riskAttr === 'high') {
                tierBadge = `<span class="badge-risk badge-high-risk" style="background:#ffe4e6; color:#be123c; padding:0.25rem 0.65rem; border-radius:999px; font-weight:700; font-size:0.75rem;">HIGH RISK</span>`;
            } else if (riskAttr === 'moderate') {
                tierBadge = `<span class="badge-risk badge-moderate-risk" style="background:#fef3c7; color:#b45309; padding:0.25rem 0.65rem; border-radius:999px; font-weight:700; font-size:0.75rem;">MODERATE RISK</span>`;
            } else if (riskAttr === 'low') {
                tierBadge = `<span class="badge-risk badge-low-risk" style="background:#dcfce7; color:#15803d; padding:0.25rem 0.65rem; border-radius:999px; font-weight:700; font-size:0.75rem;">LOW RISK</span>`;
            }

            const row = document.createElement('tr');
            row.setAttribute('data-code', tCode.toLowerCase());
            row.setAttribute('data-risk', riskAttr);

            row.innerHTML = `
                <td><code class="code-tag-bold" style="font-weight:700; color:#0038A8;">${tCode}</code></td>
                <td><span class="score-val">${eeText}</span></td>
                <td><span class="score-val">${dpText}</span></td>
                <td><span class="score-val">${paText}</span></td>
                <td>${tierBadge}</td>
                <td class="text-right" style="text-align: right;">
                    <a href="burnout_report.html?code=${encodeURIComponent(tCode)}" class="btn-view-diagnostic" style="padding:0.4rem 0.8rem; background:#f1f5f9; color:#0f172a; border-radius:6px; text-decoration:none; font-size:0.82rem; font-weight:600;">
                        <i class="fas fa-microscope"></i> View Diagnostic
                    </a>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error('Error loading burnout directory:', err);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:#ef4444;">Error loading diagnostic directory.</td></tr>`;
    }
}

function setupFilters() {
    const searchInput = document.getElementById('burnoutSearch');
    const filterSelect = document.getElementById('burnoutTierFilter');

    // Pre-select ?tier= URL parameter when navigated from Principal Dashboard KPI card
    const urlTier = (new URLSearchParams(window.location.search).get('tier') || '').toLowerCase();
    if (filterSelect && ['high', 'moderate', 'low', 'unassessed'].includes(urlTier)) {
        filterSelect.value = urlTier;
    }

    const filterRows = () => {
        const query = searchInput?.value.toLowerCase().trim() || '';
        const tier = filterSelect?.value || 'all';

        const rows = document.querySelectorAll('#burnoutTableBody tr[data-risk]');
        let visibleCount = 0;

        rows.forEach(row => {
            const code = row.getAttribute('data-code') || '';
            const rowRisk = row.getAttribute('data-risk') || '';

            const matchesSearch = code.includes(query);
            const matchesTier = tier === 'all' || rowRisk === tier;

            if (matchesSearch && matchesTier) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        const counter = document.getElementById('visibleBurnoutCount');
        if (counter) counter.textContent = visibleCount;

        const emptyBox = document.getElementById('noBurnoutResults');
        if (emptyBox) emptyBox.style.display = visibleCount === 0 ? 'block' : 'none';
    };

    if (searchInput) searchInput.addEventListener('input', filterRows);
    if (filterSelect) filterSelect.addEventListener('change', filterRows);
    filterRows();
}
