/**
 * Superadmin School Hub Logic v4.2
 * Dynamic school switcher & live Supabase demographic/faculty rendering
 */

// School Node Profiles (metadata & sections; stats, principal, & faculty loaded live from Supabase)
const schoolData = {
    ROVCMS: {
        code: 'ROVCMS',
        schoolName: 'Raul O.V. Causing Memorial School',
        fullName: 'Raul O.V. Causing Memorial School (ROVCMS)',
        schoolId: '115204',
        district: 'District II',
        division: 'Division of Iloilo Province',
        location: 'District II, Division of Iloilo Province',
        principal: 'Not assigned',
        learners: '0',
        facultyCount: '0',
        sections: [
            { grade: 'Grade 1', name: 'Mabini', model: 'Self-Contained Advisory' },
            { grade: 'Grade 1', name: 'Bonifacio', model: 'Self-Contained Advisory' },
            { grade: 'Grade 2', name: 'Rizal', model: 'Self-Contained Advisory' },
            { grade: 'Grade 2', name: 'Del Pilar', model: 'Self-Contained Advisory' },
            { grade: 'Grade 3', name: 'Luna', model: 'Self-Contained Advisory' },
            { grade: 'Grade 4', name: 'Diamond', model: 'Departmentalized Delivery' },
            { grade: 'Grade 5', name: 'Emerald', model: 'Departmentalized Delivery' },
            { grade: 'Grade 6', name: 'Ruby', model: 'Departmentalized Delivery' }
        ],
        faculty: []
    },
    LJES: {
        code: 'LJES',
        schoolName: 'Lopez Jaena Elementary School',
        fullName: 'Lopez Jaena Elementary School (LJES)',
        schoolId: '115208',
        district: 'District I',
        division: 'Division of Iloilo Province',
        location: 'District I, Division of Iloilo Province',
        principal: 'Not assigned',
        learners: '0',
        facultyCount: '0',
        sections: [
            { grade: 'Grade 1', name: 'Sampaguita', model: 'Self-Contained Advisory' },
            { grade: 'Grade 2', name: 'Camia', model: 'Self-Contained Advisory' },
            { grade: 'Grade 3', name: 'Ilang-Ilang', model: 'Self-Contained Advisory' },
            { grade: 'Grade 4', name: 'Narra', model: 'Departmentalized Delivery' },
            { grade: 'Grade 5', name: 'Molave', model: 'Departmentalized Delivery' }
        ],
        faculty: []
    },
    SMES: {
        code: 'SMES',
        schoolName: 'San Miguel Elementary School',
        fullName: 'San Miguel Elementary School (SMES)',
        schoolId: '115215',
        district: 'District III',
        division: 'Division of Iloilo Province',
        location: 'District III, Division of Iloilo Province',
        principal: 'Not assigned',
        learners: '0',
        facultyCount: '0',
        sections: [
            { grade: 'Grade 1', name: 'Aguinaldo', model: 'Self-Contained Advisory' },
            { grade: 'Grade 2', name: 'Quezon', model: 'Self-Contained Advisory' },
            { grade: 'Grade 5', name: 'Tandang Sora', model: 'Departmentalized Delivery' },
            { grade: 'Grade 6', name: 'Lapu-Lapu', model: 'Departmentalized Delivery' }
        ],
        faculty: []
    }
};

let currentSelectedSchool = 'ROVCMS';
let currentLiveFaculty = [];

