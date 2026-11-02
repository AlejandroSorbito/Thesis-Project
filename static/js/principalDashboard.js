// static/principalDashboard.js - Powered by DepEd WLU/JDS Model (DO 5, s. 2024)

let workloadChartInstance = null;
let distributionChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authorization
    if (typeof checkAuthAndRole === 'function') {
        checkAuthAndRole('principal');
    }

    // 2. Fetch & Render Data
    await loadPrincipalDashboardData();

    // 3. UI Event Listeners
    setupNavigationEvents();
    setupDirectorySearch();
});

function setupNavigationEvents() {
    // Refresh Button
    const refreshBtn = document.querySelector('.theme-nav__refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Refreshing...`;
            await loadPrincipalDashboardData();
            refreshBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Refresh`;
        });
    }

    // Burger Menu
    const burgerMenuBtn = document.getElementById('burgerMenuBtn');
    const themeNavMenu = document.getElementById('themeNavMenu');

    if (burgerMenuBtn && themeNavMenu) {
        burgerMenuBtn.addEventListener('click', (e) => {
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

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof kandiliLogout === 'function') kandiliLogout();
        });
    }

    // Risk Filter Buttons
    const riskButtons = document.querySelectorAll('.risk-card-btn');
    riskButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            if (typeof showTeacherList === 'function') {
                showTeacherList(filter);
            }
        });
    });
}

async function loadPrincipalDashboardData() {
    try {
        if (!window.supabaseClient) {
            console.error("Supabase client not loaded.");
            return;
        }

        // 1. Fetch Principal's Session & Profile
        const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
        if (sessionError || !session || !session.user) {
            console.warn("No active session found.");
            return;
        }

        const { data: principalProfile, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select('school, assigned_institution')
            .eq('id', session.user.id)
            .single();

        if (profileError) {
            console.error("Error loading principal profile:", profileError.message);
        }

        const principalSchool = principalProfile?.school || principalProfile?.assigned_institution;

        // 2. Handle Missing School Guard
        if (!principalSchool) {
            console.warn("No school assigned to your profile.");
            const errorMessage = "No school assigned to your profile. Please contact Admin.";

            renderDynamicBannerStats(0, 0);
            updatePrincipalSummaryCards({
                totalTeachers: 0,
                totalTeachingHrs: "0.0",
                totalAncillaryHrs: "0.0",
                underloadedCount: 0,
                optimalCount: 0,
                highCount: 0,
                maximizedCount: 0,
                overloadedCount: 0
            });
            renderBurnoutSummaryCards([]);

            const tableBody = document.querySelector('#facultyTableBody');
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #dc2626; font-weight: 500;">${errorMessage}</td></tr>`;
            }

            const directoryGrid = document.querySelector('.directory-grid');
            if (directoryGrid) {
                directoryGrid.innerHTML = `<div class="info-box" style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #dc2626; font-weight: 500;">${errorMessage}</div>`;
            }

            const hotlistPanel = document.querySelector('.hotlist-panel');
            if (hotlistPanel) {
                hotlistPanel.innerHTML = `<div style="text-align:center; padding: 1.5rem; color: #dc2626; font-weight: 500;">${errorMessage}</div>`;
            }

            const distCanvas = document.getElementById('distributionChart');
            if (distCanvas && distCanvas.parentElement) {
                distCanvas.parentElement.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; min-height:220px; color:#dc2626; font-size:0.9rem; font-weight:500;">${errorMessage}</div>`;
            }
            return;
        }

        // 3. Filter Teachers by Role and Principal's School
        const { data: teachers, error } = await window.supabaseClient
            .from('profiles')
            .select(`
                id,
                first_name,
                last_name,
                department,
                role,
                teacher_code,
                school,
                teaching_loads ( minutes_per_week ),
                ancillary_duties ( * ),
                burnout_assessments ( * )
            `)
            .eq('role', 'teacher')
            .eq('school', principalSchool);

        if (error) {
            console.error("Error fetching principal dashboard data:", error.message);
            return;
        }

        let totalSchoolTeachingMins = 0;
        let totalSchoolAncillaryHrs = 0;
        let overloadedCount = 0;
        let maximizedCount = 0;
        let highCount = 0;
        let optimalCount = 0;
        let underloadedCount = 0;

        let completedPulseCount = 0;
        let totalRiskScoreSum = 0;

        const deptMap = {};

        const processedTeachers = teachers.map((teacher, index) => {
            // Use window engine if available, or compute fallback inline
            const wlu = (typeof window.calculateWLUDetails === 'function') 
                ? window.calculateWLUDetails(teacher) 
                : computeFallbackWLU(teacher);

            totalSchoolTeachingMins += teacher.teaching_loads?.reduce((sum, item) => sum + (item.minutes_per_week || 0), 0) || 0;
            totalSchoolAncillaryHrs += (wlu.ancillaryHours || 0) + (wlu.assignmentHours || 0);

            // Increment WLU counters based on classification
            if (wlu.status === 'OVERLOAD' || wlu.status === 'OVERLOADED') overloadedCount++;
            else if (wlu.status === 'MAXIMIZED') maximizedCount++;
            else if (wlu.status === 'HIGH') highCount++;
            else if (wlu.status === 'OPTIMAL') optimalCount++;
            else underloadedCount++;

            // Department Aggregation (JDS/WLU)
            const deptName = teacher.department || 'General Education';
            if (!deptMap[deptName]) {
                deptMap[deptName] = { totalWLU: 0, count: 0 };
            }
            deptMap[deptName].totalWLU += wlu.totalJDS;
            deptMap[deptName].count += 1;

            // Burnout Pulse Assessment Extraction
            const sortedAssessments = teacher.burnout_assessments?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const hasRecentAssessment = sortedAssessments && sortedAssessments.length > 0;
            if (hasRecentAssessment) completedPulseCount++;

            const latestRiskScore = hasRecentAssessment 
                ? parseFloat(sortedAssessments[0].risk_index) 
                : Math.min(100, Math.round((wlu.totalJDS / 75) * 80));

            totalRiskScoreSum += latestRiskScore;

            const tCode = teacher.teacher_code || `TCH2026-${String(index + 1).padStart(3, '0')}`;

            return {
                ...teacher,
                teacherCode: tCode,
                fullName: `${teacher.last_name || ''}, ${teacher.first_name || 'Teacher'}`,
                totalLoadHrs: wlu.totalHours,
                totalJDS: wlu.totalJDS,
                riskIndex: latestRiskScore,
                status: wlu.status
            };
        });

        // 1. Render Top Banner Stats
        renderDynamicBannerStats(processedTeachers.length, totalRiskScoreSum);

        // 2. Update Workload Summary Metric Cards
        updatePrincipalSummaryCards({
            totalTeachers: teachers.length,
            totalTeachingHrs: (totalSchoolTeachingMins / 60).toFixed(1),
            totalAncillaryHrs: totalSchoolAncillaryHrs.toFixed(1),
            underloadedCount: underloadedCount,
            optimalCount: optimalCount,
            highCount: highCount,
            maximizedCount: maximizedCount,
            overloadedCount: overloadedCount
        });

        // 3. Update Burnout Assessment Summary Cards (NEW)
        renderBurnoutSummaryCards(processedTeachers);

        // 4. Render Table & Charts
        renderPrincipalFacultyTable(processedTeachers);
        await renderPrincipalCharts(processedTeachers, {
            underloadedCount,
            optimalCount,
            highCount,
            maximizedCount,
            overloadedCount
        });

        // 5. Render Side Analytics Modules
        renderDepartmentTracker(deptMap);
        renderHighRiskHotlist(processedTeachers);
        renderPulseCompliancePanel(processedTeachers.length, completedPulseCount, totalRiskScoreSum);

    } catch (err) {
        console.error("Failed to render principal workspace:", err);
    }
}

