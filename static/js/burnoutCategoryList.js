// static/burnoutCategoryList.js - Renders Dynamic Burnout Roster Tables

document.addEventListener('DOMContentLoaded', () => {
    loadBurnoutCategoryTable();
});

async function loadBurnoutCategoryTable() {
    const tableBody = document.querySelector('table tbody');
    if (!tableBody) return;

    const path = window.location.pathname.toLowerCase();
    let targetCategory = 'low';
    
    if (path.includes('moderate')) targetCategory = 'moderate';
    else if (path.includes('high')) targetCategory = 'high';
    else targetCategory = 'low';

    try {
        let profiles = [];
        if (typeof window.fetchScopedTeachersForPrincipal === 'function') {
            const result = await window.fetchScopedTeachersForPrincipal();
            if (result.error) throw new Error(result.error);
            profiles = result.teachers || [];
        } else {
            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select(`
                    id, first_name, last_name, role, department, teacher_code, class_program,
                    teaching_loads ( minutes_per_week ),
                    ancillary_duties ( * ),
                    burnout_assessments ( risk_index, ee_score, dp_score, pa_score, created_at )
                `)
                .eq('role', 'teacher');
            if (error) throw error;
            profiles = data || [];
        }

        tableBody.innerHTML = '';

        const filteredProfiles = profiles.filter(profile => {
            const burnout = (typeof window.classifyBurnoutStatus === 'function')
                ? window.classifyBurnoutStatus(profile)
                : (() => {
                    const sorted = profile.burnout_assessments?.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    const latest = sorted && sorted.length > 0 ? sorted[0] : null;
                    if (!latest) return { hasAssessment: false, tier: 'unassessed', riskIndex: null, latestAssessment: null };
                    const riskIndex = latest.risk_index != null ? parseFloat(latest.risk_index) : 0;
                    const tier = riskIndex >= 70 ? 'high' : (riskIndex >= 40 ? 'moderate' : 'low');
                    return { hasAssessment: true, tier, riskIndex, latestAssessment: latest };
                })();

            // Unassessed teachers are never counted in low/moderate/high
            if (!burnout.hasAssessment) return false;

            profile.riskIndex = burnout.riskIndex;
            profile.latestAssessment = burnout.latestAssessment;
            return burnout.tier === targetCategory;
        });

        if (filteredProfiles.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2.5rem; color: #64748b;">No faculty entries currently fall under this burnout risk tier.</td></tr>`;
            return;
        }

        filteredProfiles.forEach((profile, index) => {
            const tCode = profile.teacher_code || `TCH2026-${String(index + 1).padStart(3, '0')}`;
            const fullName = `${profile.last_name || ''}, ${profile.first_name || 'Faculty'}`;
            const dept = profile.department || 'General Education';

            let badgeHtml = '';
            if (targetCategory === 'high') {
                badgeHtml = `<span style="background: #ffe4e6; color: #be123c; border: 1px solid #fecdd3; padding: 0.25rem 0.65rem; border-radius: 999px; font-weight: 700; font-size: 0.75rem;">HIGH RISK</span>`;
            } else if (targetCategory === 'moderate') {
                badgeHtml = `<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 0.25rem 0.65rem; border-radius: 999px; font-weight: 700; font-size: 0.75rem;">MODERATE RISK</span>`;
            } else {
                badgeHtml = `<span style="background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; padding: 0.25rem 0.65rem; border-radius: 999px; font-weight: 700; font-size: 0.75rem;">LOW RISK</span>`;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong style="color: #0038A8;">${tCode}</strong></td>
                <td><strong>${fullName}</strong><br><span style="font-size: 0.8rem; color: #64748b;">${dept}</span></td>
                <td>${dept}</td>
                <td><strong>${profile.riskIndex}/100</strong></td>
                <td>${badgeHtml}</td>
                <td style="text-align: right;">
                    <button class="action-btn btn-outline" onclick="window.location.href='principaldashboard.html?code=${tCode}'" style="padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-file-invoice"></i> Diagnostic
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (err) {
        console.error("Error loading burnout category list:", err);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #ef4444;">Error loading live burnout roster.</td></tr>`;
    }
}