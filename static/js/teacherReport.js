// static/js/teacherReport.js - Dynamic Institutional Assessment Report Controller

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

    const userId = session.user.id;

    try {
        // 4. Fetch User Profile (select '*' to safely include first_name, last_name, teacher_code, school, department, advisory_class, class_program)
        const { data: profile, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.error('[TeacherReport] Profile fetch error:', profileError.message);
        }

        // 5. Fetch Teaching Loads & Ancillary Duties safely (select '*' avoids missing-column errors)
        const [{ data: teachingLoads }, { data: ancillaryDuties }] = await Promise.all([
            window.supabaseClient
                .from('teaching_loads')
                .select('*')
                .eq('teacher_id', userId),
            window.supabaseClient
                .from('ancillary_duties')
                .select('*')
                .eq('teacher_id', userId)
        ]);

        // Resolve Class Program from Supabase profile or localStorage fallback
        let resolvedClassProgram = profile?.class_program || null;
        if (!resolvedClassProgram) {
            try {
                const cached = localStorage.getItem(`kandili_extracted_class_program_${userId}`);
                if (cached) resolvedClassProgram = JSON.parse(cached);
            } catch (e) {
                console.warn('[TeacherReport] Unable to parse cached class_program:', e);
            }
        }

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

        // 7. Fetch Latest Burnout Assessment (or specific ?id= if navigated from Analytics)
        const urlAssessmentId = new URLSearchParams(window.location.search).get('id');
        let assessmentQuery = window.supabaseClient
            .from('burnout_assessments')
            .select('id, risk_index, ee_score, dp_score, pa_score, created_at')
            .eq('teacher_id', userId);

        if (urlAssessmentId) {
            assessmentQuery = assessmentQuery.eq('id', urlAssessmentId).limit(1);
        } else {
            assessmentQuery = assessmentQuery.order('created_at', { ascending: false }).limit(1);
        }

        const { data: assessments, error: assessError } = await assessmentQuery;
        if (assessError) {
            console.error('[TeacherReport] Assessment fetch error:', assessError.message);
        }

        const latestAssessment = assessments && assessments.length > 0 ? assessments[0] : null;

        // Helper: Safe DOM text setter
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        // 8. Populate Profile, Workload, & Metadata Fields
        const teacherCode = profile?.teacher_code || 'TCH-001';
        const firstName = profile?.first_name || '';
        const lastName = profile?.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
            || session.user.user_metadata?.full_name
            || session.user.email
            || 'Faculty Member';

        const role = profile?.role ? (profile.role.charAt(0).toUpperCase() + profile.role.slice(1)) : 'Teacher';
        const advisoryClass = profile?.advisory_class || resolvedClassProgram?.section || '';
        const positionTitle = advisoryClass ? `${role} / Class Adviser` : role;
        const assignedSection = advisoryClass || (profile?.department ? `${profile.department} Department` : 'General Faculty');
        const schoolName = profile?.school || profile?.assigned_institution || 'Unassigned Campus';
        const assessmentCycle = 'Trimester 1 Statutory Review (SY 2026–2027)';
        const reportId = `RPT-${teacherCode}-T1`;
        const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const assessmentDateStr = latestAssessment?.created_at
            ? new Date(latestAssessment.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : 'Not yet assessed';

        const workloadHoursLabel = totalWorkloadHours > 0
            ? `${totalWorkloadHours.toFixed(1)} hrs/week`
            : '0 hrs';
        const wluLabel = `${totalWlu} WLU`;

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
        setTxt('assessmentDate', assessmentDateStr);
        setTxt('assessmentCycle', assessmentCycle);

        // 9. Populate Burnout Risk Index, Subscales (EE/DP/PA), & Progress Bars
        const statusBadge = document.getElementById('reportStatusBadge');

        if (latestAssessment) {
            const ee = latestAssessment.ee_score != null ? Number(latestAssessment.ee_score) : 0;
            const dp = latestAssessment.dp_score != null ? Number(latestAssessment.dp_score) : 0;
            const pa = latestAssessment.pa_score != null ? Number(latestAssessment.pa_score) : 0;
            const riskIndex = latestAssessment.risk_index != null
                ? Math.round(parseFloat(latestAssessment.risk_index))
                : Math.round(((ee / 54) * 50) + ((dp / 30) * 30) + (((48 - pa) / 48) * 20));

            // Unified Risk Status Classification (>=70 High Risk, >=40 Moderate Risk, <40 Low Risk)
            const riskStatusLabel = riskIndex >= 70
                ? 'High Risk'
                : (riskIndex >= 40 ? 'Moderate Risk' : 'Low Risk');

            if (statusBadge) {
                statusBadge.textContent = riskStatusLabel;
                if (riskIndex >= 70) {
                    statusBadge.style.background = '#fee2e2';
                    statusBadge.style.color = '#dc2626';
                    statusBadge.style.border = '1px solid #fca5a5';
                } else if (riskIndex >= 40) {
                    statusBadge.style.background = '#fef3c7';
                    statusBadge.style.color = '#b45309';
                    statusBadge.style.border = '1px solid #fde68a';
                } else {
                    statusBadge.style.background = '#dcfce7';
                    statusBadge.style.color = '#166534';
                    statusBadge.style.border = '1px solid #86efac';
                }
            }

            // Overall Risk Score & Progress Bar
            setTxt('mbiOverallScore', riskIndex);
            const mbiDenom = document.getElementById('mbiDenom');
            if (mbiDenom) mbiDenom.style.display = 'inline';

            const overallBar = document.getElementById('overallProgressBar');
            const overallFill = document.getElementById('overallProgressFill');
            if (overallBar) overallBar.style.display = 'block';
            if (overallFill) {
                overallFill.style.width = `${Math.min(100, Math.max(0, riskIndex))}%`;
                overallFill.style.background = riskIndex >= 70 ? '#dc2626' : (riskIndex >= 40 ? '#f59e0b' : '#10b981');
            }

            // Subscale Numbers (with /54, /30, /48 denominators)
            setTxt('scoreEE', `${ee} / 54`);
            setTxt('scoreDP', `${dp} / 30`);
            setTxt('scorePA', `${pa} / 48`);

            // Subscale Progress Bars: percentage = (score / max) * 100
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
                    statusEE.textContent = 'Rest Buffer Recommended';
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
                    statusDP.textContent = 'Moderate Efficacy';
                    statusDP.className = 'badge-mod';
                } else {
                    statusDP.textContent = 'High Engagement';
                    statusDP.className = 'badge-good';
                }
            }

            const statusPA = document.getElementById('statusPA');
            if (statusPA) {
                if (pa >= 32) {
                    statusPA.textContent = 'Satisfactory Achievement';
                    statusPA.className = 'badge-good';
                } else if (pa >= 22) {
                    statusPA.textContent = 'Moderate Accomplishment';
                    statusPA.className = 'badge-mod';
                } else {
                    statusPA.textContent = 'Reduced Efficacy';
                    statusPA.className = 'badge-support';
                }
            }

            // Executive Summary Text
            const summaryHeading = document.getElementById('summaryHeading');
            const summaryText = document.getElementById('summaryText');
            if (summaryHeading) {
                summaryHeading.textContent = riskIndex >= 70
                    ? 'High Risk — Targeted Workload Relief Required'
                    : (riskIndex >= 40 ? 'Moderate Risk — Proactive Support Recommended' : 'Low Risk — Sustainable Workload Maintained');
            }
            if (summaryText) {
                summaryText.innerHTML = `Faculty member <strong>${fullName} (${teacherCode})</strong> recorded a composite Risk Index of <strong>${riskIndex}/100 (${riskStatusLabel})</strong> on <strong>${assessmentDateStr}</strong>, with Personal Accomplishment at <strong>${pa}/48</strong>. Calculated weekly workload is <strong>${workloadHoursLabel} (${wluLabel})</strong> (Teaching: ${teachingHours.toFixed(1)}h, Ancillary: ${ancillaryHours.toFixed(1)}h).`;
            }

            // Formula Breakdown Notes
            const eeNorm = ((ee / 54) * 100).toFixed(1);
            const dpNorm = ((dp / 30) * 100).toFixed(1);
            const eePts = (0.50 * parseFloat(eeNorm)).toFixed(2);
            const dpPts = (0.20 * parseFloat(dpNorm)).toFixed(2);

            setTxt('formulaEEText', `(${ee} / 54) \u00D7 100 = ${eeNorm}% \u2192 Contributes ${eePts} pts`);
            setTxt('formulaAncillaryText', `${workloadHoursLabel} / ${wluLabel} (Teaching: ${teachingHours.toFixed(1)}h, Ancillary: ${ancillaryHours.toFixed(1)}h)`);
            setTxt('formulaDPText', `(${dp} / 30) \u00D7 100 = ${dpNorm}% \u2192 Contributes ${dpPts} pts`);
            setTxt('formulaCompositeText', `${riskIndex} / 100 (${riskStatusLabel})`);

            // Recommendations
            const reco1 = document.getElementById('recoAction1');
            const reco2 = document.getElementById('recoAction2');
            if (reco1) {
                reco1.innerHTML = riskIndex >= 70
                    ? `<strong>Ancillary Reallocation:</strong> Coordinate with your school head to offload excess ancillary duties (${ancillaryHours.toFixed(1)} hrs/wk) and lower your ${wluLabel} strain.`
                    : (riskIndex >= 40
                        ? `<strong>Task Batching:</strong> Allocate 1.5 to 2.0 consecutive hours of protected administrative time for learner record encoding and lesson preparation.`
                        : `<strong>Capacity Maintenance:</strong> Maintain your balanced workload (${workloadHoursLabel}, ${wluLabel}) and continue observing DepEd contact hour standards.`);
            }
            if (reco2) {
                reco2.innerHTML = riskIndex >= 70
                    ? `<strong>Protected Rest Window:</strong> Implement scheduled recovery windows between consecutive teaching periods and prioritize wellness support.`
                    : (riskIndex >= 40
                        ? `<strong>Peer Advisory Check-in:</strong> Participate in bi-weekly department check-ins to monitor load distribution early.`
                        : `<strong>Growth & Mentorship:</strong> Leverage your positive professional efficacy (PA = ${pa}/48) to support colleagues in instructional planning.`);
            }

        } else {
            // Graceful fallback when NO assessment exists
            if (statusBadge) {
                statusBadge.textContent = 'Not yet assessed';
                statusBadge.style.background = '#f1f5f9';
                statusBadge.style.color = '#64748b';
                statusBadge.style.border = '1px solid #cbd5e1';
            }

            setTxt('mbiOverallScore', 'Not yet assessed');
            const mbiDenom = document.getElementById('mbiDenom');
            if (mbiDenom) mbiDenom.style.display = 'none';

            const overallBar = document.getElementById('overallProgressBar');
            if (overallBar) overallBar.style.display = 'none';

            setTxt('scoreEE', 'Not yet assessed');
            setTxt('scoreDP', 'Not yet assessed');
            setTxt('scorePA', 'Not yet assessed');

            ['barEE', 'barDP', 'barPA'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            ['statusEE', 'statusDP', 'statusPA'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = 'N/A';
            });

            const summaryHeading = document.getElementById('summaryHeading');
            const summaryText = document.getElementById('summaryText');
            if (summaryHeading) summaryHeading.textContent = 'Assessment Pending';
            if (summaryText) {
                summaryText.innerHTML = `No burnout assessment recorded yet for <strong>${fullName} (${teacherCode})</strong>. Complete the MBI-ES assessment to generate diagnostic risk metrics. Current calculated workload: <strong>${workloadHoursLabel} (${wluLabel})</strong>.`;
            }

            setTxt('formulaEEText', 'Not yet assessed');
            setTxt('formulaAncillaryText', `${workloadHoursLabel} / ${wluLabel} logged`);
            setTxt('formulaDPText', 'Not yet assessed');
            setTxt('formulaCompositeText', 'Not yet assessed');

            const reco1 = document.getElementById('recoAction1');
            const reco2 = document.getElementById('recoAction2');
            if (reco1) reco1.innerHTML = '<strong>Take Burnout Assessment:</strong> Complete the quarterly 22-item MBI-Educators Survey to unlock personalized wellness recommendations.';
            if (reco2) reco2.innerHTML = '<strong>Upload Class Program:</strong> Ensure your official class program spreadsheet is uploaded on your Teacher Dashboard to calculate contact hours and WLU.';
        }
    } catch (err) {
        console.error('[TeacherReport] Error loading teacher audit report:', err);
    }
});