function matchesSchoolNode(profile, schoolObj) {
    const pSchool = (profile.school || profile.assigned_institution || '').trim().toLowerCase();
    if (!pSchool) return false;
    const cleanName = (schoolObj.schoolName || schoolObj.fullName.replace(/\s*\([^)]*\)\s*$/, '')).trim().toLowerCase();
    const fullName = (schoolObj.fullName || '').trim().toLowerCase();
    const code = (schoolObj.code || '').trim().toLowerCase();
    if (pSchool === cleanName || pSchool === fullName || pSchool === code) return true;
    // Handle Raul / Raoul spelling variation for Causing Memorial School
    if (code === 'rovcms' && pSchool.includes('causing memorial school')) return true;
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Lock active user role to admin
    sessionStorage.setItem('kandili_user_role', 'admin');

    // 2. Setup Topbar & Actions
    initAdminHeader();

    // 3. Initialize the school node filter and registry
    initSchoolFilter();
    renderManagedSchools();

    // 4. Initialize Forms & Search
    initModelAutoSelector();
    initSectionCreation();
    initFacultySearch();

    // 5. Initial Render
    loadSchoolData(currentSelectedSchool);
});

// Setup date, refresh, and logout
function initAdminHeader() {
    const dateElem = document.getElementById('adminDateDisplay');
    if (dateElem) {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateElem.innerHTML = `<i class="far fa-calendar-alt"></i> ${now.toLocaleDateString('en-US', options)}`;
    }

    document.getElementById('navRefreshBtn')?.addEventListener('click', () => {
        window.location.reload();
    });

    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof kandiliLogout === 'function') {
            kandiliLogout();
        } else if (confirm('Log out of the Superadmin Console?')) {
            window.location.href = '../login.html';
        }
    });
}

// 1. School node filter and registry
function initSchoolFilter() {
    const schoolFilter = document.getElementById('adminSchoolFilter');
    schoolFilter?.addEventListener('change', () => {
        const schoolKey = schoolFilter.value;
        if (schoolKey === 'all') {
            loadAllSchoolsConsolidated();
            return;
        }
        if (!schoolData[schoolKey]) return;

        currentSelectedSchool = schoolKey;
        loadSchoolData(schoolKey);
    });
}

function renderManagedSchools() {
    if (typeof renderAdminSchoolNodes === 'function') {
        renderAdminSchoolNodes();
        return;
    }

    const schoolsTable = document.getElementById('adminSchoolsTableBody');
    if (!schoolsTable) return;

    schoolsTable.innerHTML = Object.values(schoolData).map(school => `
        <tr>
            <td><strong>${school.code}</strong> — ${school.fullName}</td>
            <td>${school.schoolId}</td>
            <td>${school.location.split(',')[0]}</td>
            <td><span class="badge-status-active">Managed</span></td>
        </tr>
    `).join('');
}

