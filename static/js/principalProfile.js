// static/js/principalProfile.js

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Guard Verification
    if (typeof checkAuthAndRole === 'function') {
        checkAuthAndRole('principal');
    }

    if (!window.supabaseClient) {
        console.error("Supabase client not loaded.");
        return;
    }

    // 2. Fetch logged-in user session
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session || !session.user) {
        console.warn("No active session found for principal profile.");
        return;
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // Cache user role in sessionStorage
    sessionStorage.setItem('kandili_user_role', 'principal');

    // 3. Query profiles table for CURRENTLY logged-in user
    let currentProfile = null;
    async function loadPrincipalProfile() {
        try {
            const { data: profile, error } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error("Error loading principal profile:", error.message);
                return;
            }

            currentProfile = profile;

            // Full Name
            const fullNameEl = document.getElementById('displayFullName');
            if (fullNameEl) {
                const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                fullNameEl.textContent = name || 'Principal';
            }

            // Role / Title
            const roleEl = document.getElementById('displayRoleTitle');
            if (roleEl) {
                const roleCapitalized = profile.role 
                    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) 
                    : 'Principal';
                roleEl.innerHTML = `${roleCapitalized} II &bull; School Head`;
            }

            // Email
            const emailEl = document.getElementById('displayEmail');
            if (emailEl) {
                emailEl.textContent = userEmail || profile.email || 'Not set';
            }

            // Employment Stats
            const empIdEl = document.getElementById('displayEmployeeId');
            if (empIdEl) empIdEl.textContent = profile.deped_employee_id || profile.teacher_code || 'Not set';

            const plantillaEl = document.getElementById('displayPlantilla');
            if (plantillaEl) plantillaEl.textContent = profile.plantilla_item_no || 'Not set';

            const prcEl = document.getElementById('displayPrcLicense');
            if (prcEl) prcEl.textContent = profile.prc_license_no || 'Not set';

            const yearsEl = document.getElementById('displayYearsService');
            if (yearsEl) {
                yearsEl.textContent = profile.years_in_service !== null && profile.years_in_service !== undefined 
                    ? `${profile.years_in_service} Years` 
                    : 'Not set';
            }

            // Administrative Information
            const institutionEl = document.getElementById('displayInstitution');
            if (institutionEl) {
                institutionEl.textContent = profile.assigned_institution || profile.school || 'Not set';
            }

            const officeEl = document.getElementById('displayOfficeAddress');
            if (officeEl) {
                officeEl.textContent = profile.office_address || 
                    (profile.school ? `Office of the Principal, ${profile.school}` : 
                    (profile.assigned_institution ? `Office of the Principal, ${profile.assigned_institution}` : 'Not set'));
            }

            const degreeEl = document.getElementById('displayDegree');
            if (degreeEl) degreeEl.textContent = profile.educational_attainment || 'Not set';

            const contactEl = document.getElementById('displayContact');
            if (contactEl) contactEl.textContent = profile.contact_number || 'Not set';

            // Avatar Image
            const avatarImg = document.getElementById('profileImageDisplay');
            if (avatarImg) {
                if (profile.avatar_url) {
                    avatarImg.src = profile.avatar_url;
                } else {
                    const initialsName = `${profile.first_name || 'Principal'} ${profile.last_name || ''}`.trim();
                    avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(initialsName)}&background=0038A8&color=fff&size=128`;
                }
            }

            // Populate Edit Form Inputs
            const editName = document.getElementById('editFullName');
            if (editName) editName.value = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

            const editRole = document.getElementById('editRoleTitle');
            if (editRole) {
                editRole.value = profile.role 
                    ? (profile.role.charAt(0).toUpperCase() + profile.role.slice(1) + ' II • School Head') 
                    : 'Principal II • School Head';
            }

            const editEmail = document.getElementById('editEmail');
            if (editEmail) editEmail.value = userEmail || profile.email || '';

            const editContact = document.getElementById('editContact');
            if (editContact) editContact.value = profile.contact_number || '';

            const editDegree = document.getElementById('editDegree');
            if (editDegree) editDegree.value = profile.educational_attainment || '';

        } catch (err) {
            console.error("Error in loadPrincipalProfile:", err);
        }
    }

    await loadPrincipalProfile();

    // 4. Modal Handlers
    const editModal = document.getElementById('editProfileModal');
    const openEditBtn = document.getElementById('editProfileBtn');
    const closeEditBtn = document.getElementById('closeEditModalBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const editForm = document.getElementById('editProfileForm');

    const toggleModal = (show) => {
        if (!editModal) return;
        if (show) {
            editModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            editModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    openEditBtn?.addEventListener('click', () => toggleModal(true));
    closeEditBtn?.addEventListener('click', () => toggleModal(false));
    cancelEditBtn?.addEventListener('click', () => toggleModal(false));
    editModal?.addEventListener('click', (e) => {
        if (e.target === editModal) toggleModal(false);
    });

    // 5. Handle Form Submission to Supabase
    editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullNames = (document.getElementById('editFullName')?.value || '').trim().split(' ');
        const firstName = fullNames[0] || '';
        const lastName = fullNames.slice(1).join(' ') || '';
        const contact = document.getElementById('editContact')?.value || '';
        const degree = document.getElementById('editDegree')?.value || '';

        const submitBtn = editForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
        }

        try {
            const { error: updateError } = await window.supabaseClient
                .from('profiles')
                .update({
                    first_name: firstName,
                    last_name: lastName,
                    contact_number: contact,
                    educational_attainment: degree
                })
                .eq('id', userId);

            if (updateError) throw updateError;

            await loadPrincipalProfile();
            toggleModal(false);
            alert("Profile updated successfully!");
        } catch (err) {
            console.error("Failed to update profile:", err);
            alert("Update failed: " + (err.message || err));
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-save"></i> Save Changes`;
            }
        }
    });

    // 6. Photo Picker Handler
    const photoInput = document.getElementById('avatarFileInput');
    const openPhotoBtn = document.getElementById('updatePhotoBtn');
    const badgePhotoBtn = document.getElementById('avatarBadgeBtn');
    const imageDisplay = document.getElementById('profileImageDisplay');

    const triggerPhotoPicker = () => photoInput?.click();
    openPhotoBtn?.addEventListener('click', triggerPhotoPicker);
    badgePhotoBtn?.addEventListener('click', triggerPhotoPicker);

    photoInput?.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (imageDisplay) {
                    imageDisplay.src = e.target.result;
                }
            };
            reader.readAsDataURL(this.files[0]);
        }
    });

    // 7. Navigation Buttons
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        window.location.reload();
    });

    document.getElementById('btnReviewActivityLog')?.addEventListener('click', () => {
        window.location.href = '../general/history.html?origin=principal';
    });

    // 8. Sidebar Section Link Routing (when on profile page, navigate to dashboard sections)
    document.querySelectorAll('#appSidebar a[href^="#section-"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetHash = link.getAttribute('href');
            window.location.href = `principaldashboard.html${targetHash}`;
        });
    });

    // Highlight My Profile in sidebar
    const profileLink = document.querySelector('#appSidebar a[href="principalprofilepage.html"]');
    if (profileLink) {
        document.querySelectorAll('#appSidebar .app-sidebar-link').forEach(l => l.classList.remove('active'));
        profileLink.classList.add('active');
    }
});
