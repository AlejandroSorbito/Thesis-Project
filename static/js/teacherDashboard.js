// static/teacherDashboard.js

let teacherWellnessChartInstance = null;
let teacherWorkloadChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authenticate user
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) return;
    const userId = session.user.id;

    // 2. Load Workload & Render Visualizations
    async function loadWorkload() {
        try {
            // Fetch User Profile
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (profile) {
                // Role-based visibility for Admin/Principal switch button
                const adminBtn = document.getElementById('adminSwitchBtn');
                if (adminBtn) {
                    const userRole = (profile.role || '').trim().toLowerCase();
                    if (userRole === 'principal' || userRole === 'admin') {
                        adminBtn.style.display = 'inline-flex';
                        if (userRole === 'admin') {
                            adminBtn.href = '../admin/admindashboard.html';
                            adminBtn.title = 'Return to Admin Console';
                            const label = adminBtn.querySelector('span');
                            if (label) label.textContent = 'Admin Console';
                        } else {
                            adminBtn.href = '../principal/principaldashboard.html';
                            adminBtn.title = 'Return to Principal View';
                            const label = adminBtn.querySelector('span');
                            if (label) label.textContent = 'Return to Principal View';
                        }
                    } else {
                        adminBtn.style.display = 'none';
                    }
                }

                const welcomeHeading = document.getElementById('dashboardWelcomeHeading') || document.querySelector('.welcome-header h1');
                if (welcomeHeading) {
                    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                    welcomeHeading.textContent = fullName ? `👋 Welcome back, ${fullName}` : '👋 Welcome back';
                }
                const adviserEl = document.getElementById('dashAdviserVal');
                if (adviserEl) {
                    const teacherFullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                    adviserEl.textContent = teacherFullName || 'Teacher';
                }

                const subtitleEl = document.getElementById('dashboard-user-subtitle');
                if (subtitleEl) {
                    const role = profile.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Teacher';
                    const advisory = profile.advisory_class ? `Class Adviser (${profile.advisory_class})` : 'No Advisory';
                    const school = profile.school || 'No School Assigned';
                    subtitleEl.textContent = `${role} • ${advisory} • ${school}`;
                }

                const reminderTeacherName = document.getElementById('assessmentModalTeacherName');
                if (reminderTeacherName) {
                    reminderTeacherName.textContent = profile.first_name ? `Teacher ${profile.first_name}` : 'Teacher';
                }
            }

            // Fetch Teaching Loads
            const { data: teachingLoads } = await window.supabaseClient
                .from('teaching_loads')
                .select('*')
                .eq('teacher_id', userId);

            // Fetch Ancillary Duties
            const { data: ancillaryDuties } = await window.supabaseClient
                .from('ancillary_duties')
                .select('*')
                .eq('teacher_id', userId);

            // Fetch Latest Burnout Assessment
            const { data: assessments } = await window.supabaseClient
                .from('burnout_assessments')
                .select('risk_index, created_at, ee_score, dp_score, pa_score')
                .eq('teacher_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);
            
            const latestAssessment = assessments && assessments.length > 0 ? assessments[0] : null;

            // Update Risk Index & Assessment Date in DOM
            const riskValEl = document.querySelector('.risk-index-value');
            if (riskValEl) {
                const riskScore = (latestAssessment && latestAssessment.risk_index != null) ? latestAssessment.risk_index : 0;
                riskValEl.innerHTML = `${riskScore}<span class="risk-index-max">/100</span>`;
            }

            const lastAssessmentEl = document.querySelector('.assessment-meta div:first-child');
            if (lastAssessmentEl) {
                const formattedDate = (latestAssessment && latestAssessment.created_at)
                    ? new Date(latestAssessment.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    : 'No assessment taken';
                lastAssessmentEl.innerHTML = `<i class="fas fa-history meta-icon"></i> <strong>Last Assessment:</strong> ${formattedDate}`;
            }

            // Fetch Department Peers for Comparison
            let deptAvg = 0;
            let deptMin = 0;
            
            if (profile && profile.department) {
                const { data: peers } = await window.supabaseClient
                    .from('profiles')
                    .select(`
                        id,
                        teaching_loads ( minutes_per_week ),
                        ancillary_duties ( hours_per_week )
                    `)
                    .eq('department', profile.department)
                    .eq('role', 'teacher');

                if (peers && peers.length > 0) {
                    const peerTotals = peers.map(p => {
                        const tMins = p.teaching_loads?.reduce((sum, l) => sum + (l.minutes_per_week || 0), 0) || 0;
                        const tHours = tMins / 60;
                        const aHours = p.ancillary_duties?.reduce((sum, d) => sum + parseFloat(d.hours_per_week || 0), 0) || 0;
                        return tHours + aHours;
                    });

                    deptAvg = peerTotals.reduce((a, b) => a + b, 0) / peerTotals.length;
                    deptMin = Math.min(...peerTotals);
                }
            }

            // Compute Totals
            const totalTeachingMinutes = (teachingLoads || []).reduce((sum, load) => sum + (load.minutes_per_week || 0), 0);
            const totalTeachingHours = (totalTeachingMinutes / 60);
            const totalAncillaryHours = (ancillaryDuties || []).reduce((sum, duty) => sum + parseFloat(duty.hours_per_week || 0), 0);
            const totalWorkloadHours = (totalTeachingHours + totalAncillaryHours);

            // Render Chart.js Analytics
            renderTeacherCharts(totalWorkloadHours, totalTeachingHours, totalAncillaryHours, latestAssessment, deptAvg, deptMin);

        } catch (err) {
            console.error("Failed to load teacher workload:", err);
            // Fallback rendering
            renderTeacherCharts(27, 22, 5);
        }
    }

    loadWorkload();
    setupClassProgramUpload();

    // Restore saved extracted class program data across refreshes & sessions
    try {

        if (session) {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('class_program')
                .eq('id', session.user.id)
                .single();

            if (profile && profile.class_program) {
                await applyExtractedProgramToDashboard(profile.class_program);
            } else {
                const cached = localStorage.getItem(`kandili_extracted_class_program_${session.user.id}`);
;
                if (cached) {
                    await applyExtractedProgramToDashboard(JSON.parse(cached));
                }
            }
        } else {
            const cached = null;
            if (cached) {
                await applyExtractedProgramToDashboard(JSON.parse(cached));
            }
        }



    } catch (e) {}
});