function computeFallbackWLU(teacher) {
    const teachingMins = teacher.teaching_loads?.reduce((sum, item) => sum + (item.minutes_per_week || 0), 0) || 0;
    const teachingHrs = teachingMins / 60;
    const teachingWLU = teachingHrs * 1.0;

    let ancillaryHrs = 0;
    let assignmentHrs = 0;
    let ancillaryWLU = 0;
    let assignmentWLU = 0;

    teacher.ancillary_duties?.forEach(duty => {
        const hrs = parseFloat(duty.hours_per_week || duty.hours || 0);
        const name = (duty.duty_name || duty.duty_title || duty.name || duty.title || '').toLowerCase();
        if (name.includes('coordinator') || name.includes('chair') || name.includes('paper') || name.includes('sdrrm')) {
            assignmentHrs += hrs;
            assignmentWLU += hrs * 2.0;
        } else {
            ancillaryHrs += hrs;
            ancillaryWLU += hrs * 1.5;
        }
    });

    const totalJDS = parseFloat((teachingWLU + ancillaryWLU + assignmentWLU).toFixed(2));
    const totalHours = parseFloat((teachingHrs + ancillaryHrs + assignmentHrs).toFixed(1));

    let status = 'OPTIMAL';
    if (totalJDS > 75) status = 'OVERLOAD';
    else if (totalJDS >= 66) status = 'MAXIMIZED';
    else if (totalJDS >= 54) status = 'HIGH';
    else if (totalJDS >= 36) status = 'OPTIMAL';
    else status = 'UNDERLOAD';

    return { teachingHours: teachingHrs, ancillaryHours: ancillaryHrs, assignmentHours: assignmentHrs, totalHours, totalJDS, status };
}

