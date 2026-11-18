// static/workloadManager.js

/**
 * Kandili Workload Analytics Engine
 * Calculates teaching loads, ancillary duties, total weekly hours, and risk classification.
 */
/**
 * Core WLU / JDS Calculation Engine (Global)
 * Based on DO 5, s. 2024 & DM 291, s. 2008
 */
window.calculateWLUDetails = function(teacherProfile) {
    teacherProfile = teacherProfile || {};
    const totalTeachingMins = teacherProfile.teaching_loads?.reduce((sum, item) => sum + (item.minutes_per_week || 0), 0) || 0;
    let teachingHours = totalTeachingMins / 60;

    let ancillaryHours = 0;
    let assignmentHours = 0;
    let ancillaryWLU = 0;
    let assignmentWLU = 0;

    teacherProfile.ancillary_duties?.forEach(duty => {
        const hrs = parseFloat(duty.hours_per_week || duty.hours || 0);
        // Safe check for duty title across various schema column names
        const name = (duty.duty_name || duty.duty_title || duty.name || duty.title || '').toLowerCase();

        if (
            name.includes('coordinator') || 
            name.includes('chair') || 
            name.includes('paper') || 
            name.includes('master teacher') || 
            name.includes('sdrrm')
        ) {
            assignmentHours += hrs;
            assignmentWLU += hrs * 2.0;
        } else {
            ancillaryHours += hrs;
            ancillaryWLU += hrs * 1.5;
        }
    });

    // Fallback to uploaded Class Program when teaching_loads table is empty
    const cp = teacherProfile.class_program;
    if (teachingHours === 0 && cp) {
        let cpMins = 0;
        if (Array.isArray(cp.scheduleMatrix) && cp.scheduleMatrix.length > 0) {
            const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
            const nonTeaching = ['flag ceremony', 'health break', 'recess', 'break', 'lunch'];
            cp.scheduleMatrix.forEach(row => {
                const rowMin = parseInt(row.min, 10) || 60;
                dayKeys.forEach(k => {
                    const val = (row[k] || '').trim().toLowerCase();
                    if (val && !nonTeaching.some(kw => val.includes(kw))) {
                        cpMins += rowMin;
                    }
                });
            });
        }
        if (cpMins > 0) {
            teachingHours = cpMins / 60;
        } else if (parseFloat(cp.coreHours || 0) > 0) {
            teachingHours = parseFloat(cp.coreHours);
        } else if (parseFloat(cp.totalLogged || 0) > 0) {
            teachingHours = parseFloat(cp.totalLogged);
        }

        if (ancillaryHours === 0 && assignmentHours === 0 && parseFloat(cp.ancillaryHours || 0) > 0) {
            ancillaryHours = parseFloat(cp.ancillaryHours);
            ancillaryWLU = ancillaryHours * 1.5;
        }
    }

    const teachingWLU = teachingHours * 1.0;
    const totalHours = parseFloat((teachingHours + ancillaryHours + assignmentHours).toFixed(1));
    const totalJDS = parseFloat((teachingWLU + ancillaryWLU + assignmentWLU).toFixed(2));

    let status = 'OPTIMAL';
    let tierKey = 'optimal';
    let statusClass = 'text-success';

    if (totalJDS > 75) { status = 'OVERLOAD'; tierKey = 'overload'; statusClass = 'text-danger'; }
    else if (totalJDS >= 66) { status = 'MAXIMIZED'; tierKey = 'high'; statusClass = 'text-warning'; }
    else if (totalJDS >= 54) { status = 'HIGH'; tierKey = 'high'; statusClass = 'text-warning'; }
    else if (totalJDS >= 36) { status = 'OPTIMAL'; tierKey = 'optimal'; statusClass = 'text-success'; }
    else { status = 'UNDERLOAD'; tierKey = 'underload'; statusClass = 'text-info'; }

    return {
        teachingHours,
        ancillaryHours,
        assignmentHours,
        totalHours,
        teachingWLU,
        ancillaryWLU,
        assignmentWLU,
        totalJDS,
        status,
        tierKey,
        statusClass
    };
};