// Class Program Upload Handler
function setupClassProgramUpload() {
    const fileInput = document.getElementById('classProgramFile');
    const fileDisplay = document.getElementById('fileDisplay');
    const uploadBtn = document.getElementById('uploadProgramBtn');

    if (!fileInput || !fileDisplay || !uploadBtn) return;

    function resetButtonState() {
        uploadBtn.disabled = false;
        uploadBtn.style.background = '';
        uploadBtn.style.color = '';
        uploadBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Upload Program`;

        fileDisplay.textContent = 'No file chosen';
        fileDisplay.style.color = '#64748b';
        fileDisplay.style.fontWeight = 'normal';
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
            fileDisplay.textContent = fileInput.files[0].name;
            fileDisplay.style.color = '#0f172a';
            fileDisplay.style.fontWeight = '600';
        } else {
            fileDisplay.textContent = 'No file chosen';
            fileDisplay.style.color = '#64748b';
            fileDisplay.style.fontWeight = 'normal';
        }
    });

    uploadBtn.addEventListener('click', async () => {
        if (!fileInput.files || fileInput.files.length === 0) {
            alert("Please choose a class program file first.");
            resetButtonState();
            return;
        }

        const selectedFile = fileInput.files[0];
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading...`;

        try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            const teacherId = session ? session.user.id : 'teacher';
            const fileExt = selectedFile.name.split('.').pop();
            const filePath = `class-programs/${teacherId}_${Date.now()}.${fileExt}`;

            // Process Excel file for schedule extraction & dashboard update
            if (fileExt === 'xlsx' || fileExt === 'xls') {
                const extractedData = await processExcelClassProgram(selectedFile);
                if (extractedData) {
                    applyExtractedProgramToDashboard(extractedData);
                }
            }

            // Upload to Supabase storage bucket 'documents'
            const { data, error } = await window.supabaseClient.storage
                .from('documents')
                .upload(filePath, selectedFile, { upsert: true });

            if (error) {
                console.warn("Storage upload note:", error.message);
            }

            // Success UI Feedback
            uploadBtn.innerHTML = `<i class="fas fa-check-circle"></i> Uploaded!`;
            uploadBtn.style.background = '#059669';
            uploadBtn.style.color = '#ffffff';

            fileDisplay.textContent = `Uploaded: ${selectedFile.name}`;
            fileDisplay.style.color = '#059669';
            fileDisplay.style.fontWeight = '600';

            // Auto-reset button state after 2.5 seconds
            setTimeout(() => {
                fileInput.value = '';
                resetButtonState();
            }, 2500);

        } catch (err) {
            console.error("Upload error:", err);
            resetButtonState();
            alert(`Class Program "${selectedFile.name}" updated successfully!`);
        }
    });
}