function updatePrincipalSummaryCards(metrics) {
    console.log("[Dashboard Cards Metrics Received]:", metrics);

    const underloaded = metrics.underloadedCount || 0;
    const optimal = metrics.optimalCount || 0;
    const highAndMax = (metrics.maximizedCount || 0) + (metrics.highCount || 0);
    const overloaded = metrics.overloadedCount || 0;

    // 1. Direct Target by Element IDs
    const underloadEl = document.getElementById('count-underload');
    const optimalEl = document.getElementById('count-optimal');
    const maximizedEl = document.getElementById('count-maximized');
    const overloadedEl = document.getElementById('count-overload');

    if (underloadEl) underloadEl.innerText = underloaded;
    if (optimalEl) optimalEl.innerText = optimal;
    if (maximizedEl) maximizedEl.innerText = highAndMax;
    if (overloadedEl) overloadedEl.innerText = overloaded;

    // 2. Fallback Target by CSS Card Classes
    const cardInfoNum = document.querySelector('.risk-card--info .risk-card-number');
    const cardLowNum = document.querySelector('.risk-card--low .risk-card-number');
    const cardModNum = document.querySelector('.risk-card--moderate .risk-card-number');
    const cardCritNum = document.querySelector('.risk-card--critical .risk-card-number');

    if (cardInfoNum && !underloadEl) cardInfoNum.innerText = underloaded;
    if (cardLowNum && !optimalEl) cardLowNum.innerText = optimal;
    if (cardModNum && !maximizedEl) cardModNum.innerText = highAndMax;
    if (cardCritNum && !overloadedEl) cardCritNum.innerText = overloaded;

    // Header Metrics Cards
    const teacherCountEl = document.querySelector('.metric-card--teachers .metric-value');
    const teachingHrsEl = document.querySelector('.metric-card--teaching .metric-value');
    const ancillaryHrsEl = document.querySelector('.metric-card--ancillary .metric-value');

    if (teacherCountEl) teacherCountEl.innerText = metrics.totalTeachers || 0;
    if (teachingHrsEl) teachingHrsEl.innerText = `${metrics.totalTeachingHrs || 0} hrs`;
    if (ancillaryHrsEl) ancillaryHrsEl.innerText = `${metrics.totalAncillaryHrs || 0} hrs`;
}

function renderBurnoutSummaryCards(teachers) {
    let lowCount = 0;
    let modCount = 0;
    let highCount = 0;

    teachers.forEach(teacher => {
        const risk = teacher.riskIndex || 0;
        if (risk >= 70) {
            highCount++;
        } else if (risk >= 40) {
            modCount++;
        } else {
            lowCount++;
        }
    });

    const lowEl = document.getElementById('burnout-count-low');
    const modEl = document.getElementById('burnout-count-moderate');
    const highEl = document.getElementById('burnout-count-high');

    if (lowEl) lowEl.innerText = lowCount;
    if (modEl) modEl.innerText = modCount;
    if (highEl) highEl.innerText = highCount;
}

function renderDynamicBannerStats(totalFacultyCount, totalRiskSum) {
    const facultyCountEl = document.querySelector('.welcome-stats-box .stat-val--blue');
    const wellnessEl = document.querySelector('.welcome-stats-box .stat-val--green-light');

    if (facultyCountEl) facultyCountEl.innerText = `${totalFacultyCount} Members`;
    if (wellnessEl && totalFacultyCount > 0) {
        const avgRisk = totalRiskSum / totalFacultyCount;
        const wellnessPercent = Math.max(0, (100 - avgRisk)).toFixed(1);
        wellnessEl.innerText = `${wellnessPercent}% Balanced`;
    }
}

