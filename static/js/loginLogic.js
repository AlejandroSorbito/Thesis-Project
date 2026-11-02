// static/loginLogic.js

const loginForm = document.getElementById('loginForm');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const roleSelect = document.getElementById('role');
    const selectedDashboard = roleSelect ? (
        roleSelect.value.includes('/') 
            ? (roleSelect.options[roleSelect.selectedIndex]?.text || '') 
            : roleSelect.value
    ) : '';

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        console.error("Login failed:", error.message);
        alert("Error: " + error.message);
        return;
    }

    // Pull verified profile information from security environment
    const { data: profile, error: profileError } = await window.supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

    if (profileError || !profile) {
        console.error("Could not load profile:", profileError ? profileError.message : "no profile row found");
        alert("Login succeeded, but we couldn't find your profile. Please contact an administrator.");
        return;
    }

    const normalizedRole = (profile.role || '').trim().toLowerCase();
    sessionStorage.setItem('kandili_user_role', normalizedRole);

    let targetDashboard = null;
    if (normalizedRole === 'admin') {
        targetDashboard = '../admin/admindashboard.html';
    } else if (normalizedRole === 'principal') {
        targetDashboard = '../principal/principaldashboard.html';
    } else if (normalizedRole === 'teacher') {
        targetDashboard = '../teacher/teacherdashboard.html';
    } else {
        console.error("Unknown or unauthorized user role:", profile.role);
        alert("Unauthorized role. Please contact an administrator.");
        await window.supabaseClient.auth.signOut();
        return;
    }

    // STRICT CROSS-VERIFICATION VALIDATION
    const normalizedSelection = (selectedDashboard || '').trim().toLowerCase();
    if (normalizedSelection && normalizedSelection !== normalizedRole) {
        console.warn(`Role Mismatch: Selected "${normalizedSelection}" but database dictates "${normalizedRole}".`);
        alert("Login Error: The selected role does not match your authorized account profile details.");
        await window.supabaseClient.auth.signOut();
        return;
    }

    console.log("Login verified successfully! Redirecting to authorized domain.");
    window.location.href = targetDashboard;
});