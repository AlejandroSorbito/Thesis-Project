// static/js/forgotPasswordLogic.js

document.addEventListener('DOMContentLoaded', () => {
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (!forgotPasswordForm) return;

    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById('resetEmail');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email) {
            alert("Please enter your email address.");
            return;
        }

        if (!window.supabaseClient) {
            alert("Authentication service is temporarily unavailable. Please reload the page.");
            return;
        }

        const submitBtn = forgotPasswordForm.querySelector('button[type="submit"]');
        const originalBtnContent = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Sending...</span> <i class="fas fa-spinner fa-spin" style="margin-left: 8px;"></i>`;
        }

        try {
            const redirectUrl = window.location.origin + '/kandili/general/passwordsetup.html';
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: redirectUrl
            });

            if (error) {
                console.error("Password reset error:", error.message);
                alert("Error: " + error.message);
                return;
            }

            alert("Password reset link sent! Please check your email.");
            window.location.href = 'login.html';
        } catch (err) {
            console.error("Unexpected error in password reset:", err);
            alert("An unexpected error occurred: " + (err.message || err));
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
            }
        }
    });
});