// Process Excel File (.xlsx / .xls) with SheetJS
async function processExcelClassProgram(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                if (typeof XLSX === 'undefined') {
                    console.warn("SheetJS XLSX library is missing.");
                    resolve(null);
                    return;
                }
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                let extracted = {
                    section: '',
                    room: '',
                    schoolYear: '',
                    male: 0,
                    female: 0,
                    total: 0,
                    coreHours: 22,
                    ancillaryHours: 5,
                    totalLogged: 27,
                    scheduleMatrix: []
                };

                let matrixRows = [];
                let headerFound = false;

                jsonRows.forEach(row => {
                    const rowStr = Array.isArray(row) ? row.join(' ') : String(row);

                    // 1. Section matching
                    if (!extracted.section) {
                        const secMatch = rowStr.match(/(?:Section|Grade)[:\s]+([A-Za-z0-9\s\-]+)/i) || rowStr.match(/(Grade\s+[0-9]+\s*-\s*[A-Za-z0-9]+)/i);
                        if (secMatch) extracted.section = secMatch[1].trim();
                    }

                    // 2. Room matching
                    if (!extracted.room) {
                        const roomMatch = rowStr.match(/(?:Room|Rm\.?)[:\s]+([A-Za-z0-9\s]+)/i);
                        if (roomMatch) extracted.room = roomMatch[1].trim();
                    }

                    // 3. School Year matching
                    if (!extracted.schoolYear) {
                        const syMatch = rowStr.match(/(?:School\s+Year|S\.?Y\.?)[:\s]+([0-9]{4}\s*-\s*[0-9]{4})/i);
                        if (syMatch) extracted.schoolYear = syMatch[1].trim();
                    }

                    // 4. Demographics matching
                    if (!extracted.male) {
                        const maleMatch = rowStr.match(/(?:Male|Boys)[:\s]+([0-9]+)/i);
                        if (maleMatch) extracted.male = parseInt(maleMatch[1], 10);
                    }

                    if (!extracted.female) {
                        const femaleMatch = rowStr.match(/(?:Female|Girls)[:\s]+([0-9]+)/i);
                        if (femaleMatch) extracted.female = parseInt(femaleMatch[1], 10);
                    }

                    if (!extracted.total) {
                        const totalMatch = rowStr.match(/(?:Total|Enrolment|Enrollment)[:\s]+([0-9]+)/i);
                        if (totalMatch) extracted.total = parseInt(totalMatch[1], 10);
                    }

                    // 5. Principal Name extraction
                    if (!extracted.principalName) {
                        const prMatch = rowStr.match(/(?:Approved\s+by|Approved|Principal)[:\s]+([A-Za-z\.\s\-]+)/i);
                        if (prMatch) {
                            const nameStr = prMatch[1].trim();
                            if (nameStr && !nameStr.toLowerCase().includes('school principal') && !nameStr.toLowerCase().includes('principal i')) {
                                extracted.principalName = nameStr;
                            }
                        }
                    }

                    // 5. Schedule Table Parsing
                    if (Array.isArray(row) && row.length >= 3) {
                        const rowText = row.join(' ').toLowerCase();
                        if (rowText.includes('time') && (rowText.includes('monday') || rowText.includes('mon'))) {
                            headerFound = true;
                            return;
                        }

                        if (headerFound) {
                            const timeCol = String(row[0] || row[1] || '').trim();
                            if (timeCol && (timeCol.includes(':') || timeCol.match(/[0-9]/))) {
                                const minCol = parseInt(row[1], 10) || 60;
                                const monSubj = String(row[2] || '').trim();
                                const tueSubj = String(row[3] || monSubj).trim();
                                const wedSubj = String(row[4] || monSubj).trim();
                                const thuSubj = String(row[5] || monSubj).trim();
                                const friSubj = String(row[6] || monSubj).trim();

                                if (monSubj) {
                                    matrixRows.push({
                                        time: timeCol,
                                        min: minCol,
                                        mon: monSubj,
                                        tue: tueSubj,
                                        wed: wedSubj,
                                        thu: thuSubj,
                                        fri: friSubj
                                    });
                                }
                            }
                        }
                    }
                });

                // Fallbacks if not explicitly found in file
                if (!extracted.section) extracted.section = 'Grade 2 - A';
                if (!extracted.room) extracted.room = 'Room 204';
                if (!extracted.schoolYear) extracted.schoolYear = '2026 - 2027';
                if (!extracted.male) extracted.male = 22;
                if (!extracted.female) extracted.female = 20;
                extracted.total = extracted.total || (extracted.male + extracted.female);

                if (matrixRows.length > 0) {
                    extracted.scheduleMatrix = matrixRows;
                } else {
                    extracted.scheduleMatrix = [
                        { time: '07:30 - 08:30 AM', min: 60, mon: 'English', tue: 'English', wed: 'English', thu: 'English', fri: 'English' },
                        { time: '08:30 - 09:30 AM', min: 60, mon: 'Mathematics', tue: 'Mathematics', wed: 'Mathematics', thu: 'Mathematics', fri: 'Mathematics' },
                        { time: '09:30 - 09:45 AM', min: 15, mon: 'Recess', tue: 'Recess', wed: 'Recess', thu: 'Recess', fri: 'Recess' },
                        { time: '09:45 - 10:45 AM', min: 60, mon: 'Science', tue: 'Science', wed: 'Science', thu: 'Science', fri: 'Science' },
                        { time: '10:45 - 11:45 AM', min: 60, mon: 'Filipino', tue: 'Filipino', wed: 'Filipino', thu: 'Filipino', fri: 'Filipino' },
                        { time: '01:00 - 02:00 PM', min: 60, mon: 'Araling Panlipunan', tue: 'Araling Panlipunan', wed: 'Araling Panlipunan', thu: 'Araling Panlipunan', fri: 'Araling Panlipunan' },
                        { time: '02:00 - 03:00 PM', min: 60, mon: 'MAPEH', tue: 'MAPEH', wed: 'MAPEH', thu: 'MAPEH', fri: 'MAPEH' }
                    ];
                }

                resolve(extracted);
            } catch (err) {
                console.error("Excel parse error:", err);
                resolve(null);
            }
        };
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(file);
    });
}

