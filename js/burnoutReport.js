/**
 * Anonymized Burnout Diagnostic Report Logic
 * Dynamically loads MBI-ES subscales and relief strategies based on the teacher code query parameter.
 */

document.addEventListener('DOMContentLoaded', () => {
    initBurnoutDiagnostic();
});

function initBurnoutDiagnostic() {
    const diagnosticDatabase = {
        'TCH-012': {
            dept: 'Araling Panlipunan',
            workloadText: '48.0 hrs/week (Critical Overload)',
            riskTier: 'HIGH BURNOUT RISK',
            riskTheme: 'danger',
            riskSub: 'Critical Fatigue Intervention Recommended',
            ee: { score: 31, badge: 'High Risk', theme: 'danger', desc: 'High emotional depletion and fatigue due to excessive workload burden (Benchmark: ≥27 High).' },
            dp: { score: 15, badge: 'High Risk', theme: 'danger', desc: 'Elevated detached or cynical response toward work environment (Benchmark: ≥13 High).' },
            pa: { score: 26, badge: 'Reduced Efficacy', theme: 'danger', desc: 'Declining feelings of competence and successful achievement in teaching (Benchmark: ≤30 Low).' },
            strategies: [
                '<strong>Immediate Ancillary Offloading:</strong> Transfer Grade 9 Advisory Duty or SDRRM Coordinator responsibility (-8 hrs/wk target) via the Principal Simulator.',
                '<strong>Institutional Check-In Pulse:</strong> Schedule a supportive administrative conversation focusing on resource provision rather than performance metrics.',
                '<strong>Peer Co-Teaching Support:</strong> Pair with an optimal-capacity teacher (<35 hrs/wk) for departmental committee tasks.'
            ]
        },
        'TCH-018': {
            dept: 'English',
            workloadText: '46.5 hrs/week (Critical Overload)',
            riskTier: 'HIGH BURNOUT RISK',
            riskTheme: 'danger',
            riskSub: 'Advisory Task Rebalancing Required',
            ee: { score: 28, badge: 'High Risk', theme: 'danger', desc: 'Pronounced emotional exhaustion from large class sizes and ancillary committee work.' },
            dp: { score: 14, badge: 'High Risk', theme: 'danger', desc: 'Moderate-to-high detachment; increased frustration observed in qualitative feedback.' },
            pa: { score: 28, badge: 'Reduced Efficacy', theme: 'warning', desc: 'Subtle feelings of stalled achievement; requires administrative validation.' },
            strategies: [
                '<strong>Class Size Redistribution:</strong> Reassign one English reading section to co-faculty.',
                '<strong>DepEd Form Automation:</strong> Provide digital grading templates to reduce non-teaching documentation hours.',
                '<strong>Mentorship Assignment:</strong> Step back from Lead LAC Facilitator role to allow peer rotation.'
            ]
        },
        'TCH-003': {
            dept: 'Science',
            workloadText: '40.0 hrs/week (At Maximum Capacity)',
            riskTier: 'MODERATE RISK (EARLY STRAIN)',
            riskTheme: 'warning',
            riskSub: 'Preventive Task Capping Advised',
            ee: { score: 22, badge: 'Moderate Risk', theme: 'warning', desc: 'Moderate exhaustion levels; manageable if workload remains strictly under 40 hours.' },
            dp: { score: 9, badge: 'Moderate Risk', theme: 'warning', desc: 'Normal interpersonal detachment under peak grading periods.' },
            pa: { score: 33, badge: 'Moderate Efficacy', theme: 'warning', desc: 'Healthy self-efficacy balance maintained with department peers.' },
            strategies: [
                '<strong>Cap Administrative Additions:</strong> Restrict new committee assignments for the rest of SY 2026–2027.',
                '<strong>Laboratory Assistant Allocation:</strong> Reallocate student assistant or intern hours for science lab inventory.'
            ]
        },
        'TCH-008': {
            dept: 'Mathematics',
            workloadText: '36.0 hrs/week (Optimal Range)',
            riskTier: 'LOW BURNOUT RISK',
            riskTheme: 'success',
            riskSub: 'Healthy Professional Balance Observed',
            ee: { score: 12, badge: 'Low Risk', theme: 'optimal', desc: 'Low emotional exhaustion; strong instructional stamina and motivation.' },
            dp: { score: 4, badge: 'Low Risk', theme: 'optimal', desc: 'High empathy and positive engagement with students.' },
            pa: { score: 41, badge: 'High Efficacy', theme: 'optimal', desc: 'High accomplishment, confidence, and job satisfaction.' },
            strategies: [
                '<strong>Eligible for Mentorship Leadership:</strong> Qualified to lead advisory support or assist overloaded faculty in departmental projects.'
            ]
        },
        'TCH-004': {
            dept: 'MAPEH',
            workloadText: '28.0 hrs/week (Underload Capacity)',
            riskTier: 'LOW BURNOUT RISK',
            riskTheme: 'success',
            riskSub: 'High Availability For Ancillary Delegation',
            ee: { score: 10, badge: 'Low Risk', theme: 'optimal', desc: 'Minimal exhaustion; significant unused instructional bandwidth.' },
            dp: { score: 3, badge: 'Low Risk', theme: 'optimal', desc: 'Optimal teacher-student connection.' },
            pa: { score: 44, badge: 'High Efficacy', theme: 'optimal', desc: 'Outstanding professional morale and active engagement.' },
            strategies: [
                '<strong>Task Ingestion Candidate:</strong> Strong candidate to absorb 4–6 ancillary hours (e.g., sports coordination or club adviser).'
            ]
        }
    };

    // 1. Parse URL Parameter
    const urlParams = new URLSearchParams(window.location.search);
    const teacherCode = urlParams.get('code') || 'TCH-012';
    const reportData = diagnosticDatabase[teacherCode] || diagnosticDatabase['TCH-012'];

    // 2. Render Text Metadata
    const codeElem = document.getElementById('diagnosticTeacherCode');
    const deptElem = document.getElementById('diagnosticDept');
    const hoursElem = document.getElementById('diagnosticHours');
    const tierBox = document.getElementById('diagnosticTierBox');
    const tierElem = document.getElementById('diagnosticRiskTier');
    const subElem = document.getElementById('diagnosticRiskSub');

    if (codeElem) codeElem.textContent = teacherCode;
    if (deptElem) deptElem.textContent = reportData.dept;
    if (hoursElem) {
        hoursElem.textContent = reportData.workloadText;
        hoursElem.className = `info-val text-${reportData.riskTheme}`;
    }

    if (tierElem) {
        tierElem.textContent = reportData.riskTier;
        tierElem.className = `tier-val text-${reportData.riskTheme}`;
    }

    if (subElem) subElem.textContent = reportData.riskSub;

    if (tierBox) {
        tierBox.className = `overall-tier-box ${reportData.riskTheme === 'danger' ? '' : 'tier-' + reportData.riskTheme}`;
    }

    // 3. Render Subscales
    renderSubscale('EE', reportData.ee, 54);
    renderSubscale('DP', reportData.dp, 30);
    renderSubscale('PA', reportData.pa, 48);

    // 4. Render Relief Strategies
    const listElem = document.getElementById('reliefStrategiesList');
    if (listElem && reportData.strategies) {
        listElem.innerHTML = reportData.strategies
            .map(s => `<li><i class="fas fa-check-circle text-purple"></i><span>${s}</span></li>`)
            .join('');
    }
}

