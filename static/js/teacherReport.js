// static/js/teacherReport.js - Dynamic Institutional Assessment Report Controller

// TODO(post-demo): consolidate into static/js/workloadManager.js to remove
// duplication with teacherDashboard.js. Copied verbatim — do not edit here
// without editing the original.
function parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.split('-');
    if (parts.length < 2) return null;

    function parseSingleTime(str) {
        let s = str.trim().toUpperCase();
        const isPM = s.includes('PM');
        const isAM = s.includes('AM');
        s = s.replace(/(AM|PM)/g, '').trim();
        const colonParts = s.split(':');
        if (colonParts.length === 0 || !colonParts[0]) return null;
        let h = parseInt(colonParts[0], 10);
        let m = colonParts.length > 1 ? parseInt(colonParts[1], 10) : 0;
        if (isNaN(h)) return null;
        if (isNaN(m)) m = 0;

        if (isPM && h < 12) h += 12;
        else if (isAM && h === 12) h = 0;
        else if (!isPM && !isAM) {
            // DepEd typical elementary timetable: 1:00-6:00 are PM
            if (h >= 1 && h <= 6) h += 12;
        }
        return h * 60 + m;
    }

    const startMins = parseSingleTime(parts[0]);
    let endMins = parseSingleTime(parts[1]);
    if (startMins === null || endMins === null) return null;

    // Handle cross-noon wrap (e.g., 11:00 - 1:00)
    if (endMins < startMins && endMins + 720 > startMins) {
        endMins += 720;
    }

    const durationMins = Math.max(0, endMins - startMins);
    return { startMins, endMins, durationMins };
}

