const SCHOOL_STORAGE_KEY = 'kandili_master_schools';

function getStoredSchools() {
    const stored = localStorage.getItem(SCHOOL_STORAGE_KEY);
    if (stored === null) {
        const seedSchools = [
            {
                school_id: '115204',
                school_name: 'Raul O.V. Causing Memorial School',
                short_code: 'ROVCMS',
                district: 'District II',
                division: 'Division of Iloilo Province'
            },
            {
                school_id: '115208',
                school_name: 'Lopez Jaena Elementary School',
                short_code: 'LJES',
                district: 'District I',
                division: 'Division of Iloilo Province'
            },
            {
                school_id: '115215',
                school_name: 'San Miguel Elementary School',
                short_code: 'SMES',
                district: 'District III',
                division: 'Division of Iloilo Province'
            }
        ];
        localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(seedSchools));
        return seedSchools;
    }

    try {
        const schools = JSON.parse(stored);
        if (!Array.isArray(schools) || !schools.every(school =>
            school &&
            /^\d{6}$/.test(school.school_id) &&
            typeof school.school_name === 'string' &&
            school.school_name.trim() &&
            typeof school.short_code === 'string' &&
            /^[A-Z0-9]{2,12}$/.test(school.short_code) &&
            typeof school.district === 'string' &&
            typeof school.division === 'string'
        )) {
            throw new TypeError('Stored school registry must contain valid school records.');
        }
        return schools;
    } catch (error) {
        console.error('Unable to read the stored school registry:', error);
        throw new Error('The saved school registry is invalid. Please repair or clear kandili_master_schools before continuing.');
    }
}

function syncSchoolProfiles(schools) {
    const registeredCodes = new Set(schools.map(school => school.short_code));

    Object.keys(schoolData).forEach(code => {
        if (!registeredCodes.has(code)) delete schoolData[code];
    });

    schools.forEach(school => {
        const location = `${school.district}, ${school.division}`;
        if (schoolData[school.short_code]) {
            Object.assign(schoolData[school.short_code], {
                code: school.short_code,
                schoolName: school.school_name,
                fullName: `${school.school_name} (${school.short_code})`,
                schoolId: school.school_id,
                district: school.district,
                division: school.division,
                location
            });
        } else {
            schoolData[school.short_code] = {
                code: school.short_code,
                schoolName: school.school_name,
                fullName: `${school.school_name} (${school.short_code})`,
                schoolId: school.school_id,
                district: school.district,
                division: school.division,
                location,
                principal: 'Not assigned',
                learners: '0',
                facultyCount: '0',
                primarySec: '0',
                intermediateSec: '0',
                sections: [],
                faculty: []
            };
        }
    });
}

function renderAdminSchoolNodes() {
    const schoolFilter = document.getElementById('adminSchoolFilter');
    const schoolsTable = document.getElementById('adminSchoolsTableBody');
    const schools = getStoredSchools();
    syncSchoolProfiles(schools);

    if (schoolFilter) {
        const previousSelection = schoolFilter.value;
        schoolFilter.replaceChildren();

        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All District Schools (Consolidated)';
        schoolFilter.appendChild(allOption);

        schools.forEach(school => {
            const option = document.createElement('option');
            option.value = school.short_code;
            option.textContent = `${school.short_code} — ${school.school_name}`;
            schoolFilter.appendChild(option);
        });

        if (schools.some(school => school.short_code === previousSelection)) {
            schoolFilter.value = previousSelection;
        } else if (schools.some(school => school.short_code === currentSelectedSchool)) {
            schoolFilter.value = currentSelectedSchool;
        } else {
            schoolFilter.value = schools.length ? schools[0].short_code : 'all';
        }
        schoolFilter.disabled = schools.length === 0;
    }

    if (!schoolsTable) return;
    schoolsTable.replaceChildren();

    if (schools.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'text-center';
        cell.textContent = 'No school nodes registered. Click "+ Add New School Node" to begin.';
        row.appendChild(cell);
        schoolsTable.appendChild(row);
        renderEmptySchoolDashboard();
        return;
    }

    schools.forEach(school => {
        const row = document.createElement('tr');
        [
            school.school_name,
            school.school_id,
            school.short_code,
            school.district,
            school.division
        ].forEach(value => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
        });

        const actionCell = document.createElement('td');
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'school-node-delete';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', `Remove ${school.school_name}`);
        removeButton.addEventListener('click', () => deleteSchoolNode(school.school_id));
        actionCell.appendChild(removeButton);
        row.appendChild(actionCell);
        schoolsTable.appendChild(row);
    });

    if (!schoolData[currentSelectedSchool]) {
        currentSelectedSchool = schools[0].short_code;
    }
    if (typeof loadSchoolData === 'function') {
        loadSchoolData(currentSelectedSchool);
    }
}

function renderEmptySchoolDashboard() {
    const title = document.getElementById('currentSchoolTitle');
    const location = document.getElementById('currentSchoolLocation');
    const principal = document.getElementById('currentSchoolPrincipal');
    if (title) title.textContent = 'No school node selected';
    if (location) location.textContent = 'Add a school node to view its campus details.';
    if (principal) principal.textContent = '—';

    ['demoLearners', 'demoFaculty', 'demoPrimarySec', 'demoIntermediateSec'].forEach(id => {
        const metric = document.getElementById(id);
        if (metric) metric.textContent = '0';
    });

    const sectionsTable = document.getElementById('sectionsTableBody');
    const facultyTable = document.getElementById('schoolFacultyTableBody');
    if (sectionsTable) sectionsTable.replaceChildren();
    if (facultyTable) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.className = 'text-center';
        cell.textContent = 'No faculty registered for this school node.';
        row.appendChild(cell);
        facultyTable.replaceChildren(row);
    }
}

