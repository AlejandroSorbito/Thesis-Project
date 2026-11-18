// static/adminDashboard.js

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Load Logged-In Admin Name into Welcome Banner
    await loadAdminWelcomeProfile();

    // 1. Initial Load: Faculty Directory
    await loadFacultyDirectory();
    
    // 2. Initial Load: Phase 4 Admin Dynamic Charts
    await loadAdminCharts();
    
    // 3. Setup Refresh Button
    const refreshBtn = document.querySelector('.theme-nav__refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Refreshing...`;
            await loadFacultyDirectory();
            await loadAdminCharts();
            refreshBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Refresh`;
        });
    }

    // 4. Setup Drawer Open/Close via body listener
    setupDrawerToggle();

    // 5. Auto-generate teacher code when drawer opens
    setupTeacherCodeGeneration();

    // 6. Setup Password Generate button
    setupPasswordGenerator();

    // 7. Setup Add Teacher Drawer Form Submission
    setupAddTeacherForm();
});

async function loadAdminWelcomeProfile() {
    const nameEl = document.getElementById('adminFullName');
    if (!nameEl || !window.supabaseClient) return;

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session?.user) return;

        const { data: profile, error } = await window.supabaseClient
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', session.user.id)
            .single();

        if (!error && profile) {
            const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
            if (fullName) {
                nameEl.textContent = fullName;
            }
        }
    } catch (err) {
        console.error('Failed to load admin profile name:', err);
    }
}

/* ============================================================
   DRAWER TOGGLE (Open / Close)
   ============================================================ */
function setupDrawerToggle() {
    const teacherDrawer = document.getElementById('teacherDrawer');
    const openTeacherButtons = document.querySelectorAll('.open-teacher-drawer, .btn-add-teacher');
    const closeTeacherDrawer = document.getElementById('closeTeacherDrawer');
    const cancelTeacherDrawerBtn = document.getElementById('cancelTeacherDrawerBtn');

    if (!teacherDrawer) return;

    openTeacherButtons.forEach(button => {
        button.addEventListener('click', () => {
            teacherDrawer.classList.add('active');
            // Auto-generate teacher code when opening
            generateTeacherCode();
        });
    });

    if (closeTeacherDrawer) {
        closeTeacherDrawer.addEventListener('click', () => {
            teacherDrawer.classList.remove('active');
        });
    }

    if (cancelTeacherDrawerBtn) {
        cancelTeacherDrawerBtn.addEventListener('click', () => {
            teacherDrawer.classList.remove('active');
        });
    }

    teacherDrawer.addEventListener('click', (event) => {
        if (event.target === teacherDrawer) {
            teacherDrawer.classList.remove('active');
        }
    });
}

/* ============================================================
   TEACHER CODE AUTO-GENERATION
   ============================================================ */
function setupTeacherCodeGeneration() {
    const generateCodeBtn = document.getElementById('generateTeacherCodeBtn');
    if (generateCodeBtn) {
        generateCodeBtn.addEventListener('click', generateTeacherCode);
    }

    const roleSelect = document.getElementById('userRoleSelect');
    if (roleSelect) {
        roleSelect.addEventListener('change', () => {
            const gradeSelect = document.getElementById('teacherGradeLevel');
            if (roleSelect.value === 'principal') {
                if (gradeSelect) gradeSelect.value = 'N/A - Principal';
            } else {
                if (gradeSelect && gradeSelect.value === 'N/A - Principal') {
                    gradeSelect.value = '';
                }
            }
            generateTeacherCode();
        });
    }
}

async function generateTeacherCode() {
    const teacherCodeInput = document.getElementById('teacherCode');
    if (!teacherCodeInput) return;

    const roleSelect = document.getElementById('userRoleSelect');
    const selectedRole = roleSelect ? roleSelect.value : 'teacher';

    const currentYear = new Date().getFullYear();
    const prefix = selectedRole === 'principal' ? `PRN${currentYear}-` : `TCH${currentYear}-`;

    try {
        const { data: existingCodes, error } = await window.supabaseClient
            .from('profiles')
            .select('teacher_code')
            .not('teacher_code', 'is', null);

        const usedCodes = new Set();
        if (!error && existingCodes) {
            existingCodes.forEach(item => {
                if (item.teacher_code) {
                    usedCodes.add(item.teacher_code.trim());
                }
            });
        }

        let code;
        let attempts = 0;
        do {
            const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
            code = `${prefix}${suffix}`;
            attempts += 1;
        } while (usedCodes.has(code) && attempts < 20);

        teacherCodeInput.value = code;
    } catch (err) {
        console.error("Failed to generate code:", err);
        teacherCodeInput.value = `${prefix}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    }
}