// TODO(post-demo): consolidate into static/js/workloadManager.js to remove
// duplication with teacherDashboard.js. Copied verbatim — do not edit here
// without editing the original.
function calculateWSI(data) {
    if (!data || !data.scheduleMatrix || !Array.isArray(data.scheduleMatrix) || data.scheduleMatrix.length === 0) {
        return null;
    }

    let minStart = Infinity;
    let maxEnd = -Infinity;
    let teachingMins = 0;
    let breakMins = 0;
    let afterHoursMins = 0;

    const breakKeywords = ['break', 'recess', 'lunch'];

    data.scheduleMatrix.forEach(row => {
        const timeObj = parseTimeToMinutes(row.time);
        if (!timeObj) return;

        const { startMins, endMins, durationMins } = timeObj;
        if (startMins < minStart) minStart = startMins;
        if (endMins > maxEnd) maxEnd = endMins;

        const rowText = `${row.mon || ''} ${row.tue || ''} ${row.wed || ''} ${row.thu || ''} ${row.fri || ''} ${row.time || ''}`.toLowerCase();
        const isBreak = breakKeywords.some(keyword => rowText.includes(keyword));
        const isAfterHours = startMins >= (16 * 60); // 16:00 (4:00 PM)

        if (isBreak) {
            breakMins += durationMins;
        } else if (isAfterHours) {
            afterHoursMins += durationMins;
        } else {
            teachingMins += durationMins;
        }
    });

    if (minStart === Infinity || maxEnd === -Infinity) return null;

    const schoolStart = minStart;
    const schoolEnd = maxEnd;
    const baseHours = Math.max(0, (schoolEnd - schoolStart) / 60);

    // Multipliers based on DepEd research
    const baseScore = baseHours * 1.0;
    const overloadHours = Math.max(0, (teachingMins / 60) - 6);
    const overloadScore = overloadHours * 2.0;
    const afterHoursScore = (afterHoursMins / 60) * 3.0;
    const prepScore = (teachingMins / 60) * 0.5;
    const breakBuffer = (breakMins / 60) * 0.5;

    const dailyWSI = baseScore + overloadScore + afterHoursScore + prepScore - breakBuffer;
    const weeklyWSI = Math.max(0, dailyWSI * 5);

    // Risk Level determination
    let riskLevel = 'Low Risk';
    if (weeklyWSI > 80) {
        riskLevel = 'Critical Risk';
    } else if (weeklyWSI >= 61) {
        riskLevel = 'High Risk';
    } else if (weeklyWSI >= 41) {
        riskLevel = 'Moderate Risk';
    }

    return {
        schoolStart,
        schoolEnd,
        baseHours,
        teachingMins,
        breakMins,
        afterHoursMins,
        overloadHours,
        dailyWSI,
        weeklyWSI,
        riskLevel
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup print handler
    const printBtn = document.getElementById('printReportBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // 2. Mobile sidebar drawer handler
    const burgerBtn = document.getElementById('burgerMenuBtn');
    const appShell = document.getElementById('appShell');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (burgerBtn && appShell) {
        burgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = appShell.classList.toggle('sidebar-open');
            if (backdrop) backdrop.classList.toggle('active', isOpen);
        });
        if (backdrop) {
            backdrop.addEventListener('click', () => {
                appShell.classList.remove('sidebar-open');
                backdrop.classList.remove('active');
            });
        }
    }

    // 3. Authenticate & fetch user session
    if (!window.supabaseClient) {
        console.error('[TeacherReport] Supabase client not initialized.');
        return;
    }

    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (!session || sessionError) {
        console.warn('[TeacherReport] No active session found.');
        return;
    }

    let targetUserId = session.user.id;
    let targetAssessmentId = null;

    const urlParams = new URLSearchParams(window.location.search);
    const queryId = urlParams.get('id');
    const queryTeacherId = urlParams.get('teacher_id') || urlParams.get('teacherId');

    if (queryTeacherId) {
        targetUserId = queryTeacherId;
    } else if (queryId) {
        // Check if queryId is a teacher profile ID or an assessment ID
        try {
            const { data: maybeProfile } = await window.supabaseClient
                .from('profiles')
                .select('id')
                .eq('id', queryId)
                .maybeSingle();

            if (maybeProfile) {
                targetUserId = maybeProfile.id;
            } else {
                targetAssessmentId = queryId;
            }
        } catch (e) {
            targetAssessmentId = queryId;
        }
    }

    try {
        // 4. Fetch User Profile
        const { data: profile, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', targetUserId)
            .single();

        if (profileError) {
            console.error('[TeacherReport] Profile fetch error:', profileError.message);
        }

        // 5. Fetch Teaching Loads & Ancillary Duties
        const [{ data: teachingLoads }, { data: ancillaryDuties }] = await Promise.all([
            window.supabaseClient
                .from('teaching_loads')
                .select('*')
                .eq('teacher_id', targetUserId),
            window.supabaseClient
                .from('ancillary_duties')
                .select('*')
                .eq('teacher_id', targetUserId)
        ]);

        // Resolve Class Program from Supabase profile or localStorage fallback
        let resolvedClassProgram = profile?.class_program || null;
        if (!resolvedClassProgram) {
            try {
                const cached = localStorage.getItem(`kandili_extracted_class_program_${targetUserId}`);
                if (cached) resolvedClassProgram = JSON.parse(cached);
            } catch (e) {
                console.warn('[TeacherReport] Unable to parse cached class_program:', e);
            }
        }

        const wsiResult = (typeof calculateWSI === 'function' && resolvedClassProgram)
            ? calculateWSI(resolvedClassProgram) : null;
        const wsiValue = wsiResult && wsiResult.weeklyWSI != null
            ? Math.round(Number(wsiResult.weeklyWSI)) : null;

        // 6. Compute Workload Hours & WLU using unified window.calculateWLUDetails(profile)
        const enrichedProfile = {
            ...(profile || {}),
            class_program: resolvedClassProgram,
            teaching_loads: teachingLoads || [],
            ancillary_duties: ancillaryDuties || []
        };

        const wlu = (typeof window.calculateWLUDetails === 'function')
            ? window.calculateWLUDetails(enrichedProfile)
            : {
                teachingHours: 0,
                ancillaryHours: 0,
                assignmentHours: 0,
                totalHours: 0,
                totalJDS: 0,
                status: 'UNDERLOAD'
            };

        const teachingHours = Number(wlu.teachingHours || 0);
        const ancillaryHours = Number((wlu.ancillaryHours || 0) + (wlu.assignmentHours || 0));
        const totalWorkloadHours = Number(wlu.totalHours || 0);
        const totalWlu = Number(wlu.totalJDS || 0);

        // 7. Fetch Burnout Assessments (order by created_at desc)
        let assessmentQuery = window.supabaseClient
            .from('burnout_assessments')
            .select('id, risk_index, ee_score, dp_score, pa_score, created_at')
            .eq('teacher_id', targetUserId);

        if (targetAssessmentId) {
            assessmentQuery = assessmentQuery.eq('id', targetAssessmentId).limit(1);
        } else {
            assessmentQuery = assessmentQuery.order('created_at', { ascending: false });
        }

        const { data: assessments, error: assessError } = await assessmentQuery;
        if (assessError) {
            console.error('[TeacherReport] Assessment fetch error:', assessError.message);
        }

        // 8. Classify overall burnout status using unified window.classifyBurnoutStatus(teacher)
        enrichedProfile.burnout_assessments = assessments || [];
        const burnout = (typeof window.classifyBurnoutStatus === 'function')
            ? window.classifyBurnoutStatus(enrichedProfile)
            : {
                hasAssessment: false,
                latestAssessment: null,
                riskIndex: null,
                ee: null,
                dp: null,
                pa: null,
                tier: 'unassessed',
                label: 'UNASSESSED'
            };

        const latestAssessment = burnout.latestAssessment;

        // Helper: Safe DOM text setter
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        // 9. Populate Profile, Workload, & Metadata Fields
        const teacherCode = profile?.teacher_code || '—';
        const firstName = profile?.first_name || '';
        const lastName = profile?.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
            || session.user.user_metadata?.full_name
            || session.user.email
            || '—';

        const role = profile?.role ? (profile.role.charAt(0).toUpperCase() + profile.role.slice(1)) : 'Teacher';
        const advisoryClass = profile?.advisory_class || resolvedClassProgram?.section || '';
        const positionTitle = advisoryClass ? `${role} / Class Adviser` : role;
        const assignedSection = advisoryClass || (profile?.department ? `${profile.department} Department` : '—');
        const schoolName = profile?.school || profile?.assigned_institution || '—';
        const assessmentCycle = burnout.hasAssessment ? 'Trimester 1 (SY 2026–2027)' : '—';
        const reportId = teacherCode !== '—' ? `RPT-${teacherCode}-T1` : '—';
        const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const assessmentDateStr = latestAssessment?.created_at
            ? new Date(latestAssessment.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : '—';

        const workloadHoursLabel = `${totalWorkloadHours.toFixed(1)} hrs`;
        const wluLabel = `${totalWlu.toFixed(1)} WLU`;

        setTxt('reportTeacherCode', teacherCode);
        setTxt('gridTeacherCode', teacherCode);
        setTxt('reportId', reportId);
        setTxt('reportGeneratedDate', generatedDate);
        setTxt('facultyName', fullName);
        setTxt('facultyPosition', positionTitle);
        setTxt('assignedSection', assignedSection);
        setTxt('facultySchool', schoolName);
        setTxt('reportWorkloadHours', workloadHoursLabel);
        setTxt('reportWluScore', wluLabel);
        setTxt('reportWsiScore', wsiValue != null ? String(wsiValue) : '—');
        setTxt('assessmentDate', assessmentDateStr);
        setTxt('assessmentCycle', assessmentCycle);

        // 10. Tier Badge Styling Convention (matching Principal KPI & Burnout Directory)
        const getTierBadgeInfo = (tier) => {
            switch ((tier || '').toLowerCase()) {
                case 'high':
                    return {
                        label: 'HIGH RISK',
                        style: 'background:#ffe4e6; color:#be123c; border:1px solid #fecdd3; padding:0.25rem 0.65rem; border-radius:999px; font-weight:700; font-size:0.75rem;'
                    };
                case 'moderate':
                    return {
                        label: 'MODERATE RISK',
                        style: 'background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:0.25rem 0.65rem; border-radius:999px; font-weight:700; font-size:0.75rem;'
                    };
                case 'low':
                    return {
                        label: 'LOW RISK',
                        style: 'background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:0.25rem 0.65rem; border-radius:999px; font-weight:700; font-size:0.75rem;'
                    };
                default:
                    return {
                        label: 'UNASSESSED',
                        style: 'background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; padding:0.25rem 0.65rem; border-radius:999px; font-weight:700; font-size:0.75rem;'
                    };
            }
        };

        const tierInfo = getTierBadgeInfo(burnout.tier);

        // Update Document Header Status Badge
        const statusBadge = document.getElementById('reportStatusBadge');
        if (statusBadge) {
            statusBadge.textContent = tierInfo.label;
            statusBadge.setAttribute('style', tierInfo.style);
        }

        // Update Overall Burnout Risk row in MBI Table
        const scoreOverallRisk = document.getElementById('scoreOverallRisk');
        const badgeOverallRisk = document.getElementById('badgeOverallRisk');
        if (scoreOverallRisk) {
            scoreOverallRisk.textContent = burnout.hasAssessment && burnout.riskIndex != null
                ? `${Math.round(Number(burnout.riskIndex))} / 100`
                : '—';
        }
        if (badgeOverallRisk) {
            badgeOverallRisk.textContent = tierInfo.label;
            badgeOverallRisk.setAttribute('style', tierInfo.style);
        }

        if (burnout.hasAssessment && burnout.riskIndex != null) {
            const ee = burnout.ee != null ? burnout.ee : 0;
            const dp = burnout.dp != null ? burnout.dp : 0;
            const pa = burnout.pa != null ? burnout.pa : 0;
            const riskIndex = burnout.riskIndex;

            // Executive Summary Metric Box
            setTxt('mbiOverallScore', riskIndex);
            const mbiDenom = document.getElementById('mbiDenom');
            if (mbiDenom) mbiDenom.style.display = 'inline';

            const overallBar = document.getElementById('overallProgressBar');
            const overallFill = document.getElementById('overallProgressFill');
            if (overallBar) overallBar.style.display = 'block';
            if (overallFill) {
                overallFill.style.width = `${Math.min(100, Math.max(0, riskIndex))}%`;
                overallFill.style.background = burnout.tier === 'high' ? '#be123c' : (burnout.tier === 'moderate' ? '#b45309' : '#15803d');
            }

            // Subscale Numbers
            setTxt('scoreEE', `${ee} / 54`);
            setTxt('scoreDP', `${dp} / 30`);
            setTxt('scorePA', `${pa} / 48`);

            // Subscale Progress Bars
            const setBar = (barId, fillId, score, max, color) => {
                const bar = document.getElementById(barId);
                const fill = document.getElementById(fillId);
                if (bar) bar.style.display = 'block';
                if (fill) {
                    const pct = Math.min(100, Math.max(0, Math.round((score / max) * 100)));
                    fill.style.width = `${pct}%`;
                    fill.style.background = color;
                }
            };
            setBar('barEE', 'fillEE', ee, 54, '#ef4444');
            setBar('barDP', 'fillDP', dp, 30, '#f59e0b');
            setBar('barPA', 'fillPA', pa, 48, '#10b981');

            // Subscale Status Badges
            const statusEE = document.getElementById('statusEE');
            if (statusEE) {
                if (ee >= 27) {
                    statusEE.textContent = 'High Exhaustion';
                    statusEE.className = 'badge-support';
                } else if (ee >= 17) {
                    statusEE.textContent = 'Moderate Strain';
                    statusEE.className = 'badge-mod';
                } else {
                    statusEE.textContent = 'Balanced Energy';
                    statusEE.className = 'badge-good';
                }
            }

            const statusDP = document.getElementById('statusDP');
            if (statusDP) {
                if (dp >= 13) {
                    statusDP.textContent = 'Detachment Warning';
                    statusDP.className = 'badge-support';
                } else if (dp >= 7) {
                    statusDP.textContent = 'Moderate Engagement';
                    statusDP.className = 'badge-mod';
                } else {
                    statusDP.textContent = 'High Engagement';
                    statusDP.className = 'badge-good';
                }
            }

            const statusPA = document.getElementById('statusPA');
            if (statusPA) {
                if (pa >= 32) {
                    statusPA.textContent = 'High Accomplishment';
                    statusPA.className = 'badge-good';
                } else if (pa >= 22) {
                    statusPA.textContent = 'Moderate Accomplishment';
                    statusPA.className = 'badge-mod';
                } else {
                    statusPA.textContent = 'Reduced Efficacy';
                    statusPA.className = 'badge-support';
                }
            }

            // Executive Summary Heading & Text
            const summaryHeading = document.getElementById('summaryHeading');
            const summaryText = document.getElementById('summaryText');
            if (summaryHeading) {
                summaryHeading.textContent = `Overall Burnout Risk: ${tierInfo.label}`;
            }
            if (summaryText) {
                summaryText.innerHTML = `Faculty member <strong>${fullName} (${teacherCode})</strong> recorded an overall burnout classification of <strong>${tierInfo.label}</strong> (Risk Index: <strong>${riskIndex}/100</strong>) on <strong>${assessmentDateStr}</strong>, with Personal Accomplishment at <strong>${pa}/48</strong>. Calculated weekly workload: <strong>${workloadHoursLabel} (${wluLabel})</strong> (Teaching: ${teachingHours.toFixed(1)}h, Ancillary: ${ancillaryHours.toFixed(1)}h).`;
            }

            // Formula Breakdown Notes
            const eeNorm = ((ee / 54) * 100).toFixed(1);
            const dpNorm = ((dp / 30) * 100).toFixed(1);
            const eePts = (0.50 * parseFloat(eeNorm)).toFixed(2);
            const dpPts = (0.20 * parseFloat(dpNorm)).toFixed(2);

            setTxt('formulaEEText', `(${ee} / 54) × 100 = ${eeNorm}% → Contributes ${eePts} pts`);
            setTxt('formulaAncillaryText', `${workloadHoursLabel} / ${wluLabel} (Teaching: ${teachingHours.toFixed(1)}h, Ancillary: ${ancillaryHours.toFixed(1)}h)`);
            setTxt('formulaDPText', `(${dp} / 30) × 100 = ${dpNorm}% → Contributes ${dpPts} pts`);
            setTxt('formulaCompositeText', `${Math.round(Number(burnout.riskIndex))} / 100 (${tierInfo.label})`);

        } else {
            // Honest Empty State: Unassessed (No burnout assessment on file)
            setTxt('mbiOverallScore', '—');
            const mbiDenom = document.getElementById('mbiDenom');
            if (mbiDenom) mbiDenom.style.display = 'none';

            const overallBar = document.getElementById('overallProgressBar');
            if (overallBar) overallBar.style.display = 'none';

            setTxt('scoreEE', '—');
            setTxt('scoreDP', '—');
            setTxt('scorePA', '—');

            ['barEE', 'barDP', 'barPA'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            ['statusEE', 'statusDP', 'statusPA'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '—';
            });

            const summaryHeading = document.getElementById('summaryHeading');
            const summaryText = document.getElementById('summaryText');
            if (summaryHeading) summaryHeading.textContent = 'Overall Burnout Risk: UNASSESSED';
            if (summaryText) {
                summaryText.innerHTML = `Unassessed — no burnout assessment on file for <strong>${fullName} (${teacherCode})</strong>. Complete the MBI-ES assessment to generate diagnostic risk metrics. Current calculated workload: <strong>${workloadHoursLabel} (${wluLabel})</strong>.`;
            }

            setTxt('formulaEEText', '—');
            setTxt('formulaAncillaryText', `${workloadHoursLabel} / ${wluLabel}`);
            setTxt('formulaDPText', '—');
            setTxt('formulaCompositeText', 'Unassessed — no burnout assessment on file');
        }
    } catch (err) {
        console.error('[TeacherReport] Error loading teacher audit report:', err);
    }
});