/**
 * Unified Burnout Classification Engine (Latest Assessment Only + Unassessed Tier)
 */
window.classifyBurnoutStatus = function(teacherProfile) {
    const assessments = Array.isArray(teacherProfile?.burnout_assessments)
        ? teacherProfile.burnout_assessments.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        : [];
    const latest = assessments.length > 0 ? assessments[0] : null;

    if (!latest) {
        return {
            hasAssessment: false,
            latestAssessment: null,
            riskIndex: null,
            ee: null,
            dp: null,
            pa: null,
            tier: 'unassessed',
            label: 'UNASSESSED'
        };
    }

    const ee = latest.ee_score != null ? Number(latest.ee_score) : null;
    const dp = latest.dp_score != null ? Number(latest.dp_score) : null;
    const pa = latest.pa_score != null ? Number(latest.pa_score) : null;
    const riskIndex = latest.risk_index != null
        ? parseFloat(latest.risk_index)
        : Math.round(((ee || 0) / 54) * 50 + ((dp || 0) / 30) * 30 + ((48 - (pa || 0)) / 48) * 20);

    let tier = 'low';
    let label = 'LOW RISK';
    if (riskIndex >= 70) { tier = 'high'; label = 'HIGH RISK'; }
    else if (riskIndex >= 40) { tier = 'moderate'; label = 'MODERATE RISK'; }

    return {
        hasAssessment: true,
        latestAssessment: latest,
        riskIndex,
        ee,
        dp,
        pa,
        tier,
        label
    };
};

/**
 * Unified School-Scoped Teacher Fetcher for Principal Dashboard & Directories
 */
window.fetchScopedTeachersForPrincipal = async function() {
    if (!window.supabaseClient) {
        return { school: null, teachers: [], error: 'Supabase client not loaded.' };
    }
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session?.user) {
        return { school: null, teachers: [], error: 'No active session found.' };
    }

    const { data: userProfile } = await window.supabaseClient
        .from('profiles')
        .select('role, school, assigned_institution')
        .eq('id', session.user.id)
        .single();

    const role = (userProfile?.role || '').toLowerCase();
    const school = userProfile?.school || userProfile?.assigned_institution || null;

    if (role === 'principal' && !school) {
        return { school: null, teachers: [], error: 'No school assigned to your profile. Please contact Admin.' };
    }

    let query = window.supabaseClient
        .from('profiles')
        .select(`
            id, first_name, last_name, department, role, teacher_code, school, class_program,
            teaching_loads ( minutes_per_week ),
            ancillary_duties ( * ),
            burnout_assessments ( risk_index, ee_score, dp_score, pa_score, created_at )
        `)
        .eq('role', 'teacher');

    if (school) {
        query = query.eq('school', school);
    }

    const { data: teachers, error } = await query;
    if (error) {
        return { school, teachers: [], error: error.message };
    }

    return { school, teachers: teachers || [], error: null };
};

// 1. Calculate workload summary for a single teacher
async function getTeacherWorkloadSummary(teacherId, schoolYear = '2025-2026') {
    if (!teacherId || !window.supabaseClient) return null;

    try {
        // Fetch teaching loads (in minutes)
        const { data: teachingData, error: tErr } = await window.supabaseClient
            .from('teaching_loads')
            .select('minutes_per_week')
            .eq('teacher_id', teacherId)
            .eq('school_year', schoolYear);

        if (tErr) throw tErr;

        // Fetch ancillary duties (in hours)
        const { data: ancillaryData, error: aErr } = await window.supabaseClient
            .from('ancillary_duties')
            .select('hours_per_week')
            .eq('teacher_id', teacherId)
            .eq('school_year', schoolYear);

        if (aErr) throw aErr;

        // Sum total teaching minutes -> convert to hours
        const totalTeachingMinutes = (teachingData || []).reduce((sum, item) => sum + (item.minutes_per_week || 0), 0);
        const teachingHours = totalTeachingMinutes / 60;

        // Sum total ancillary hours
        const ancillaryHours = (ancillaryData || []).reduce((sum, item) => sum + (parseFloat(item.hours_per_week) || 0), 0);

        // Compute Total Workload Hours
        const totalHours = Math.round((teachingHours + ancillaryHours) * 10) / 10; // Round to 1 decimal

        // Classify Status based on R.A. 4670 40-hour limit
        let status = 'optimal'; // Default
        let riskScore = Math.min(Math.round((totalHours / 40) * 100), 100);

        if (totalHours > 40) {
            status = 'overloaded';
            riskScore = Math.min(85 + Math.round((totalHours - 40) * 3), 100); // 85-100 scale for overloaded
        } else if (totalHours > 36) {
            status = 'maximized';
            riskScore = 60 + Math.round((totalHours - 36) * 5); // 60-80 scale for maximized
        } else {
            status = 'optimal';
            riskScore = Math.round((totalHours / 36) * 50); // 0-50 scale for optimal
        }

        return {
            teacherId,
            teachingMinutes: totalTeachingMinutes,
            teachingHours: Math.round(teachingHours * 10) / 10,
            ancillaryHours: Math.round(ancillaryHours * 10) / 10,
            totalHours,
            status,
            riskScore
        };

    } catch (err) {
        console.error(`Failed to calculate workload for teacher ${teacherId}:`, err);
        return null;
    }
}