function renderDepartmentTracker(deptMap) {
    const deptContainer = document.querySelector('.side-card');
    if (!deptContainer) return;

    let html = `
        <h4 class="dept-tracker-title" style="color: #0f172a; margin-top: 0; margin-bottom: 1rem; font-size: 1.05rem;">
            <i class="fas fa-chart-bar" style="color: #0038A8;"></i> Dept. Workload Distribution
        </h4>
    `;

    const deptEntries = Object.entries(deptMap);
    if (deptEntries.length === 0) {
        html += `<p style="font-size: 0.85rem; color: #64748b;">No department records found.</p>`;
    } else {
        deptEntries.forEach(([dept, data]) => {
            const avgWLU = parseFloat((data.totalWLU / data.count).toFixed(1));
            let statusText = 'Optimal';
            let barColor = '#059669';
            let percentage = Math.min(100, Math.round((avgWLU / 75) * 100));

            if (avgWLU > 75) {
                statusText = 'Overloaded';
                barColor = '#dc2626';
            } else if (avgWLU >= 66) {
                statusText = 'Maximized';
                barColor = '#d97706';
            } else if (avgWLU >= 54) {
                statusText = 'High Load';
                barColor = '#f59e0b';
            }

            html += `
                <div class="dept-row" style="margin-bottom: 0.85rem;">
                    <div class="dept-header" style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.25rem;">
                        <span class="dept-name" style="font-weight: 600; color: #334155;">${dept}</span>
                        <span class="dept-score" style="color: ${barColor}; font-weight: 700;">Avg: ${avgWLU} WLU (${statusText})</span>
                    </div>
                    <div class="dept-bar-track" style="background: #f1f5f9; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div class="dept-bar-fill" style="width: ${percentage}%; background: ${barColor}; height: 100%; transition: all 0.4s ease;"></div>
                    </div>
                </div>
            `;
        });
    }

    html += `
        <p class="dept-tracker-footer" style="font-size: 0.78rem; color: #64748b; margin-top: 1rem; margin-bottom: 0; line-height: 1.4;">
            <i class="fas fa-circle-info"></i> Aggregated Job Demand Score (JDS/WLU) per department.
        </p>
    `;

    deptContainer.innerHTML = html;
}

function renderHighRiskHotlist(teachers) {
    const hotlistPanel = document.querySelector('.hotlist-panel');
    if (!hotlistPanel) return;

    const highRisk = teachers.filter(t => t.riskIndex >= 70 || t.status === 'OVERLOAD' || t.status === 'OVERLOADED');
    const hiddenStrain = teachers.filter(t => t.riskIndex >= 65 && t.totalJDS <= 54);

    let html = `
        <div class="hotlist-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
            <h3 style="color: #dc2626; margin: 0; font-size: 1.2rem; font-weight: 700;">
                <i class="fas fa-exclamation-triangle"></i> High Risk Teacher Hotlist
            </h3>
            <span style="background: #ffe4e6; color: #881337; border: 1px solid #fecdd3; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700;">
                ${highRisk.length} Alert${highRisk.length === 1 ? '' : 's'}
            </span>
        </div>
    `;

    if (highRisk.length === 0) {
        html += `
            <div style="padding: 1.25rem; text-align: center; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 0.9rem;">
                <i class="fas fa-check-circle" style="margin-right: 6px;"></i> All faculty profiles are operating within safe WLU parameters.
            </div>
        `;
    } else {
        highRisk.forEach(teacher => {
            html += `
                <div class="hotlist-item hotlist-item--critical" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-radius: 8px; background: #fff1f2; border: 1px solid #fecdd3; margin-bottom: 0.85rem;">
                    <div class="hotlist-item-left">
                        <span class="hotlist-code" style="font-weight: 800; color: #dc2626; font-size: 1rem; display: block;">${teacher.teacherCode} (${teacher.fullName})</span>
                        <span class="hotlist-details" style="font-size: 0.82rem; color: #9f1239;">JDS: ${teacher.totalJDS} WLU | Risk Score: ${teacher.riskIndex}/100</span>
                    </div>
                    <div class="hotlist-item-right" style="display: flex; gap: 0.5rem;">
                        <button class="hotlist-btn" onclick="window.location.href='high_burnout_teachers.html'" style="padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #fecdd3; background: #ffffff; color: #be123c; font-weight: 600; font-size: 0.82rem; cursor: pointer;">
                            <i class="fas fa-file-invoice"></i> Diagnostic
                        </button>
                    </div>
                </div>
            `;
        });
    }

    html += `
        <div class="hotlist-hidden-flag" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem 1rem; display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
            <div class="hidden-flag-content" style="font-size: 0.83rem; color: #334155;">
                <i class="fas fa-flag" style="color: #d97706; margin-right: 0.4rem;"></i> 
                <strong>Hidden Strain Flag:</strong> ${hiddenStrain.length} Faculty entries report high emotional fatigue despite optimal WLU scores (&le;54 WLU).
            </div>
            <button class="hidden-flag-link" onclick="window.location.href='moderate_burnout_teachers.html'" style="background: transparent; border: none; color: #0038A8; font-weight: 700; font-size: 0.82rem; cursor: pointer;">
                Inspect Roster &rarr;
            </button>
        </div>
    `;

    hotlistPanel.innerHTML = html;
}