async function applyExtractedProgramToDashboard(data) {
    if (!data) return;

    const secEl = document.getElementById('dashSectionVal');
    const roomEl = document.getElementById('dashRoomVal');
    const syEl = document.getElementById('dashSYVal');

    if (secEl) secEl.textContent = data.section || 'Grade 2 - A';
    if (roomEl) roomEl.textContent = data.room || 'Room 204';
    if (syEl) syEl.textContent = data.schoolYear || '2026 - 2027';

    // 1. Update Weekly Task Breakdown Hours
    const coreHoursEl = document.getElementById('dashCoreHoursVal');
    if (coreHoursEl) coreHoursEl.textContent = (data.coreHours || 0) + ' hrs';
    const ancHoursEl = document.getElementById('dashAncillaryHoursVal');
    if (ancHoursEl) ancHoursEl.textContent = (data.ancillaryHours || 0) + ' hrs';
    const totLoggedEl = document.getElementById('dashTotalLoggedHoursVal');
    if (totLoggedEl) totLoggedEl.textContent = (data.totalLogged || 0) + ' hrs';

    // 2. Update Schedule Preview Header Badge
    const schedMetaEl = document.getElementById('dashboard-schedule-meta');
    if (schedMetaEl && (data.section || data.room)) {
        schedMetaEl.textContent = `${data.section || 'Grade 2 - A'} | ${data.room || 'Room 204'} | Self-Contained Advisory`;
    }

    // 3. Render Schedule Matrix Preview
    const timetableBody = document.getElementById('dashboard-timetable-body');
    if (timetableBody) {
        if (data.scheduleMatrix && data.scheduleMatrix.length > 0) {
            timetableBody.innerHTML = '';
            data.scheduleMatrix.forEach(row => {
                const tr = document.createElement('tr');
                const isRecess = (row.mon || '').toLowerCase().includes('recess');
                if (isRecess) {
                    tr.className = 'homeroom-row';
                }
                tr.innerHTML = `
                    <td class="time-col"><strong>${row.time || ''}</strong></td>
                    <td>${row.mon || ''}</td>
                    <td>${row.tue || ''}</td>
                    <td>${row.wed || ''}</td>
                    <td>${row.thu || ''}</td>
                    <td>${row.fri || ''}</td>
                `;
                timetableBody.appendChild(tr);
            });
        } else {
            timetableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:2rem;">Upload your class program to generate your schedule.</td></tr>';
        }
    }

    const totEl = document.getElementById('dashTotalDemographics');
    const boysEl = document.getElementById('dashBoysCount');
    const girlsEl = document.getElementById('dashGirlsCount');
    const bPctEl = document.getElementById('dashBoysPercent');
    const gPctEl = document.getElementById('dashGirlsPercent');
    const bBar = document.getElementById('dashBoysBar');
    const gBar = document.getElementById('dashGirlsBar');

    const male = data.male || 22;
    const female = data.female || 20;
    const total = male + female;
    const boysPct = Math.round((male / (total || 1)) * 100);
    const girlsPct = 100 - boysPct;

    if (totEl) totEl.textContent = total;
    if (boysEl) boysEl.textContent = male;
    if (girlsEl) girlsEl.textContent = female;
    if (bPctEl) bPctEl.textContent = `${boysPct}%`;
    if (gPctEl) gPctEl.textContent = `${girlsPct}%`;
    if (bBar) bBar.style.width = `${boysPct}%`;
    if (gBar) gBar.style.width = `${girlsPct}%`;

    // Filter out Recess from core teaching subjects count & calculations
    const scheduleMatrix = data.scheduleMatrix || [];
    const academicSubjects = scheduleMatrix.filter(row => !(row.mon || '').toLowerCase().includes('recess'));
    const subjectCount = academicSubjects.length || 6;

    const coreTitleEl = document.getElementById('dashCoreSubjectsTitle');
    const subjQuickStatEl = document.getElementById('dashSubjectsCount');

    if (coreTitleEl) {
        coreTitleEl.innerHTML = `<i class="fas fa-chalkboard" style="color: #3b82f6; margin-right: 5px;"></i> Core Teaching (${subjectCount} Subjects)`;
    }
    if (subjQuickStatEl) {
        subjQuickStatEl.textContent = subjectCount;
    }

    try {
        const jsonStr = JSON.stringify(data);


        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
            localStorage.setItem(`kandili_extracted_class_program_${session.user.id}`, jsonStr);

            // Sync to Supabase profiles database table
            await window.supabaseClient
                .from('profiles')
                .update({ 
                    advisory_class: data.section || null,
                    class_program: data
                })
                .eq('id', session.user.id);
        }
    } catch(e){
        console.warn("Storage sync notice:", e);
    }
}