/* ============================================================
   PASSWORD GENERATOR
   ============================================================ */
function setupPasswordGenerator() {
    const generateBtn = document.getElementById('generatePasswordBtn');
    if (!generateBtn) return;

    generateBtn.addEventListener('click', async () => {
        const password = generateSecurePassword();
        const passwordInput = document.getElementById('teacherPassword');
        if (passwordInput) {
            passwordInput.value = password;
        }

        await generateTeacherCode();
    });
}

function generateSecurePassword() {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const requiredChars = [
        uppercase[Math.floor(Math.random() * uppercase.length)],
        lowercase[Math.floor(Math.random() * lowercase.length)],
        numbers[Math.floor(Math.random() * numbers.length)],
        special[Math.floor(Math.random() * special.length)]
    ];

    const allChars = uppercase + lowercase + numbers + special;
    const remainingLength = Math.floor(Math.random() * 5) + 8;
    const randomChars = [];
    for (let i = 0; i < remainingLength; i++) {
        randomChars.push(allChars[Math.floor(Math.random() * allChars.length)]);
    }

    const combined = [...requiredChars, ...randomChars];
    for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    return combined.join('');
}

/* ============================================================
   FACULTY DIRECTORY & WORKLOAD LOADING
   ============================================================ */
async function loadFacultyDirectory() {
    try {
        const { data: profiles, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select(`
                id,
                first_name,
                last_name,
                role,
                department,
                grade_level,
                teacher_code,
                teaching_loads ( minutes_per_week ),
                ancillary_duties ( hours_per_week )
            `)
            .or('role.eq.teacher,role.eq.principal');

        if (profileError) {
            console.error("Error fetching faculty profiles:", profileError.message);
            return;
        }

        const tableBody = document.querySelector('.dashboard-table tbody');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        let overloadedCount = 0;
        let maximizedCount = 0;
        let optimalCount = 0;
        let underloadedCount = 0;

        profiles.forEach((profile, index) => {
            const teachingMins = profile.teaching_loads?.reduce((sum, item) => sum + (item.minutes_per_week || 0), 0) || 0;
            const teachingHrs = teachingMins / 60;
            const ancillaryHrs = profile.ancillary_duties?.reduce((sum, item) => sum + parseFloat(item.hours_per_week || 0), 0) || 0;
            
            const totalWorkloadHrs = (teachingHrs + ancillaryHrs).toFixed(1);

            let statusBadge = '';
            if (totalWorkloadHrs > 30) {
                statusBadge = `<span class="table-badge badge-red">Overload</span>`;
                overloadedCount++;
            } else if (totalWorkloadHrs > 28) {
                statusBadge = `<span class="table-badge badge-orange">Maximized</span>`;
                maximizedCount++;
            } else if (totalWorkloadHrs >= 24) {
                statusBadge = `<span class="table-badge badge-green">Optimal</span>`;
                optimalCount++;
            } else {
                statusBadge = `<span class="table-badge badge-sky">Underload</span>`;
                underloadedCount++;
            }

            const tCode = profile.teacher_code || `TCH2026-${String(index + 1).padStart(3, '0')}`;
            const fullName = `${profile.last_name || ''}, ${profile.first_name || 'Faculty'}`;
            const department = profile.department || 'Not Assigned';
            const roleText = profile.role ? profile.role.toUpperCase() : 'TEACHER';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="text-muted">${tCode}</td>
                <td class="font-medium name-cell">${fullName}</td>
                <td>${roleText}</td>
                <td>${department}</td>
                <td class="text-blue-dark">${totalWorkloadHrs} hrs</td>
                <td>${statusBadge}</td>
                <td class="action-cell">
                    <div class="action-dropdown-wrapper">
                        <button class="btn-action-dots" type="button" aria-label="Action Menu">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="action-dropdown-menu">
                            <button
                                class="dropdown-item btn-edit-profile"
                                type="button"
                                onclick="window.location.href='admin_facultydirectory.html?search=${encodeURIComponent(tCode)}'"
                                data-profile-id="${profile.id || ''}"
                                data-code="${tCode}"
                                data-firstname="${profile.first_name || ''}"
                                data-lastname="${profile.last_name || ''}"
                                data-email=""
                                data-dept="${department}"
                                data-grade="${profile.grade_level || ''}"
                                data-ancillary=""
                            >
                                <i class="fas fa-user-edit"></i> Edit Profile
                            </button>
                            <div class="dropdown-divider"></div>
                            <button class="dropdown-item item-danger" type="button" onclick="confirmRemoveTeacher(this, '${tCode}', '${fullName}', '${profile.id}')">
                                <i class="fas fa-trash-alt"></i> Remove
                            </button>
                        </div>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });

        if (typeof updateRiskCards === 'function') {
            updateRiskCards(underloadedCount, optimalCount, maximizedCount, overloadedCount);
        }

    } catch (err) {
        console.error("Failed to load admin directory:", err);
    }
}

function updateRiskCards(underload, optimal, maximized, overload) {
    const underloadEl = document.querySelector('.workload-card--underload .workload-card-number');
    const optimalEl = document.querySelector('.workload-card--optimal .workload-card-number');
    const highEl = document.querySelector('.workload-card--high .workload-card-number');
    const overloadEl = document.querySelector('.workload-card--overload .workload-card-number');

    if (underloadEl) underloadEl.innerText = underload;
    if (optimalEl) optimalEl.innerText = optimal;
    if (highEl) highEl.innerText = maximized;
    if (overloadEl) overloadEl.innerText = overload;
}

/* ============================================================
   PHASE 4: LIVE CHART.JS DATA BINDING
   ============================================================ */
let adminTrendChartInstance = null;
let adminDistChartInstance = null;

async function loadAdminCharts() {
    await Promise.all([
        renderAdminBurnoutTrendChart(),
        renderAdminLoadDistributionChart()
    ]);
}

// Line Chart: School-wide Burnout Risk Trend from burnout_assessments
async function renderAdminBurnoutTrendChart() {
    const trendCtx = document.getElementById('burnoutTrendChart');
    if (!trendCtx) return;

    try {
        const { data: assessments, error } = await window.supabaseClient
            .from('burnout_assessments')
            .select('risk_index, created_at')
            .order('created_at', { ascending: true });

        if (error) {
            console.error("Error fetching burnout assessments for chart:", error.message);
            return;
        }

        if (!assessments || assessments.length === 0) return;

        const monthlyGroups = {};
        assessments.forEach(item => {
            const date = new Date(item.created_at);
            const monthLabel = date.toLocaleString('en-US', { month: 'short' });
            
            if (!monthlyGroups[monthLabel]) {
                monthlyGroups[monthLabel] = { sum: 0, count: 0 };
            }
            monthlyGroups[monthLabel].sum += parseFloat(item.risk_index || 0);
            monthlyGroups[monthLabel].count += 1;
        });

        const labels = Object.keys(monthlyGroups);
        const dataValues = labels.map(m => Math.round(monthlyGroups[m].sum / monthlyGroups[m].count));

        // 💡 SAFELY DESTROY ANY EXISTING CHART INSTANCE ON THIS CANVAS
        const existingChart = Chart.getChart(trendCtx);
        if (existingChart) {
            existingChart.destroy();
        }

        adminTrendChartInstance = new Chart(trendCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Average Faculty Burnout Risk Score',
                    data: dataValues,
                    borderColor: '#b91c1c',
                    backgroundColor: 'rgba(185, 28, 28, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#b91c1c',
                    pointBorderColor: '#ffffff',
                    pointRadius: 5,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });

    } catch (err) {
        console.error("Failed to render burnout trend chart:", err);
    }
}