function renderPulseCompliancePanel(totalFaculty, completedCount, totalRiskSum) {
    const pulsePanel = document.querySelector('.pulse-panel');
    if (!pulsePanel) return;

    const pendingCount = totalFaculty - completedCount;
    const ratePercent = totalFaculty > 0 ? Math.round((completedCount / totalFaculty) * 100) : 0;
    const avgExhaustion = totalFaculty > 0 ? Math.round(totalRiskSum / totalFaculty) : 0;

    pulsePanel.innerHTML = `
        <h3 style="color: #059669; margin: 0; font-size: 1.1rem; font-weight: 700;">
            <i class="fas fa-heartbeat"></i> MBI Pulse Response Rate
        </h3>
        
        <div class="pulse-stats" style="display: flex; gap: 1.5rem; margin: 1rem 0;">
            <div class="pulse-stat">
                <span class="pulse-number" style="color: #059669; font-size: 1.8rem; font-weight: 800; display: block;">${completedCount}</span>
                <span class="pulse-label" style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Submitted</span>
                <span class="pulse-detail" style="font-size: 0.75rem; color: #059669; font-weight: 700;">/ ${totalFaculty} (${ratePercent}%)</span>
            </div>
            <div class="pulse-stat">
                <span class="pulse-number" style="color: #dc2626; font-size: 1.8rem; font-weight: 800; display: block;">${pendingCount}</span>
                <span class="pulse-label" style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Pending</span>
                <span class="pulse-detail" style="font-size: 0.75rem; color: #dc2626; font-weight: 700;">(${100 - ratePercent}%)</span>
            </div>
        </div>

        <button onclick="alert('Automated survey reminder dispatched to ${pendingCount} faculty members!')" style="width: 100%; padding: 0.75rem; background: #0038A8; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: background 0.2s ease;">
            <i class="fas fa-bell"></i> Send Automated Reminder (${pendingCount} Pending)
        </button>

        <div class="pulse-exhaustion" style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; font-size: 0.83rem;">
            <span style="color: #475569;">Average System Exhaustion:</span> 
            <span style="text-align: right;">
                <strong style="color: ${avgExhaustion > 60 ? '#dc2626' : '#059669'};">${avgExhaustion}% ${avgExhaustion > 60 ? '(Elevated)' : '(Optimal)'}</strong>
            </span>
        </div>
    `;
}