function renderSubscale(key, data, max) {
    const card = document.getElementById(`card${key}`);
    const badge = document.getElementById(`badge${key}`);
    const score = document.getElementById(`score${key}`);
    const desc = document.getElementById(`desc${key}`);

    if (card) {
        card.className = `subscale-card subscale-${data.theme}`;
    }
    if (badge) {
        badge.textContent = data.badge;
        badge.className = `subscale-badge badge-${data.theme === 'danger' ? 'high' : (data.theme === 'warning' ? 'mod' : 'optimal')}`;
    }
    if (score) {
        score.innerHTML = `${data.score} <span class="subscale-max">/ ${max}</span>`;
    }
    if (desc) {
        desc.textContent = data.desc;
    }

    // Back to Directory Handler
    document.getElementById('btnBackDirectory')?.addEventListener('click', () => {
        window.location.href = 'burnout_reports_directory.html';
    });

    // Refresh Handler
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        window.location.reload();
    });
}

// PDF Direct Download Handler
document.getElementById('downloadPdfBtn')?.addEventListener('click', () => {
    const reportCard = document.querySelector('.report-card');
    const teacherCode = document.getElementById('diagnosticTeacherCode')?.textContent.trim() || 'ANONYMIZED';
    
    if (!reportCard) return;

    const opt = {
        margin:       [10, 10, 10, 10],
        filename:     `MBI_Burnout_Diagnostic_${teacherCode}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Generate & direct download PDF
    html2pdf().set(opt).from(reportCard).save();
});