// 2. Aggregate workloads for ALL teachers (Used by Principal/Admin Dashboards)
async function getFacultyWorkloadOverview(schoolYear = '2025-2026') {
    if (!window.supabaseClient) return null;

    try {
        // Fetch all teachers
        const { data: teachers, error: profileErr } = await window.supabaseClient
            .from('profiles')
            .select('id, first_name, last_name, department, role')
            .eq('role', 'teacher');

        if (profileErr) throw profileErr;

        const overview = {
            optimal: [],
            maximized: [],
            overloaded: [],
            all: []
        };

        // Process each teacher concurrently
        const workloadPromises = teachers.map(async (teacher) => {
            const summary = await getTeacherWorkloadSummary(teacher.id, schoolYear);
            const fullName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || `Teacher (${teacher.id.substring(0, 5)})`;

            const fullRecord = {
                ...teacher,
                fullName,
                workload: summary || {
                    teachingMinutes: 0,
                    teachingHours: 0,
                    ancillaryHours: 0,
                    totalHours: 0,
                    status: 'optimal',
                    riskScore: 0
                }
            };

            overview.all.push(fullRecord);
            if (fullRecord.workload.status === 'overloaded') {
                overview.overloaded.push(fullRecord);
            } else if (fullRecord.workload.status === 'maximized') {
                overview.maximized.push(fullRecord);
            } else {
                overview.optimal.push(fullRecord);
            }
        });

        await Promise.all(workloadPromises);
        return overview;

    } catch (err) {
        console.error("Failed to generate faculty workload overview:", err);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', loadOfficialClassProgramView);

// Render Official DepEd Class Program Template on classprogram.html
async function loadOfficialClassProgramView() {
    const sectionNameEl = document.getElementById('section-name');
    const schoolYearEl = document.getElementById('school-year');
    const totalMinutesEl = document.getElementById('total-minutes');
    const demographicsEl = document.getElementById('demographics');
    const matrixBodyEl = document.getElementById('matrix-body');
    const teacherNameEl = document.getElementById('teacher-name');
    const principalNameEl = document.getElementById('principal-name');

    if (!matrixBodyEl) return;

    // 1. Fetch Session & User Details (Safely)
    let session = null;
    try {
        if (window.supabaseClient && window.supabaseClient.auth) {
            const { data } = await window.supabaseClient.auth.getSession();
            session = data ? data.session : null;
        }
    } catch(e) {
        console.warn("Session check notice:", e);
    }

    if (session && window.supabaseClient) {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('first_name, last_name, role')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profile && teacherNameEl) {
                const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim().toUpperCase();
                teacherNameEl.textContent = name || 'CLASS ADVISER';
            }

            // Dynamic Principal Name Resolution from public.profiles
            const { data: principalProfiles, error: pErr } = await window.supabaseClient
                .from('profiles')
                .select('first_name, last_name, role')
                .eq('role', 'principal')
                .limit(1);

            if (pErr) console.warn("Principal query note:", pErr.message);

            const principalProfile = (principalProfiles && principalProfiles.length > 0) ? principalProfiles[0] : null;

            if (principalNameEl) {
                if (principalProfile && (principalProfile.first_name || principalProfile.last_name)) {
                    const fullPrincipalName = `${principalProfile.first_name || ''} ${principalProfile.last_name || ''}`.trim().toUpperCase();
                    principalNameEl.textContent = fullPrincipalName;
                } else {
                    const savedPrincipal = localStorage.getItem('kandili_principal_name');
                    principalNameEl.textContent = savedPrincipal ? savedPrincipal.toUpperCase() : '(Principal Name)';
                }
            }
        } catch(err) {
            console.warn("Profile lookup notice:", err);
        }
    }

    // 2. Read Extracted Class Program Data
    let data = null;
    try {
        if (session) {
            const storedUser = localStorage.getItem(`kandili_extracted_class_program_${session.user.id}`);
            if (storedUser) data = JSON.parse(storedUser);
        }
        if (!data) {
            const storedGlobal = localStorage.getItem('kandili_extracted_class_program');
            if (storedGlobal) data = JSON.parse(storedGlobal);
        }
        if (!data && session && window.supabaseClient) {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('class_program')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profile && profile.class_program) {
                data = profile.class_program;
            }
        }
    } catch(e){}

    const defaultData = {
        section: 'Grade 2 - A',
        schoolYear: '2026 - 2027',
        totalMinutes: 375,
        male: 22,
        female: 20,
        total: 42,
        scheduleMatrix: [
            { time: '07:30 - 08:30 AM', min: 60, mon: 'English', tue: 'English', wed: 'English', thu: 'English', fri: 'English' },
            { time: '08:30 - 09:30 AM', min: 60, mon: 'Mathematics', tue: 'Mathematics', wed: 'Mathematics', thu: 'Mathematics', fri: 'Mathematics' },
            { time: '09:30 - 09:45 AM', min: 15, mon: 'Recess', tue: 'Recess', wed: 'Recess', thu: 'Recess', fri: 'Recess' },
            { time: '09:45 - 10:45 AM', min: 60, mon: 'Science', tue: 'Science', wed: 'Science', thu: 'Science', fri: 'Science' },
            { time: '10:45 - 11:45 AM', min: 60, mon: 'Filipino', tue: 'Filipino', wed: 'Filipino', thu: 'Filipino', fri: 'Filipino' },
            { time: '01:00 - 02:00 PM', min: 60, mon: 'Araling Panlipunan', tue: 'Araling Panlipunan', wed: 'Araling Panlipunan', thu: 'Araling Panlipunan', fri: 'Araling Panlipunan' },
            { time: '02:00 - 03:00 PM', min: 60, mon: 'MAPEH', tue: 'MAPEH', wed: 'MAPEH', thu: 'MAPEH', fri: 'MAPEH' }
        ]
    };

    const finalData = data || defaultData;
    const matrix = finalData.scheduleMatrix || defaultData.scheduleMatrix;

    // Filter out Recess from teaching minutes calculation
    const academicRows = matrix.filter(row => !(row.mon || '').toLowerCase().includes('recess'));
    const academicMinutesPerDay = academicRows.reduce((sum, row) => sum + (row.min || 0), 0);

    if (sectionNameEl) sectionNameEl.textContent = `Section: ${finalData.section || 'Grade 2 - A'}`;
    if (schoolYearEl) schoolYearEl.textContent = `School Year ${finalData.schoolYear || '2026 - 2027'}`;
    if (totalMinutesEl) totalMinutesEl.textContent = `Total teaching minutes per day: ${academicMinutesPerDay || 360} min (excl. Recess)`;
    if (demographicsEl) demographicsEl.innerHTML = `Male: <strong>${finalData.male || 22}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; Female: <strong>${finalData.female || 20}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; Total: <strong>${finalData.total || 42}</strong>`;

    if (principalNameEl) {
        if (finalData && finalData.principalName) {
            principalNameEl.textContent = finalData.principalName.toUpperCase();
        } else if (typeof principalProfile !== 'undefined' && principalProfile && (principalProfile.first_name || principalProfile.last_name)) {
            const fullPrincipalName = `${principalProfile.first_name || ''} ${principalProfile.last_name || ''}`.trim().toUpperCase();
            principalNameEl.textContent = fullPrincipalName;
        } else {
            const savedPrincipal = localStorage.getItem('kandili_principal_name');
            principalNameEl.textContent = savedPrincipal ? savedPrincipal.toUpperCase() : '(Principal Name)';
        }
    }

    // Render Matrix Rows
    matrixBodyEl.innerHTML = '';

    matrix.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom: 1px solid #cbd5e1; font-size: 0.9rem; text-align: center;';
        
        const isRecess = (row.mon || '').toLowerCase().includes('recess');
        if (isRecess) {
            tr.style.background = '#f8fafc';
            tr.style.fontWeight = '600';
            tr.style.color = '#64748b';
        }

        tr.innerHTML = `
            <td style="padding: 0.75rem; font-weight: 600; color: #0f172a;">${row.time}</td>
            <td style="padding: 0.75rem;">${row.mon}</td>
            <td style="padding: 0.75rem;">${row.tue}</td>
            <td style="padding: 0.75rem;">${row.wed}</td>
            <td style="padding: 0.75rem;">${row.thu}</td>
            <td style="padding: 0.75rem;">${row.fri}</td>
        `;
        matrixBodyEl.appendChild(tr);
    });
}