function openSchoolModal() {
    const modal = document.getElementById('addSchoolModal');
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('newSchoolId')?.focus();
}

function closeSchoolModal() {
    const modal = document.getElementById('addSchoolModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.getElementById('openAddSchoolModalBtn')?.focus();
}

function setSchoolCodeUppercase(input) {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function saveNewSchool(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const saveButton = document.getElementById('saveSchoolBtn');
    const school = {
        school_id: document.getElementById('newSchoolId').value.trim(),
        school_name: document.getElementById('newSchoolName').value.trim(),
        short_code: document.getElementById('newShortCode').value.trim().toUpperCase(),
        district: document.getElementById('newDistrict').value.trim(),
        division: document.getElementById('newDivision').value
    };

    if (!/^\d{6}$/.test(school.school_id)) {
        alert('Enter a valid 6-digit Official DepEd School ID.');
        return;
    }
    if (!school.school_name || !school.district || !school.division) {
        alert('Complete all required school details before saving.');
        return;
    }
    if (!/^[A-Z0-9]{2,12}$/.test(school.short_code)) {
        alert('Enter an uppercase school code using 2 to 12 letters or numbers.');
        return;
    }

    let schools;
    try {
        schools = getStoredSchools();
    } catch (error) {
        alert(error.message);
        return;
    }
    const duplicate = schools.some(existing =>
        existing.school_id === school.school_id ||
        existing.short_code.toUpperCase() === school.short_code
    );
    if (duplicate) {
        alert('That School ID or Acronym / Code is already registered.');
        return;
    }

    schools.push(school);
    try {
        localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(schools));
    } catch (error) {
        console.error('Unable to persist the school registry locally:', error);
        alert('The school could not be saved to this browser. Check available storage and try again.');
        return;
    }

    schoolData[school.short_code] = {
        code: school.short_code,
        schoolName: school.school_name,
        fullName: `${school.school_name} (${school.short_code})`,
        schoolId: school.school_id,
        district: school.district,
        division: school.division,
        location: `${school.district}, ${school.division}`,
        principal: 'Not assigned',
        learners: '0',
        facultyCount: '0',
        primarySec: '0',
        intermediateSec: '0',
        sections: [],
        faculty: []
    };

    let cloudSyncError = '';
    if (window.supabaseClient && navigator.onLine) {
        if (saveButton) saveButton.disabled = true;
        try {
            const { error } = await window.supabaseClient
                .from('schools')
                .insert([school]);
            if (error) cloudSyncError = error.message;
        } catch (error) {
            cloudSyncError = error.message || 'An unexpected network error occurred.';
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    }

    currentSelectedSchool = school.short_code;
    form.reset();
    closeSchoolModal();
    renderAdminSchoolNodes();
    window.dispatchEvent(new CustomEvent('kandili:schools-updated'));

    if (cloudSyncError) {
        alert(`School node saved on this device, but Supabase synchronization failed: ${cloudSyncError}`);
    } else if (!window.supabaseClient || !navigator.onLine) {
        alert('School node saved on this device. Supabase synchronization was unavailable.');
    } else {
        alert(`School node "${school.school_name}" saved and broadcast successfully.`);
    }
}

function deleteSchoolNode(schoolId) {
    const schools = getStoredSchools();
    const school = schools.find(item => item.school_id === String(schoolId));
    if (!school) return;
    if (!confirm(`Remove ${school.school_name} (${school.short_code}) from the managed school nodes?`)) return;

    const remainingSchools = schools.filter(item => item.school_id !== String(schoolId));
    try {
        localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(remainingSchools));
    } catch (error) {
        console.error('Unable to update the stored school registry:', error);
        alert('The school node could not be removed from this browser. Check available storage and try again.');
        return;
    }

    delete schoolData[school.short_code];
    if (currentSelectedSchool === school.short_code) {
        currentSelectedSchool = remainingSchools[0]?.short_code || '';
    }
    renderAdminSchoolNodes();
    window.dispatchEvent(new CustomEvent('kandili:schools-updated'));
}

window.deleteSchoolNode = deleteSchoolNode;

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('addSchoolModal');
    const form = document.getElementById('addSchoolForm');
    const codeInput = document.getElementById('newShortCode');

    document.getElementById('openAddSchoolModalBtn')?.addEventListener('click', openSchoolModal);
    document.getElementById('cancelAddSchoolBtn')?.addEventListener('click', closeSchoolModal);
    document.getElementById('closeAddSchoolModalBtn')?.addEventListener('click', closeSchoolModal);
    modal?.addEventListener('click', event => {
        if (event.target === modal) closeSchoolModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal?.classList.contains('is-open')) closeSchoolModal();
    });
    codeInput?.addEventListener('input', () => setSchoolCodeUppercase(codeInput));
    form?.addEventListener('submit', saveNewSchool);

    try {
        renderAdminSchoolNodes();
    } catch (error) {
        console.error('Unable to initialize school nodes:', error);
        alert(error.message);
    }
});