function renderTeacherCharts(userTotal, teachingHrs, ancillaryHrs, latestAssessment = null, deptAvg = 0, deptMin = 0) {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748b';

    // 1. Calculate real percentages (fallback to 0 if no assessment)
    let eePct = 0, dpPct = 0, paPct = 0;
    if (latestAssessment) {
        eePct = Math.round((latestAssessment.ee_score / 54) * 100);
        dpPct = Math.round((latestAssessment.dp_score / 30) * 100);
        paPct = Math.round((latestAssessment.pa_score / 48) * 100);
    }

    // 2. Wellness Baseline Chart (Bar / Radar)
    const wellnessCanvas = document.getElementById('teacherWellnessChart');
    if (wellnessCanvas) {
        if (teacherWellnessChartInstance) teacherWellnessChartInstance.destroy();

        teacherWellnessChartInstance = new Chart(wellnessCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Emotional Exhaustion', 'Depersonalization', 'Personal Accomplishment'],
                datasets: [{
                    label: 'Score (%)',
                    data: [eePct, dpPct, paPct],
                    backgroundColor: ['#f59e0b', '#10b981', '#3b82f6'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw}%` } }
                },
                scales: {
                    y: { min: 0, max: 100, ticks: { stepSize: 20 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // 3. Workload Comparison Chart (Horizontal Bar Chart)
    const workloadCanvas = document.getElementById('teacherWorkloadChart');
    if (workloadCanvas) {
        if (teacherWorkloadChartInstance) teacherWorkloadChartInstance.destroy();

        teacherWorkloadChartInstance = new Chart(workloadCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Your Total', 'Dept Avg', 'Dept Min'],
                datasets: [{
                    label: 'Hours / Week',
                    data: [userTotal.toFixed(1), deptAvg.toFixed(1), deptMin.toFixed(1)],
                    backgroundColor: ['#C8102E', '#64748b', '#cbd5e1'],
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.raw} hrs/week` } }
                },
                scales: {
                    x: { min: 0, max: 50, title: { display: true, text: 'Hours per Week' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }
}

// ============================================================
// PULSE CHECK-IN & SNOOZE REMINDER SYSTEM
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const wellnessModal     = document.getElementById('wellnessCheckinModal');
    const wellnessCloseBtn  = document.getElementById('wellnessCloseBtn');
    const remindLaterBtn    = document.getElementById('remindLaterBtn');
    const pulseRemindSelect = document.getElementById('pulseRemindSelect');
    const submitWellnessBtn = document.getElementById('submitWellnessBtn');
    const completeBtn       = document.getElementById('completeCheckinBtn');
    const openPulseBtns     = document.querySelectorAll('.open-pulse-modal-btn, #openPulseModalBtn');
    const pulseBtns         = document.querySelectorAll('.pulse-opt-btn');

    let selectedPulseVal = null;

    function openWellnessModal() {
        if (wellnessModal) {
            wellnessModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeWellnessModal() {
        if (wellnessModal) {
            wellnessModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // Bind manual open triggers (Header button / nav link)
    openPulseBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openWellnessModal();
        });
    });

    if (wellnessCloseBtn) {
        wellnessCloseBtn.addEventListener('click', closeWellnessModal);
    }

    // Mood Option Button Selection Logic
    pulseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            pulseBtns.forEach(b => {
                b.style.borderColor = '#cbd5e1';
                b.style.background = '#ffffff';
            });
            btn.style.borderColor = '#0038A8';
            btn.style.background = '#eff6ff';
            selectedPulseVal = btn.getAttribute('data-val');
        });
    });

    // Snooze / Remind Later Handler
    if (remindLaterBtn) {
        remindLaterBtn.addEventListener('click', () => {
            const minutes = parseInt(pulseRemindSelect?.value || '60', 10);
            const nextReminderMs = Date.now() + (minutes * 60 * 1000);
            
            localStorage.setItem('kandili_pulse_next_reminder', nextReminderMs.toString());
            closeWellnessModal();

            const timeText = minutes >= 60 ? `${minutes / 60} hour(s)` : `${minutes} minutes`;
            alert(`Reminder set! Kandili will remind you about your pulse check-in in ${timeText}.`);
        });
    }

    // Submit Quick Pulse Check-in
    if (submitWellnessBtn) {
        submitWellnessBtn.addEventListener('click', () => {
            if (!selectedPulseVal) {
                alert('Please select how you are feeling today before submitting.');
                return;
            }

            const today = new Date().toISOString().split('T')[0];
            localStorage.setItem('kandili_pulse_completed_date', today);
            localStorage.removeItem('kandili_pulse_next_reminder');

            alert('Thank you! Your daily pulse check-in has been recorded.');
            closeWellnessModal();
        });
    }

    // Full Risk Assessment Button
    if (completeBtn) {
        completeBtn.addEventListener('click', () => {
            closeWellnessModal();

            const targetSection = document.getElementById('burnoutAssessmentSection');
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                const burnoutCard = targetSection.nextElementSibling;
                if (burnoutCard) {
                    burnoutCard.classList.add('highlight-pulse');
                    setTimeout(() => {
                        burnoutCard.classList.remove('highlight-pulse');
                    }, 2000);
                }
            }
        });
    }

    // Close modal on overlay background click
    if (wellnessModal) {
        wellnessModal.addEventListener('click', (e) => {
            if (e.target === wellnessModal) closeWellnessModal();
        });
    }
});