/**
 * Calculates Job Demand Score (JDS) in Workload Units (WLU)
 * Based on DO 5, s. 2024 & DM 291, s. 2008
 
function calculateWLUDetails(teacherProfile) {
    // 1. Tier 1: Teaching Load (Baseline Weight: 1.0)
    const totalTeachingMins = teacherProfile.teaching_loads?.reduce((sum, item) => {
        return sum + (item.minutes_per_week || 0);
    }, 0) || 0;
    
    const teachingHours = totalTeachingMins / 60;
    const teachingWLU = teachingHours * 1.0;

    // 2. Tier 2 & Tier 3: Ancillary & High-Weight Assignments
    let ancillaryHours = 0;
    let assignmentHours = 0;
    let ancillaryWLU = 0;
    let assignmentWLU = 0;

    teacherProfile.ancillary_duties?.forEach(duty => {
        const hrs = parseFloat(duty.hours_per_week || 0);
        const name = (duty.duty_name || '').toLowerCase();

        // Tier 3: Teaching-Related Assignments (Weight: 2.0)
        if (
            name.includes('coordinator') || 
            name.includes('chair') || 
            name.includes('paper') || 
            name.includes('master teacher') ||
            name.includes('sdrrm')
        ) {
            assignmentHours += hrs;
            assignmentWLU += hrs * 2.0;
        } 
        // Tier 2: Standard Ancillary Duties (Weight: 1.5)
        else {
            ancillaryHours += hrs;
            ancillaryWLU += hrs * 1.5;
        }
    });

    // 3. Compute Composite JDS Total
    const totalHours = parseFloat((teachingHours + ancillaryHours + assignmentHours).toFixed(1));
    const totalJDS = parseFloat((teachingWLU + ancillaryWLU + assignmentWLU).toFixed(2));

    // 4. WLU Classification Thresholds
    let status = 'OPTIMAL';
    let statusClass = 'text-success';

    if (totalJDS > 75) {
        status = 'OVERLOAD';
        statusClass = 'text-danger';
    } else if (totalJDS >= 66) {
        status = 'MAXIMIZED';
        statusClass = 'text-warning';
    } else if (totalJDS >= 54) {
        status = 'HIGH';
        statusClass = 'text-warning';
    } else if (totalJDS >= 36) {
        status = 'OPTIMAL';
        statusClass = 'text-success';
    } else {
        status = 'UNDERLOAD';
        statusClass = 'text-info';
    }

    return {
        teachingHours,
        ancillaryHours,
        assignmentHours,
        totalHours,
        teachingWLU,
        ancillaryWLU,
        assignmentWLU,
        totalJDS,
        status,
        statusClass
    };
}*/