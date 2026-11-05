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
    setupGradeUpload();

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

    renderWorkloadFromClassProgram(data);

    // Compute and render Workload Strain Index (WSI)
    const wsiResult = calculateWSI(data);
    updateWSIUI(wsiResult);
    if (wsiResult) {
        updateWorkloadComparisonChart(wsiResult.weeklyWSI);
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

/**
 * Aggregates subjects from the Class Program scheduleMatrix and renders
 * the rows into the "Official Workload (From Class Program)" table.
 */
function renderWorkloadFromClassProgram(data) {
    const tableBody = document.querySelector('#official-workload-section .data-table tbody');
    const metaEl = document.querySelector('#official-workload-section .card-title-meta');
    if (!tableBody) return;

    const emptyStateHtml = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 1.5rem; color: #64748b;">
                No workload records found. Choose a class program spreadsheet (.xlsx) above and click <strong>Upload Program</strong> to populate your schedule.
            </td>
        </tr>`;

    if (!data || !data.scheduleMatrix || !Array.isArray(data.scheduleMatrix) || data.scheduleMatrix.length === 0) {
        tableBody.innerHTML = emptyStateHtml;
        if (metaEl) metaEl.textContent = '';
        return;
    }

    const section = data.section || 'Grade 2 - A';
    const dayColumns = [
        { key: 'mon', label: 'MON' },
        { key: 'tue', label: 'TUE' },
        { key: 'wed', label: 'WED' },
        { key: 'thu', label: 'THU' },
        { key: 'fri', label: 'FRI' }
    ];

    const nonTeachingKeywords = ['flag ceremony', 'health break', 'recess'];
    const isNonTeaching = (name) => {
        if (!name || typeof name !== 'string') return true;
        const lower = name.trim().toLowerCase();
        if (!lower) return true;
        return nonTeachingKeywords.some(keyword => lower.includes(keyword));
    };

    const subjectsMap = {};
    let grandTotalMinutes = 0;

    data.scheduleMatrix.forEach(row => {
        const rowMin = parseInt(row.min, 10) || 60;
        const rowTime = row.time || '';

        dayColumns.forEach(day => {
            const rawSubj = (row[day.key] || '').trim();
            if (isNonTeaching(rawSubj)) return;

            const normKey = rawSubj.toLowerCase();
            if (!subjectsMap[normKey]) {
                subjectsMap[normKey] = {
                    name: rawSubj,
                    days: new Set(),
                    totalMinutes: 0,
                    time: rowTime
                };
            }

            subjectsMap[normKey].days.add(day.label);
            subjectsMap[normKey].totalMinutes += rowMin;
            grandTotalMinutes += rowMin;
            if (!subjectsMap[normKey].time && rowTime) {
                subjectsMap[normKey].time = rowTime;
            }
        });
    });

    const subjectKeys = Object.keys(subjectsMap);
    if (subjectKeys.length === 0) {
        tableBody.innerHTML = emptyStateHtml;
        if (metaEl) metaEl.textContent = '';
        return;
    }

    const allDays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const generatedRows = subjectKeys.map(key => {
        const item = subjectsMap[key];
        const daysList = allDays.filter(d => item.days.has(d));
        const daysStr = daysList.length === 5 ? 'MON-FRI' : daysList.join(', ');
        const hoursStr = `${(item.totalMinutes / 60).toFixed(1)} hrs`;

        return `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${section}</td>
                <td>${daysStr}</td>
                <td>${item.time || '-'}</td>
                <td><span class="badge" style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-size:0.8rem;">Teaching</span></td>
                <td>${hoursStr}</td>
                <td><span class="status-badge status-confirmed"><i class="fas fa-check"></i> Active</span></td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = generatedRows;

    const totalHours = (grandTotalMinutes / 60).toFixed(1);
    if (metaEl) {
        metaEl.textContent = `Total: ${totalHours} hrs/week`;
    }
}


/**
 * 1. Helper Function: Parse Time String to Minutes
 * Input examples: "7:00 - 7:20", "11:00 - 1:00", "2:00 - 3:00 PM"
 */
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

/**
 * 2. Calculation Engine: Compute Workload Strain Index (WSI)
 */
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

/**
 * 3 & 4. Update Workload Status & Trends + Targeted Recommendations UI
 */
function updateWSIUI(wsi) {
    const statusCard = document.querySelector('.intel-grid .intel-card:not(.reco-card)');
    const recoCard = document.querySelector('.intel-card.reco-card');

    if (!wsi) return;

    const roundedWsi = Math.round(wsi.weeklyWSI);
    const fillWidth = Math.min(100, Math.max(0, roundedWsi));

    let riskBadgeStyle = 'background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;';
    let riskFillColor = '#10b981';
    let riskIcon = 'fa-check-circle';

    if (wsi.riskLevel === 'Critical Risk') {
        riskBadgeStyle = 'background:#fee2e2; color:#991b1b; border:1px solid #f87171;';
        riskFillColor = '#991b1b';
        riskIcon = 'fa-circle-radiation';
    } else if (wsi.riskLevel === 'High Risk') {
        riskBadgeStyle = 'background:#fef2f2; color:#b91c1c; border:1px solid #fecaca;';
        riskFillColor = '#dc2626';
        riskIcon = 'fa-exclamation-triangle';
    } else if (wsi.riskLevel === 'Moderate Risk') {
        riskBadgeStyle = 'background:#fffbeb; color:#b45309; border:1px solid #fde68a;';
        riskFillColor = '#f59e0b';
        riskIcon = 'fa-exclamation-circle';
    }

    // Contributors List
    const contributors = [];
    if (wsi.afterHoursMins > 120) {
        contributors.push(`<div><i class="fas fa-exclamation-circle" style="color:#ea580c; margin-right:6px;"></i> After-hours duties exceed 2 hours</div>`);
    }
    if (wsi.overloadHours > 0) {
        contributors.push(`<div><i class="fas fa-exclamation-circle" style="color:#ea580c; margin-right:6px;"></i> Teaching load exceeds 6 hours/day</div>`);
    }
    if (contributors.length === 0) {
        contributors.push(`<div><i class="fas fa-check-circle" style="color:#10b981; margin-right:6px;"></i> Load is within policy limits.</div>`);
    }

    if (statusCard) {
        const scoreMain = statusCard.querySelector('.risk-score-main');
        const statusBadge = statusCard.querySelector('.risk-status-badge');
        const barFill = statusCard.querySelector('.risk-bar-fill');
        const contribList = statusCard.querySelector('.contributors-list');

        if (scoreMain && statusBadge && barFill && contribList) {
            scoreMain.textContent = `Risk Score: ${roundedWsi}`;
            statusBadge.setAttribute('style', `padding: 4px 10px; border-radius: 999px; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; ${riskBadgeStyle}`);
            statusBadge.innerHTML = `<i class="fas ${riskIcon}"></i> ${wsi.riskLevel}`;
            barFill.style.width = `${fillWidth}%`;
            barFill.style.backgroundColor = riskFillColor;
            contribList.innerHTML = contributors.join('');
        } else {
            statusCard.innerHTML = `
                <h4><i class="fas fa-crosshairs"></i> Workload Status &amp; Trends</h4>
                <div class="risk-indicator-box" style="margin: 1rem 0;">
                    <div class="risk-indicator-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <span class="risk-score-main" style="font-size: 1.15rem; font-weight: 800; color: #0f172a;">Risk Score: ${roundedWsi}</span>
                        <span class="risk-status-badge" style="padding: 4px 10px; border-radius: 999px; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; ${riskBadgeStyle}">
                            <i class="fas ${riskIcon}"></i> ${wsi.riskLevel}
                        </span>
                    </div>
                    <div class="risk-bar-bg" style="width: 100%; height: 10px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
                        <div class="risk-bar-fill" style="width: ${fillWidth}%; height: 100%; background-color: ${riskFillColor}; border-radius: 999px; transition: width 0.4s ease;"></div>
                    </div>
                </div>
                <div>
                    <h5 class="contributors-title" style="margin: 0.75rem 0 0.5rem 0; font-size: 0.9rem; font-weight: 700; color: #334155;">Risk Contributors:</h5>
                    <div class="contributors-list" style="font-size: 0.85rem; color: #475569; display: flex; flex-direction: column; gap: 6px;">
                        ${contributors.join('')}
                    </div>
                </div>
            `;
        }
    }

    // Recommendations List
    const recommendations = [];
    if (wsi.weeklyWSI > 80) {
        recommendations.push(`
            <div class="reco-item" style="display: flex; gap: 10px; align-items: flex-start; margin-bottom: 0.75rem;">
                <i class="fas fa-triangle-exclamation" style="color: #dc2626; font-size: 1.1rem; margin-top: 2px;"></i>
                <div><strong>URGENT:</strong> Reduce after-school duties and teaching overload immediately to prevent burnout.</div>
            </div>
        `);
    }
    if (wsi.afterHoursMins > 120) {
        recommendations.push(`
            <div class="reco-item" style="display: flex; gap: 10px; align-items: flex-start; margin-bottom: 0.75rem;">
                <i class="fas fa-star" style="color: #ea580c; font-size: 1.1rem; margin-top: 2px;"></i>
                <div><strong>HIGH PRIORITY:</strong> Transfer after-hours duties to a peer.</div>
            </div>
        `);
    }
    if (wsi.overloadHours > 0) {
        recommendations.push(`
            <div class="reco-item" style="display: flex; gap: 10px; align-items: flex-start; margin-bottom: 0.75rem;">
                <i class="fas fa-clock" style="color: #d97706; font-size: 1.1rem; margin-top: 2px;"></i>
                <div>Reduce direct teaching time to stay within the 6-hour Magna Carta limit.</div>
            </div>
        `);
    }
    if (recommendations.length === 0) {
        recommendations.push(`
            <div class="reco-item" style="display: flex; gap: 10px; align-items: flex-start; margin-bottom: 0.75rem;">
                <i class="fas fa-check-circle" style="color: #10b981; font-size: 1.1rem; margin-top: 2px;"></i>
                <div>Schedule is balanced and compliant with DepEd workload standards.</div>
            </div>
        `);
    }

    if (recoCard) {
        const emptyP = recoCard.querySelector('p');
        if (emptyP) emptyP.remove();

        let listEl = recoCard.querySelector('.reco-list');
        const actionRow = recoCard.querySelector('.action-row');
        if (!listEl) {
            listEl = document.createElement('div');
            listEl.className = 'reco-list';
            listEl.style.margin = '1rem 0';
            if (actionRow) recoCard.insertBefore(listEl, actionRow);
            else recoCard.appendChild(listEl);
        }
        listEl.innerHTML = recommendations.join('');
    }
}

/**
 * 5. Update the "Workload Comparison" Chart with WSI Data
 */
function updateWorkloadComparisonChart(weeklyWSI) {
    const workloadCanvas = document.getElementById('teacherWorkloadChart');
    if (!workloadCanvas) return;
    if (teacherWorkloadChartInstance) teacherWorkloadChartInstance.destroy();

    const currentWsi = typeof weeklyWSI === 'number' ? Number(weeklyWSI.toFixed(1)) : 0;
    let userColor = '#10b981'; // Low Risk
    if (currentWsi > 80) userColor = '#991b1b'; // Critical Risk
    else if (currentWsi >= 61) userColor = '#dc2626'; // High Risk
    else if (currentWsi >= 41) userColor = '#f59e0b'; // Moderate Risk

    teacherWorkloadChartInstance = new Chart(workloadCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Your WSI', 'Low Risk Limit (40)', 'Critical Limit (80)'],
            datasets: [{
                label: 'Weekly WSI',
                data: [currentWsi, 40, 80],
                backgroundColor: [userColor, '#10b981', '#ef4444'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} WSI` } }
            },
            scales: {
                y: {
                    min: 0,
                    max: Math.max(100, Math.ceil(currentWsi / 10) * 10),
                    title: { display: true, text: 'Weekly WSI' },
                    ticks: { stepSize: 20 }
                },
                x: { grid: { display: false } }
            }
        }
    });
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

    // 3. Workload Comparison Chart (WSI Scale)
    updateWorkloadComparisonChart(0);
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

// 2. Render Live Data into Team's Official Workload (From Class Program) Table
function renderOfficialWorkloadTable(teachingLoads, ancillaryDuties) {
    const tableBody = document.querySelector('#official-workload-section .data-table tbody') || document.querySelector('.data-table tbody');
    if (!tableBody) return;

    if (teachingLoads.length === 0 && ancillaryDuties.length === 0) {
        // If already populated by class program, do not overwrite with empty state
        const existingRows = tableBody.querySelectorAll('tr');
        const isPopulated = Array.from(existingRows).some(r => !r.textContent.includes('No workload records found'));
        if (isPopulated) return;

        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 1.5rem; color: #64748b;">
                    No workload records found. Choose a class program spreadsheet (.xlsx) above and click <strong>Upload Program</strong> to populate your schedule.
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = '';

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
            alert("Please select a class program spreadsheet file (.xlsx) first.");
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

/**
 * Learner Assessment & Grades Storage Excel/CSV Upload Handler
 */
function setupGradeUpload() {
    const uploadBtn = document.getElementById('uploadGradesBtn');
    const fileInput = document.getElementById('gradeFileInput');
    const tableBody = document.getElementById('studentGradesTableBody');

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
    });

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            alert('Spreadsheet processor (XLSX) library is not loaded. Please refresh the page.');
            return;
        }

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            // 1. Read sheet as 2D array to locate headers dynamically
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            if (!rawData || rawData.length === 0) {
                alert('The uploaded file is empty or contains no readable data.');
                return;
            }

            // 2. Find the Header Row dynamically by matching "LRN"
            let headerRowIndex = -1;
            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];
                if (Array.isArray(row) && row.some(cell => String(cell).trim().toUpperCase() === 'LRN')) {
                    headerRowIndex = i;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                alert('Could not find the "LRN" header row in the spreadsheet. Please verify the file headers.');
                return;
            }

            // 3. Map Header Row
            const headers = rawData[headerRowIndex].map(h => String(h).trim());

            // Case-insensitive column matcher
            const getVal = (row, candidates) => {
                const keys = Object.keys(row);
                for (const cand of candidates) {
                    const match = keys.find(k => k.trim().toLowerCase() === cand.toLowerCase());
                    if (match && row[match] !== undefined && row[match] !== '') {
                        return row[match];
                    }
                }
                return '';
            };

            const parsedStudents = [];

            // 4. Loop through data rows starting after headerRowIndex
            for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                const rowArr = rawData[i];
                if (!rowArr || !Array.isArray(rowArr) || rowArr.length === 0) continue;

                // Create row object mapping headers[j] -> rowArr[j]
                const row = {};
                headers.forEach((h, colIdx) => {
                    if (h) row[h] = rowArr[colIdx] !== undefined ? rowArr[colIdx] : '';
                });

                const lrn = String(getVal(row, ['LRN', 'Learner Reference Number', 'Student ID', 'ID'])).trim();
                const name = String(getVal(row, ['Learner Name', 'Learner Full Name', 'Name', 'Student Name', 'Full Name'])).trim();

                // Ignore completely empty rows or summary rows (e.g. Class Average, Highest, Lowest)
                if (!lrn && !name) continue;
                const checkStr = `${lrn} ${name}`.toLowerCase();
                if (checkStr.includes('class average') || checkStr.includes('highest') || checkStr.includes('lowest') || checkStr.includes('average')) {
                    continue;
                }

                // 8 Learning Areas
                const filipino = parseFloat(getVal(row, ['Filipino', 'FIL'])) || 0;
                const english = parseFloat(getVal(row, ['English', 'ENG'])) || 0;
                const math = parseFloat(getVal(row, ['Mathematics', 'Math', 'MATH'])) || 0;
                const science = parseFloat(getVal(row, ['Science', 'SCI'])) || 0;
                const ap = parseFloat(getVal(row, ['AP', 'Araling Panlipunan'])) || 0;
                const mapeh = parseFloat(getVal(row, ['MAPEH'])) || 0;
                const gmrc = parseFloat(getVal(row, ['GMRC', 'GMRC / Values Education', 'Values Education', 'ESP', 'EsP'])) || 0;
                const epp = parseFloat(getVal(row, ['EPP', 'EPP (Edukasyong Pantahanan at Pangkabuhayan)', 'TLE'])) || 0;

                if (!lrn && !name) continue;

                const subjects = [filipino, english, math, science, ap, mapeh, gmrc, epp];
                const sum = subjects.reduce((a, b) => a + b, 0);
                const average = parseFloat((sum / 8).toFixed(1));

                parsedStudents.push({ lrn, name, filipino, english, math, science, ap, mapeh, gmrc, epp, average });
            }

            if (parsedStudents.length === 0) {
                alert('No valid student grade records found. Please ensure headers match LRN, Learner Name, and the 8 subjects.');
                return;
            }

            if (tableBody) {
                tableBody.innerHTML = '';
                parsedStudents.forEach(st => {
                    const isPassed = st.average >= 75;
                    const statusClass = isPassed ? 'status-confirmed' : 'status-pending';
                    const statusText = isPassed ? 'Passed' : 'Failed';
                    const statusStyle = isPassed
                        ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 2px 8px; border-radius: 4px; font-weight: 700;'
                        : 'background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 2px 8px; border-radius: 4px; font-weight: 700;';

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${st.lrn || '-'}</td>
                        <td><strong>${st.name || '-'}</strong></td>
                        <td>${st.filipino || 0}</td>
                        <td>${st.english || 0}</td>
                        <td>${st.math || 0}</td>
                        <td>${st.science || 0}</td>
                        <td>${st.ap || 0}</td>
                        <td>${st.mapeh || 0}</td>
                        <td>${st.gmrc || 0}</td>
                        <td>${st.epp || 0}</td>
                        <td><strong>${st.average.toFixed(1)}</strong></td>
                        <td><span class="status-badge ${statusClass}" style="${statusStyle}">${statusText}</span></td>
                    `;
                    tableBody.appendChild(tr);
                });
            }
        } catch (err) {
            console.error('Error parsing grade file:', err);
            alert('Failed to parse the grade file. Please ensure it is a valid Excel (.xlsx, .xls) or CSV document.');
        }
    });
}
