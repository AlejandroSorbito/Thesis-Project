document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Guard check for teacher role
    if (typeof checkAuthAndRole === 'function') {
        checkAuthAndRole('teacher');
    }

    // 2. Setup print handler
    const printBtn = document.getElementById('printReportBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // 3. Mobile sidebar drawer handler
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

    // 4. Authenticate & fetch user data
    if (!window.supabaseClient) {
        console.error('Supabase client not initialized.');
        return;
    }

    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (!session || sessionError) {
        return;
    }

    const userId = session.user.id;

    try {
        // Fetch Profile
        const { data: profile } = await window.supabaseClient
            .from('profiles')
            .select('first_name, last_name, teacher_code, department, advisory_class, role, class_program')
            .eq('id', userId)
            .single();

        // Fetch Latest Burnout Assessment
        const { data: assessments } = await window.supabaseClient
            .from('burnout_assessments')
            .select('risk_index, ee_score, dp_score, pa_score, created_at')
            .eq('teacher_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);

        const latestAssessment = assessments && assessments.length > 0 ? assessments[0] : null;

        // Fetch Teaching Loads & Ancillary Duties
        const { data: teachingLoads } = await window.supabaseClient
            .from('teaching_loads')
            .select('minutes_per_week')
            .eq('teacher_id', userId);

        const { data: ancillaryDuties } = await window.supabaseClient
            .from('ancillary_duties')
            .select('duty_name, hours_per_week, hours')
            .eq('teacher_id', userId);

        // Calculate Workload Hours
        const totalTeachingMinutes = (teachingLoads || []).reduce((sum, item) => sum + (item.minutes_per_week || 0), 0);
        const teachingHours = totalTeachingMinutes / 60;
        const ancillaryHours = (ancillaryDuties || []).reduce((sum, item) => sum + parseFloat(item.hours_per_week || item.hours || 0), 0);
        let totalWorkloadHours = teachingHours + ancillaryHours;

        if (totalWorkloadHours === 0 && profile?.class_program?.totalLogged) {
            totalWorkloadHours = parseFloat(profile.class_program.totalLogged) || 0;
        }

        // Helper: Safe DOM text setter
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        // Populate Profile Fields
        const teacherCode = profile?.teacher_code || 'TCH-001';
        const firstName = profile?.first_name || '';
        const lastName = profile?.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ') || session.user.user_metadata?.full_name || 'Faculty Member';
        const role = profile?.role ? (profile.role.charAt(0).toUpperCase() + profile.role.slice(1)) : 'Teacher';
        const advisory = profile?.advisory_class ? ' / Class Adviser' : '';
        const positionTitle = `${role}${advisory}`;
        const assignedSection = profile?.advisory_class || (profile?.department ? `${profile.department} Department` : 'General Faculty');
        const assessmentCycle = 'Trimester 1 Statutory Review (SY 2026–2027)';
        const reportId = `RPT-${teacherCode}-T1`;
        const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        setTxt('reportTeacherCode', teacherCode);
        setTxt('gridTeacherCode', teacherCode);
        setTxt('reportId', reportId);
        setTxt('reportGeneratedDate', generatedDate);
        setTxt('facultyName', fullName);
        setTxt('facultyPosition', positionTitle);
        setTxt('assignedSection', assignedSection);
        setTxt('assessmentCycle', assessmentCycle);

        // Populate Assessment & Risk Data
        const statusBadge = document.getElementById('reportStatusBadge');

        if (latestAssessment) {
            const riskIndex = typeof latestAssessment.risk_index === 'number'
                ? Math.round(latestAssessment.risk_index)
                : parseFloat(latestAssessment.risk_index || 0);
            const ee = latestAssessment.ee_score ?? 0;
            const dp = latestAssessment.dp_score ?? 0;
            const pa = latestAssessment.pa_score ?? 0;

            // Status Badge
            if (statusBadge) {
                if (riskIndex > 70) {
                    statusBadge.textContent = 'Critical Support Needed';
                    statusBadge.style.background = '#fee2e2';
                    statusBadge.style.color = '#dc2626';
                    statusBadge.style.border = '1px solid #fca5a5';
                } else if (riskIndex > 40) {
                    statusBadge.textContent = 'Support Recommended';
                    statusBadge.style.background = '#fef3c7';
                    statusBadge.style.color = '#b45309';
                    statusBadge.style.border = '1px solid #fde68a';
                } else {
                    statusBadge.textContent = 'Optimal Status';
                    statusBadge.style.background = '#dcfce7';
                    statusBadge.style.color = '#166534';
                    statusBadge.style.border = '1px solid #86efac';
                }
            }

            // Overall Score
            setTxt('mbiOverallScore', riskIndex);
            const mbiDenom = document.getElementById('mbiDenom');
            if (mbiDenom) mbiDenom.style.display = 'inline';

            const overallBar = document.getElementById('overallProgressBar');
            const overallFill = document.getElementById('overallProgressFill');
            if (overallBar) overallBar.style.display = 'block';
            if (overallFill) {
                overallFill.style.width = `${Math.min(100, Math.max(0, riskIndex))}%`;
                overallFill.style.background = riskIndex > 70 ? '#dc2626' : (riskIndex > 40 ? '#f59e0b' : '#10b981');
            }

            // Subscale Numbers
            setTxt('scoreEE', `${ee} / 54`);
            setTxt('scoreDP', `${dp} / 30`);
            setTxt('scorePA', `${pa} / 48`);

            // Subscale Progress Bars
            const setBar = (barId, fillId, val, max, color) => {
                const bar = document.getElementById(barId);
                const fill = document.getElementById(fillId);
                if (bar) bar.style.display = 'block';
                if (fill) {
                    fill.style.width = `${Math.min(100, Math.max(0, Math.round((val / max) * 100)))}%`;
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

            // Summary Text
            const summaryHeading = document.getElementById('summaryHeading');
            const summaryText = document.getElementById('summaryText');
            if (summaryHeading) {
                summaryHeading.textContent = riskIndex > 70
                    ? 'Targeted Workload Relief & Capacity Optimization Required'
                    : (riskIndex > 40 ? 'Proactive Support & Capacity Optimization Identified' : 'Sustainable Workload & Positive Well-being Maintained');
            }
            if (summaryText) {
                summaryText.innerHTML = `Faculty member <strong>${teacherCode}</strong> exhibits a composite workload balance index of <strong>${riskIndex}/100</strong> with Personal Accomplishment at <strong>${pa}/48</strong>. Total logged load comprises <strong>${totalWorkloadHours.toFixed(1)} hrs/week</strong> (Teaching: ${teachingHours.toFixed(1)}h, Ancillary: ${ancillaryHours.toFixed(1)}h).`;
            }

            // Formula Notes
            const eeNorm = ((ee / 54) * 100).toFixed(1);
            const dpNorm = ((dp / 30) * 100).toFixed(1);
            const eePts = (0.50 * eeNorm).toFixed(2);
            const dpPts = (0.20 * dpNorm).toFixed(2);

            setTxt('formulaEEText', `(${ee} / 54) \u00D7 100 = ${eeNorm}% \u2192 Contributes ${eePts} pts`);
            setTxt('formulaAncillaryText', `${totalWorkloadHours.toFixed(1)} total weekly hrs (Teaching: ${teachingHours.toFixed(1)}h, Ancillary: ${ancillaryHours.toFixed(1)}h)`);
            setTxt('formulaDPText', `(${dp} / 30) \u00D7 100 = ${dpNorm}% \u2192 Contributes ${dpPts} pts`);
            setTxt('formulaCompositeText', `${riskIndex} / 100 (${riskIndex > 70 ? 'Elevated Strain' : (riskIndex > 40 ? 'Moderate Strain' : 'Optimal Capacity')})`);

            // Recommendations
            const reco1 = document.getElementById('recoAction1');
            const reco2 = document.getElementById('recoAction2');
            if (reco1) {
                reco1.innerHTML = riskIndex > 70
                    ? `<strong>Ancillary Reallocation:</strong> Coordinate with department head to reallocate excess ancillary duties (${ancillaryHours.toFixed(1)} hrs/wk) to reduce weekly strain.`
                    : (riskIndex > 40
                        ? `<strong>Task Batching:</strong> Allocate 1.5 to 2.0 consecutive hours of protected administrative time for learner record encoding and lesson prep.`
                        : `<strong>Capacity Maintenance:</strong> Maintain current balanced duty distribution and continue observing standard contact hour limits.`);
            }
            if (reco2) {
                reco2.innerHTML = riskIndex > 70
                    ? `<strong>Protected Rest Window:</strong> Implement scheduled recovery windows between back-to-back teaching periods and prioritize mental health support.`
                    : (riskIndex > 40
                        ? `<strong>Peer Advisory Check-in:</strong> Participate in scheduled bi-weekly grade-level check-ins to monitor workload distribution.`
                        : `<strong>Growth & Mentorship:</strong> Leverage strong sense of efficacy (PA = ${pa}/48) to support co-faculty in instructional planning.`);
            }

        } else {
            // Fallback when NO assessment exists
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
                summaryText.innerHTML = `No burnout assessment recorded for <strong>${teacherCode}</strong> in the current academic cycle. Complete the MBI-ES assessment to generate full diagnostic analytics. Logged workload hours: <strong>${totalWorkloadHours.toFixed(1)} hrs/week</strong>.`;
            }

            setTxt('formulaEEText', 'Awaiting MBI-ES assessment submission');
            setTxt('formulaAncillaryText', `${totalWorkloadHours.toFixed(1)} total weekly hrs logged`);
            setTxt('formulaDPText', 'Awaiting MBI-ES assessment submission');
            setTxt('formulaCompositeText', 'Not yet assessed');

            const reco1 = document.getElementById('recoAction1');
            const reco2 = document.getElementById('recoAction2');
            if (reco1) reco1.innerHTML = '<strong>Take Burnout Assessment:</strong> Complete the quarterly 22-item MBI-Educators Survey to unlock detailed wellness recommendations.';
            if (reco2) reco2.innerHTML = '<strong>Upload Class Program:</strong> Ensure your official class program spreadsheet is uploaded to calibrate contact hours and duty loads.';
        }

    } catch (err) {
        console.error('Error loading teacher audit report:', err);
    }
});