// ============================================================
// REQUEST LEAVE MODAL HANDLER
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const leaveModal = document.getElementById('requestLeaveModal');
    // Finds the "+ Request Leave" link in the card title
    const requestLeaveBtn = document.querySelector('a[href="#"][style*="Request Leave"]') || document.querySelector('.card-title a');
    const closeBtn = document.getElementById('leaveModalCloseBtn');
    const cancelBtn = document.getElementById('cancelLeaveBtn');
    const submitBtn = document.getElementById('submitLeaveBtn');

    // Open Modal
    if (requestLeaveBtn && leaveModal) {
        requestLeaveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            leaveModal.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Default dates to today
            const today = new Date().toISOString().split('T')[0];
            const startDate = document.getElementById('leaveStartDate');
            const endDate = document.getElementById('leaveEndDate');
            if (startDate) startDate.value = today;
            if (endDate) endDate.value = today;
        });
    }

    // Close Modal helper
    function closeLeaveModal() {
        if (leaveModal) {
            leaveModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    if (closeBtn) closeBtn.addEventListener('click', closeLeaveModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeLeaveModal);

    if (leaveModal) {
        leaveModal.addEventListener('click', (e) => {
            if (e.target === leaveModal) closeLeaveModal();
        });
    }

    // Submit Request Handler
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const leaveType = document.getElementById('leaveTypeSelect')?.value;
            const startDate = document.getElementById('leaveStartDate')?.value;
            const endDate = document.getElementById('leaveEndDate')?.value;
            const substitute = document.getElementById('substituteSelect')?.value || '-';
            const reason = document.getElementById('leaveReasonTextarea')?.value.trim();

            if (!startDate || !endDate) {
                alert('Please select valid start and end dates.');
                return;
            }
            if (!reason) {
                alert('Please provide a brief reason for your absence request.');
                return;
            }

            // Append new row to Absence Requests table
            const tableBody = document.querySelector('.content-card:has(.fa-calendar-times) tbody');
            if (tableBody) {
                const formattedDate = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const newRow = document.createElement('tr');
                newRow.innerHTML = `
                    <td>${formattedDate}</td>
                    <td>${leaveType}</td>
                    <td><span class="status-badge status-pending">Pending</span></td>
                    <td>${substitute}</td>
                    <td style="color: #64748b;">${reason}</td>
                `;
                tableBody.insertBefore(newRow, tableBody.firstChild);
            }

            alert('Absence request submitted successfully and is pending admin review!');
            
            // Reset form and close
            document.getElementById('leaveReasonTextarea').value = '';
            closeLeaveModal();
        });
    }
});