// 2. Load School Profile, Demographics, Sections & Live Supabase Faculty
async function loadSchoolData(schoolKey) {
    const data = schoolData[schoolKey];
    if (!data) return;
    currentSelectedSchool = schoolKey;

    const schoolFilter = document.getElementById('adminSchoolFilter');
    if (schoolFilter && schoolFilter.value !== 'all') schoolFilter.value = schoolKey;

    // Header Demographics
    const titleEl = document.getElementById('currentSchoolTitle');
    const locEl = document.getElementById('currentSchoolLocation');
    const princEl = document.getElementById('currentSchoolPrincipal');

    if (titleEl) titleEl.textContent = data.fullName;
    if (locEl) {
        const icon = document.createElement('i');
        icon.className = 'fas fa-location-dot';
        const schoolId = document.createElement('strong');
        schoolId.textContent = data.schoolId;
        locEl.replaceChildren(
            icon,
            document.createTextNode(` ${data.location} • School ID: `),
            schoolId
        );
    }

    const learnersEl = document.getElementById('demoLearners');
    const facultyEl = document.getElementById('demoFaculty');
    const priSecEl = document.getElementById('demoPrimarySec');
    const intSecEl = document.getElementById('demoIntermediateSec');

    // No learners table exists -> always display 0
    if (learnersEl) learnersEl.textContent = '0';
    if (facultyEl) facultyEl.textContent = '0';
    if (princEl) princEl.textContent = 'Loading...';

    // Compute primary (Grades 1-3) and intermediate (Grades 4-6) section counts dynamically
    const sections = data.sections || [];
    const primaryCount = sections.filter(s => /Grade\s*[1-3]/i.test(s.grade)).length;
    const intermediateCount = sections.filter(s => /Grade\s*[4-6]/i.test(s.grade)).length;
    if (priSecEl) priSecEl.textContent = String(primaryCount);
    if (intSecEl) intSecEl.textContent = String(intermediateCount);

    // Update labels in forms and sections
    document.querySelectorAll('.activeSchoolCodeLabel').forEach(el => {
        el.textContent = data.code;
    });

    // Populate Sections Table
    const secTable = document.getElementById('sectionsTableBody');
    if (secTable) {
        if (sections.length === 0) {
            secTable.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:1.5rem;">No sections registered for this school node.</td></tr>`;
        } else {
            secTable.innerHTML = sections.map(s => `
                <tr>
                    <td><strong>${s.grade}</strong></td>
                    <td>${s.name}</td>
                    <td><span class="badge-status-active">${s.model}</span></td>
                </tr>
            `).join('');
        }
    }

    // Fetch live faculty count, roster, and assigned principal from Supabase
    let liveFaculty = [];
    let assignedPrincipal = 'Not assigned';
    if (window.supabaseClient) {
        try {
            const { data: profiles, error } = await window.supabaseClient
                .from('profiles')
                .select('id, first_name, last_name, role, school, assigned_institution, teacher_code, grade_level, department, advisory_class')
                .in('role', ['teacher', 'principal']);

            if (!error && Array.isArray(profiles)) {
                const schoolTeachers = profiles.filter(p => (p.role || '').toLowerCase() === 'teacher' && matchesSchoolNode(p, data));
                const schoolPrincipal = profiles.find(p => (p.role || '').toLowerCase() === 'principal' && matchesSchoolNode(p, data));

                if (schoolPrincipal) {
                    assignedPrincipal = [schoolPrincipal.first_name, schoolPrincipal.last_name].filter(Boolean).join(' ').trim() || 'Not assigned';
                }

                liveFaculty = schoolTeachers.map((t, idx) => {
                    const grade = t.advisory_class || t.grade_level || t.department || 'Unassigned';
                    const isPrimary = /Grade\s*[1-3]/i.test(grade);
                    return {
                        code: t.teacher_code || `TCH-${String(idx + 1).padStart(3, '0')}`,
                        name: [t.first_name, t.last_name].filter(Boolean).join(' ').trim() || 'Faculty Member',
                        grade,
                        model: isPrimary ? 'Self-Contained' : 'Departmentalized'
                    };
                });
            }
        } catch (err) {
            console.error('Error loading live school node stats:', err);
        }
    }

    currentLiveFaculty = liveFaculty;
    if (facultyEl) facultyEl.textContent = String(liveFaculty.length);
    if (princEl) princEl.textContent = assignedPrincipal;

    // Populate Faculty Roster Table
    renderFacultyTable(liveFaculty);
}