// 2. Doughnut Chart: Live Workload Ratios
async function renderAdminLoadDistributionChart() {
    const distCtx = document.getElementById('loadDistributionChart');
    if (!distCtx) return;

    try {
        const [teachingRes, ancillaryRes] = await Promise.all([
            window.supabaseClient.from('teaching_loads').select('minutes_per_week'),
            window.supabaseClient.from('ancillary_duties').select('hours_per_week')
        ]);

        const totalTeachingMins = teachingRes.data?.reduce((sum, i) => sum + (i.minutes_per_week || 0), 0) || 0;
        const totalTeachingHrs = totalTeachingMins / 60;
        const totalAncillaryHrs = ancillaryRes.data?.reduce((sum, i) => sum + parseFloat(i.hours_per_week || 0), 0) || 0;

        const calculatedTotal = totalTeachingHrs + totalAncillaryHrs || 1;
        const teachingPercent = Math.round((totalTeachingHrs / calculatedTotal) * 100) || 65;
        const ancillaryPercent = Math.round((totalAncillaryHrs / calculatedTotal) * 100) || 25;
        const advisingPercent = Math.max(0, 100 - teachingPercent - ancillaryPercent);

        // 💡 SAFELY DESTROY ANY EXISTING CHART INSTANCE ON THIS CANVAS
        const existingChart = Chart.getChart(distCtx);
        if (existingChart) {
            existingChart.destroy();
        }

        adminDistChartInstance = new Chart(distCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Teaching Hours', 'Ancillary Duties', 'Advisory / Prep Load'],
                datasets: [{
                    data: [teachingPercent, ancillaryPercent, advisingPercent],
                    backgroundColor: ['#0038A8', '#facc15', '#94a3b8'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: { size: 12, family: "'Inter', sans-serif" },
                            color: '#475569'
                        }
                    }
                }
            }
        });

    } catch (err) {
        console.error("Failed to render load distribution chart:", err);
    }
}
/* ============================================================
   ADD TEACHER FORM SUBMISSION
   ============================================================ */