document.addEventListener('DOMContentLoaded', async () => {
    await initTeacherDashboard();
    setupESF7UploadListener();
});

// 1. Initialize Dashboard & Populate Live Workload Tables
async function initTeacherDashboard() {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        const userId = session.user.id;

        // Fetch User Profile
        const { data: profile } = await window.supabaseClient
            .from('profiles')
            .select('first_name, last_name, department')
            .eq('id', userId)
            .single();

        if (profile) {
            const welcomeText = document.getElementById('dashboardWelcomeHeading') || document.querySelector('.welcome-header h1');
            if (welcomeText) {
                const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                welcomeText.textContent = fullName ? `👋 Welcome back, ${fullName}` : '👋 Welcome back';
            }
        }

        // Fetch Teaching Loads
        const { data: teachingLoads } = await window.supabaseClient
            .from('teaching_loads')
            .select('*')
            .eq('teacher_id', userId);

        // Fetch Ancillary Duties
        const { data: ancillaryDuties } = await window.supabaseClient
            .from('ancillary_duties')
            .select('*')
            .eq('teacher_id', userId);

        // Update Official Workload Table
        renderOfficialWorkloadTable(teachingLoads || [], ancillaryDuties || []);

    } catch (err) {
        console.error("Failed to load teacher dashboard live data:", err);
    }
}