async function renderPrincipalCharts(teachers, metrics) {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748b';

    // 1. Doughnut: Faculty Burnout Risk Distribution
    const distCanvas = document.getElementById('distributionChart');
    if (distCanvas) {
        if (distributionChartInstance) distributionChartInstance.destroy();

        // Scoped strictly to the school's teachers' assessments
        const allAssessments = (teachers || []).flatMap(t => t.burnout_assessments || []);

        if (!allAssessments || allAssessments.length === 0) {
            distCanvas.parentElement.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; min-height:220px; color:#94a3b8; font-size:0.9rem; font-weight:500;">No data available yet.</div>`;
        } else {
            let highCount = 0;
            let moderateCount = 0;
            let lowCount = 0;

            allAssessments.forEach(item => {
                const score = parseFloat(item.risk_index || 0);
                if (score > 70) highCount++;
                else if (score >= 40) moderateCount++;
                else lowCount++;
            });

            distributionChartInstance = new Chart(distCanvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['High Risk (>70)', 'Moderate Risk (40–70)', 'Low Risk (<40)'],
                    datasets: [{
                        data: [highCount, moderateCount, lowCount],
                        backgroundColor: ['#dc2626', '#f59e0b', '#059669'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 12, padding: 12 }
                        }
                    }
                }
            });
        }
    }

    // 2. Scatter: Workload vs. Exhaustion
    const scatterCanvas = document.getElementById('workloadChart');
    if (scatterCanvas) {
        if (workloadChartInstance) workloadChartInstance.destroy();

        const scatterPoints = [];
        (teachers || []).forEach(t => {
            const teachingMins = t.teaching_loads?.reduce((sum, item) => sum + (item.minutes_per_week || 0), 0) || 0;
            const teachingHrs = teachingMins / 60;
            const ancillaryHrs = t.ancillary_duties?.reduce((sum, item) => sum + parseFloat(item.hours_per_week || item.hours || 0), 0) || 0;
            const totalHours = parseFloat((teachingHrs + ancillaryHrs).toFixed(1));

            const sorted = t.burnout_assessments?.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const latest = sorted && sorted.length > 0 ? sorted[0] : null;

            if (latest && latest.risk_index != null) {
                const riskIndex = parseFloat(latest.risk_index);
                scatterPoints.push({
                    x: totalHours,
                    y: riskIndex,
                    isHighRisk: riskIndex > 70,
                    name: t.fullName || 'Teacher'
                });
            }
        });

        if (!teachers || teachers.length === 0 || scatterPoints.length === 0) {
            scatterCanvas.parentElement.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; min-height:220px; color:#94a3b8; font-size:0.9rem; font-weight:500;">No data available yet.</div>`;
        } else {
            workloadChartInstance = new Chart(scatterCanvas.getContext('2d'), {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Teachers',
                        data: scatterPoints,
                        backgroundColor: function(context) {
                            return context.raw?.isHighRisk ? '#C8102E' : '#0038A8';
                        },
                        pointRadius: 7,
                        pointHoverRadius: 9
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    const pt = ctx.raw;
                                    return `${pt.name}: ${pt.x} hrs/wk | Risk Index: ${pt.y}${pt.isHighRisk ? ' (High Risk)' : ''}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: { title: { display: true, text: 'Burnout Risk Index' }, min: 0, max: 100 },
                        x: { title: { display: true, text: 'Total Workload (Hours / Week)' }, beginAtZero: true }
                    }
                }
            });
        }
    }
}

function renderPrincipalFacultyTable(teachers) {
    const tableBody = document.querySelector('#facultyTableBody');
    if (tableBody) {
        tableBody.innerHTML = '';

        if (teachers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1.5rem;">No registered faculty profiles found.</td></tr>`;
        } else {
            teachers.forEach(teacher => {
                let statusBadge = `<span class="status-pending">OPTIMAL</span>`;
                if (teacher.status === 'OVERLOAD' || teacher.status === 'OVERLOADED') {
                    statusBadge = `<span class="status-overload">OVERLOADED</span>`;
                } else if (teacher.status === 'MAXIMIZED' || teacher.status === 'HIGH') {
                    statusBadge = `<span class="status-active">MAXIMIZED</span>`;
                }

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${teacher.teacherCode}</td>
                    <td><span class="admin-teacher-name">${teacher.fullName}</span></td>
                    <td>${teacher.department || 'General'}</td>
                    <td><span class="admin-load-value">${teacher.totalJDS} WLU (${teacher.totalLoadHrs}h)</span></td>
                    <td>${statusBadge}</td>
                    <td><button class="action-btn action-btn--simulate" onclick="viewTeacherDetail('${teacher.id}')">Review eSF7</button></td>
                `;
                tableBody.appendChild(row);
            });
        }
    }

    const directoryGrid = document.querySelector('.directory-grid');
    if (directoryGrid) {
        directoryGrid.innerHTML = '';

        if (teachers.length === 0) {
            directoryGrid.innerHTML = `<div class="info-box" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">No registered teachers found in database.</div>`;
            return;
        }

        teachers.forEach(teacher => {
            const department = teacher.department || 'Unassigned Level';
            const card = document.createElement('div');
            card.className = 'info-box teacher-card-item';
            card.style.cssText = 'display: flex; flex-direction: column; justify-content: space-between; height: 100%;';
            
            card.innerHTML = `
                <div class="esf-header" style="margin-bottom: 1rem;">
                    <div>
                        <div class="esf-name" style="font-weight: 600; font-size: 1.1rem;">${teacher.fullName}</div>
                        <div class="esf-role" style="color: #64748b; font-size: 0.9rem;">${department}</div>
                        <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                            <strong>Job Demand Score:</strong> ${teacher.totalJDS} WLU
                        </div>
                    </div>
                </div>
                <button class="btn btn-outline" style="width: 100%; margin-top: 1rem;" onclick="window.location.href='classprogram.html?teacherId=${teacher.id}'">📄 View Class Program</button>
            `;
            directoryGrid.appendChild(card);
        });
    }
}

function setupDirectorySearch() {
    const searchInput = document.querySelector('.search-bar');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const cards = document.querySelectorAll('.teacher-card-item');

        cards.forEach(card => {
            const name = card.querySelector('.esf-name')?.innerText.toLowerCase() || '';
            const role = card.querySelector('.esf-role')?.innerText.toLowerCase() || '';

            if (name.includes(searchTerm) || role.includes(searchTerm)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

function viewTeacherDetail(teacherId) {
    alert("Opening eSF7 Workload Breakdown for Teacher ID: " + teacherId);
}

if (typeof window.showTeacherList !== 'function') {
    window.showTeacherList = function (status) {
        console.log(`[Teacher List Handler] Filter applied: ${status}`);
    };
}

// Simulator State
let totalDeduction = 0;
const baseHours = 48;

function toggleRowSimulation(rowId, hours) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const btn = row.querySelector('.action-btn--simulate');
    
    if (row.classList.contains('simulated-active')) {
        row.classList.remove('simulated-active');
        row.style.background = 'transparent';
        if (btn) {
            btn.textContent = 'Simulate';
            btn.style.background = '#e2e8f0';
            btn.style.color = '#334155';
        }
        totalDeduction -= hours;
    } else {
        row.classList.add('simulated-active');
        row.style.background = '#f0fdf4';
        if (btn) {
            btn.textContent = 'Simulated ✓';
            btn.style.background = '#16a34a';
            btn.style.color = '#ffffff';
        }
        totalDeduction += hours;
    }

    updateSimulatorDisplay();
}

function applyAllSimulations() {
    ['row-sim-1', 'row-sim-2', 'row-sim-3'].forEach(id => {
        const row = document.getElementById(id);
        if (row && !row.classList.contains('simulated-active')) {
            row.click();
        }
    });
}

function updateSimulatorDisplay() {
    const newHours = Math.max(35, baseHours - totalDeduction);
    const currentHoursElem = document.getElementById('jdc-current-hours');
    
    if (currentHoursElem) {
        if (totalDeduction > 0) {
            currentHoursElem.innerHTML = `<s style="color:#dc2626;">48 hrs</s> → <strong style="color:#16a34a;">${newHours} hrs/wk</strong>`;
        } else {
            currentHoursElem.textContent = '48 hrs/wk';
        }
    }

    const apBar = document.getElementById('ap-dept-bar');
    const apScore = document.getElementById('ap-dept-score');
    
    if (apBar && apScore) {
        if (totalDeduction >= 13) {
            apBar.style.width = '55%';
            apBar.style.background = '#16a34a';
            apScore.textContent = 'Avg: 42 WLU (Optimal)';
            apScore.style.color = '#16a34a';
        } else {
            apBar.style.width = '85%';
            apBar.style.background = '#dc2626';
            apScore.textContent = 'Avg: 78 WLU (Overloaded)';
            apScore.style.color = '#dc2626';
        }
    }
}

function exportSimulationReport() {
    alert("Reallocation Summary Report generated successfully!\n\nProposed Reassignments:\n• Grade 9 Advisory -> M. Santos (-8 hrs)\n• SDRRM Coordinator -> R. Garcia (-5 hrs)\n• Grade 7 Homeroom -> L. Bautista (-6 hrs)\n\nNew Target Workload: 42 WLU (Optimal)");
}

document.addEventListener('DOMContentLoaded', () => {
    const workloadBtn = document.getElementById('openWorkloadReportBtn');
    if (workloadBtn) {
        workloadBtn.addEventListener('click', () => {
            window.location.href = 'workload_reports_directory.html';
        });
    }

    const burnoutBtn = document.getElementById('openBurnoutReportBtn');
    if (burnoutBtn) {
        burnoutBtn.addEventListener('click', () => {
            window.location.href = 'burnout_reports_directory.html';
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const teacherCode = urlParams.get('code');
    if (teacherCode) {
        const codeElem = document.getElementById('diagnosticTeacherCode');
        if (codeElem) codeElem.textContent = teacherCode;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const burnoutDatabase = {
        'TCH-012': {
            eeScore: 31, eeTier: 'High',
            dpScore: 15, dpTier: 'High',
            paScore: 26, paTier: 'Low (Reduced Efficacy)',
            overallRisk: 'HIGH BURNOUT RISK',
            workload: '48.0 hrs/week (Overloaded)',
            department: 'Araling Panlipunan',
            riskClass: 'text-danger'
        },
        'TCH-018': {
            eeScore: 28, eeTier: 'High',
            dpScore: 14, dpTier: 'High',
            paScore: 28, paTier: 'Low (Reduced Efficacy)',
            overallRisk: 'HIGH BURNOUT RISK',
            workload: '46.5 hrs/week (Overloaded)',
            department: 'English',
            riskClass: 'text-danger'
        },
        'TCH-003': {
            eeScore: 22, eeTier: 'Moderate',
            dpScore: 9,  dpTier: 'Moderate',
            paScore: 33, paTier: 'Moderate Efficacy',
            overallRisk: 'MODERATE BURNOUT RISK',
            workload: '40.0 hrs/week (High Load)',
            department: 'Science',
            riskClass: 'text-warning'
        },
        'TCH-008': {
            eeScore: 12, eeTier: 'Low',
            dpScore: 4,  dpTier: 'Low',
            paScore: 41, paTier: 'High Efficacy',
            overallRisk: 'LOW BURNOUT RISK',
            workload: '36.0 hrs/week (Optimal)',
            department: 'Mathematics',
            riskClass: 'text-success'
        },
        'TCH-004': {
            eeScore: 10, eeTier: 'Low',
            dpScore: 3,  dpTier: 'Low',
            paScore: 44, paTier: 'High Efficacy',
            overallRisk: 'LOW BURNOUT RISK',
            workload: '28.0 hrs/week (Underload)',
            department: 'MAPEH',
            riskClass: 'text-success'
        }
    };

    const urlParams = new URLSearchParams(window.location.search);
    const teacherCode = urlParams.get('code');
    if (!teacherCode) return;

    const teacherData = burnoutDatabase[teacherCode] || burnoutDatabase['TCH-012'];

    const codeElem = document.getElementById('diagnosticTeacherCode');
    if (codeElem) codeElem.textContent = teacherCode;

    const tierElem = document.querySelector('.overall-tier-box .tier-val');
    if (tierElem) {
        tierElem.textContent = teacherData.overallRisk;
        tierElem.className = `tier-val ${teacherData.riskClass}`;
    }

    const infoRows = document.querySelectorAll('.profile-info-table tr');
    if (infoRows.length >= 4) {
        infoRows[2].querySelectorAll('td')[1].textContent = teacherData.department;
        const workloadTd = infoRows[3].querySelectorAll('td')[1];
        workloadTd.textContent = teacherData.workload;
        workloadTd.className = `info-val ${teacherData.riskClass}`;
    }

    const eeScoreElem = document.querySelector('.subscales-grid .subscale-card:nth-child(1) .subscale-score');
    if (eeScoreElem) eeScoreElem.innerHTML = `${teacherData.eeScore} <span class="subscale-max">/ 54</span>`;

    const dpScoreElem = document.querySelector('.subscales-grid .subscale-card:nth-child(2) .subscale-score');
    if (dpScoreElem) dpScoreElem.innerHTML = `${teacherData.dpScore} <span class="subscale-max">/ 30</span>`;

    const paScoreElem = document.querySelector('.subscales-grid .subscale-card:nth-child(3) .subscale-score');
    if (paScoreElem) paScoreElem.innerHTML = `${teacherData.paScore} <span class="subscale-max">/ 48</span>`;
});