function setupAddTeacherForm() {
    const createAccountBtn = document.getElementById('createTeacherAccountBtn');
    if (!createAccountBtn) return;

    createAccountBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const selectedRole = document.getElementById('userRoleSelect')?.value || 'teacher';
        const firstName = document.getElementById('teacherFirstName')?.value.trim();
        const lastName = document.getElementById('teacherLastName')?.value.trim();
        const email = document.getElementById('teacherEmail')?.value.trim();
        const school = document.getElementById('teacherSchool')?.value;
        const rawGradeLevel = document.getElementById('teacherGradeLevel')?.value;
        const gradeLevel = selectedRole === 'principal' ? (rawGradeLevel || 'N/A - Principal') : rawGradeLevel;
        const password = document.getElementById('teacherPassword')?.value.trim();
        const teacherCode = document.getElementById('teacherCode')?.value.trim();

        if (!firstName || !lastName || !email || !school || (!gradeLevel && selectedRole !== 'principal') || !password) {
            alert("Please fill in all required fields marked with *.");
            return;
        }

        if (!email.includes('@') || !email.includes('.')) {
            alert("Please enter a valid email address.");
            return;
        }

        const passwordErrors = [];
        if (password.length < 8) passwordErrors.push("At least 8 characters");
        if (!/[A-Z]/.test(password)) passwordErrors.push("Contains uppercase letter");
        if (!/[a-z]/.test(password)) passwordErrors.push("Contains lowercase letter");
        if (!/[0-9]/.test(password)) passwordErrors.push("Contains at least one number");
        if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) passwordErrors.push("Contains at least one special character");

        if (passwordErrors.length > 0) {
            alert("Password requirements not met:\n• " + passwordErrors.join("\n• "));
            return;
        }

        const roleLabel = selectedRole === 'principal' ? 'Principal' : 'Teacher';
        createAccountBtn.innerText = "⏳ Creating Account...";
        createAccountBtn.disabled = true;

        try {
            const { data: { session: currentAdminSession } } = await window.supabaseClient.auth.getSession();

            const departmentStr = selectedRole === 'principal' ? `${school} - Principal's Office` : `${school} - ${gradeLevel}`;

            const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        first_name: firstName,
                        last_name: lastName,
                        role: selectedRole,
                        school: school,
                        grade_level: gradeLevel,
                        teacher_code: teacherCode,
                        department: departmentStr
                    }
                }
            });

            if (authError) {
                alert(`Failed to create ${roleLabel.toLowerCase()} account: ` + authError.message);
                createAccountBtn.innerText = "Create Account";
                createAccountBtn.disabled = false;
                return;
            }

            if (currentAdminSession) {
                await window.supabaseClient.auth.setSession({
                    access_token: currentAdminSession.access_token,
                    refresh_token: currentAdminSession.refresh_token
                });
            }

            if (authData?.user?.id) {
                const { error: updateError } = await window.supabaseClient
                    .from('profiles')
                    .update({ 
                        role: selectedRole,
                        teacher_code: teacherCode,
                        school: school,
                        grade_level: gradeLevel,
                        first_name: firstName,
                        last_name: lastName,
                        department: departmentStr
                    })
                    .eq('id', authData.user.id);

                if (updateError) {
                    console.warn("Failed to update profile metadata:", updateError.message);
                }
            }

            alert(`${roleLabel} account created successfully!\n\nRole: ${roleLabel}\nName: ${firstName} ${lastName}\nEmail: ${email}\nSchool: ${school}\nAssignment: ${departmentStr}\nUser Code: ${teacherCode}\nPassword: ${password}`);

            document.getElementById('teacherFirstName').value = '';
            document.getElementById('teacherLastName').value = '';
            document.getElementById('teacherEmail').value = '';
            document.getElementById('teacherSchool').value = '';
            document.getElementById('teacherGradeLevel').value = '';
            document.getElementById('teacherPassword').value = '';

            createAccountBtn.innerText = "Create Account";
            createAccountBtn.disabled = false;
            document.getElementById('teacherDrawer').classList.remove('active');

            await loadFacultyDirectory();
            await loadAdminCharts();

        } catch (err) {
            console.error("Failed to create teacher account:", err);
            alert("An unexpected error occurred. Please try again.");
            createAccountBtn.innerText = "Create Account";
            createAccountBtn.disabled = false;
        }
    });
}

function manageUser(userId) {
    alert("User Management for ID: " + userId + "\nThis action opens detail configurations.");
}

// Three-Dots Menu Toggle & Removal Logic
document.addEventListener('click', (e) => {
    const dotsBtn = e.target.closest('.btn-action-dots');
    
    document.querySelectorAll('.action-dropdown-wrapper.active').forEach(wrapper => {
        if (!dotsBtn || wrapper !== dotsBtn.closest('.action-dropdown-wrapper')) {
            wrapper.classList.remove('active');
        }
    });

    if (dotsBtn) {
        const currentWrapper = dotsBtn.closest('.action-dropdown-wrapper');
        currentWrapper.classList.toggle('active');
    }
});

// Remove Teacher Handler
function confirmRemoveTeacher(btn, teacherCode, teacherName, profileId) {
    if (confirm(`Are you sure you want to remove ${teacherName} (${teacherCode}) from the directory?`)) {
        const row = btn.closest('tr');
        if (row) {
            row.remove();
        }
        alert(`${teacherName} has been removed successfully.`);
    }
}