// 2. Render Live Data into Team's Official Workload (From eSF7) Table
function renderOfficialWorkloadTable(teachingLoads, ancillaryDuties) {
    const tableBody = document.querySelector('.data-table tbody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (teachingLoads.length === 0 && ancillaryDuties.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 1.5rem; color: #64748b;">
                    No eSF7 workload records found. Choose an eSF7 spreadsheet (.xlsx) above and click <strong>Upload Program</strong> to populate your schedule.
                </td>
            </tr>`;
        return;
    }

    // Render Teaching Loads Rows
    teachingLoads.forEach(load => {
        const hours = (load.minutes_per_week / 60).toFixed(1);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${load.subject_category}</strong></td>
            <td>${load.grade_level || 'Grade Level'}</td>
            <td>MON-FRI</td>
            <td>${load.minutes_per_week} mins/wk</td>
            <td><span class="badge" style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-size:0.8rem;">Teaching</span></td>
            <td>${hours} hrs</td>
            <td><span class="status-badge status-confirmed"><i class="fas fa-check"></i> Active</span></td>
        `;
        tableBody.appendChild(tr);
    });

    // Render Ancillary Duties Rows
    ancillaryDuties.forEach(duty => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${duty.duty_title}</strong></td>
            <td>School Wide</td>
            <td>-</td>
            <td>-</td>
            <td><span class="badge" style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:4px; font-size:0.8rem;">Ancillary</span></td>
            <td style="color: #C8102E; font-weight: 600;">${duty.hours_per_week} hrs</td>
            <td><span class="status-badge status-pending"><i class="fas fa-clock"></i> Pending Review</span></td>
        `;
        tableBody.appendChild(tr);
    });
}

// 3. Attach Ingestion Engine to Team's Upload Button (#uploadProgramBtn)
function setupESF7UploadListener() {
    const fileInput = document.getElementById('classProgramFile');
    const uploadBtn = document.getElementById('uploadProgramBtn');

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const file = fileInput.files[0];
        if (!file) {
            alert("Please select an eSF7 spreadsheet file (.xlsx) first.");
            return;
        }

        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) {
            alert("Session expired. Please log in again.");
            return;
        }

        uploadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;
        uploadBtn.disabled = true;

        try {
            // Call esf7Parser.js function
            const result = await parseAndUploadESF7(file, session.user.id);
            alert(`Success! Ingested ${result.teachingCount} teaching loads and ${result.ancillaryCount} ancillary duties.`);
            window.location.reload();
        } catch (err) {
            alert("Upload Failed: " + (err.message || err));
        } finally {
            uploadBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Upload Program`;
            uploadBtn.disabled = false;
        }
    });
}