// Consolidated View for "All District Schools"
async function loadAllSchoolsConsolidated() {
    const titleEl = document.getElementById('currentSchoolTitle');
    const locEl = document.getElementById('currentSchoolLocation');
    const princEl = document.getElementById('currentSchoolPrincipal');
    const learnersEl = document.getElementById('demoLearners');
    const facultyEl = document.getElementById('demoFaculty');
    const priSecEl = document.getElementById('demoPrimarySec');
    const intSecEl = document.getElementById('demoIntermediateSec');

    if (titleEl) titleEl.textContent = 'All District Schools (Consolidated)';
    if (locEl) locEl.innerHTML = `<i class="fas fa-location-dot"></i> DepEd Division Cluster &bull; ${Object.keys(schoolData).length} Registered School Nodes`;
    if (princEl) princEl.textContent = 'Division Wide';
    if (learnersEl) learnersEl.textContent = '0';

    const allSections = Object.values(schoolData).flatMap(s => s.sections || []);
    if (priSecEl) priSecEl.textContent = String(allSections.filter(s => /Grade\s*[1-3]/i.test(s.grade)).length);
    if (intSecEl) intSecEl.textContent = String(allSections.filter(s => /Grade\s*[4-6]/i.test(s.grade)).length);

    document.querySelectorAll('.activeSchoolCodeLabel').forEach(el => {
        el.textContent = 'ALL';
    });

    let liveFaculty = [];
    if (window.supabaseClient) {
        try {
            const { data: teachers, error } = await window.supabaseClient
                .from('profiles')
                .select('id, first_name, last_name, role, school, teacher_code, grade_level, department, advisory_class')
                .eq('role', 'teacher');

            if (!error && Array.isArray(teachers)) {
                liveFaculty = teachers.map((t, idx) => {
                    const grade = t.advisory_class || t.grade_level || t.department || 'Unassigned';
                    const isPrimary = /Grade\s*[1-3]/i.test(grade);
                    return {
                        code: t.teacher_code || `TCH-${String(idx + 1).padStart(3, '0')}`,
                        name: [t.first_name, t.last_name].filter(Boolean).join(' ').trim() || 'Faculty Member',
                        grade,
                        model: isPrimary ? 'Self-Contained' : 'Departmentalized'
                    };
                });
            }
        } catch (err) {
            console.error('Error loading consolidated faculty:', err);
        }
    }

    currentLiveFaculty = liveFaculty;
    if (facultyEl) facultyEl.textContent = String(liveFaculty.length);
    renderFacultyTable(liveFaculty);
}

function renderFacultyTable(facultyList) {
    const facTable = document.getElementById('schoolFacultyTableBody');
    if (!facTable) return;

    if (!facultyList || facultyList.length === 0) {
        facTable.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 1.5rem;">No faculty registered for this school node.</td></tr>`;
        return;
    }

    facTable.innerHTML = facultyList.map(f => `
        <tr>
            <td><strong>${f.code}</strong></td>
            <td>${f.name}</td>
            <td>${f.grade}</td>
            <td>${f.model}</td>
            <td><span class="badge-status-active">Verified</span></td>
        </tr>
    `).join('');
}

// 3. Auto-Select Model (Grades 1-3 vs 4-6)
function initModelAutoSelector() {
    const gradeSelect = document.getElementById('secGrade');
    const modelInput = document.getElementById('secModel');

    gradeSelect?.addEventListener('change', () => {
        const val = gradeSelect.value;
        if (val.includes('Grade 1') || val.includes('Grade 2') || val.includes('Grade 3')) {
            modelInput.value = 'Self-Contained Advisory (Single Class)';
        } else {
            modelInput.value = 'Departmentalized Delivery (Multi-Subject)';
        }
    });
}

// 4. Add Section to Current School
function initSectionCreation() {
    const form = document.getElementById('createSectionForm');
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const grade = document.getElementById('secGrade').value;
        const name = document.getElementById('secName').value.trim();
        const model = document.getElementById('secModel').value;

        if (!name || !schoolData[currentSelectedSchool]) return;

        schoolData[currentSelectedSchool].sections.unshift({
            grade,
            name,
            model
        });

        alert(`Section "${name}" added to ${currentSelectedSchool}!`);
        form.reset();
        document.getElementById('secModel').value = 'Self-Contained Advisory (Single Class)';
        loadSchoolData(currentSelectedSchool);
    });
}

// 5. Faculty Filter Search
function initFacultySearch() {
    const input = document.getElementById('facultySearchInput');
    input?.addEventListener('input', () => {
        const query = (input.value || '').toLowerCase().trim();
        const allFaculty = currentLiveFaculty || [];
        
        const filtered = allFaculty.filter(f => 
            f.name.toLowerCase().includes(query) || 
            f.code.toLowerCase().includes(query) ||
            f.grade.toLowerCase().includes(query)
        );

        renderFacultyTable(filtered);
    });
}
