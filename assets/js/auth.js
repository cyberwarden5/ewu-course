// ========================================
// Authentication JavaScript with Intelligent Retry
// Wrapped in an IIFE to avoid leaking top-level globals.
// ========================================

(() => {
// **IMPORTANT:** Update this to your actual Worker API domain
const API_BASE_URL = 'https://api.aftabkabir.me';

// Initialize retry handler
const retryHandler = new RetryHandler();

// Toggle password visibility
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const passwordIcon = document.getElementById('passwordIcon');
    if (!passwordInput) return;
    
    const isPass = passwordInput.type === 'password';
    passwordInput.type = isPass ? 'text' : 'password';
    if (passwordIcon) {
        if (isPass) {
            passwordIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        } else {
            passwordIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        }
    }
}

// Show alert
function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('alertBox');
    const alertIcon = document.getElementById('alertIcon');
    const alertMessage = document.getElementById('alertMessage');

    if (!alertBox || !alertIcon || !alertMessage) return;

    alertBox.classList.remove('hidden', 'alert-error', 'alert-success', 'alert-info');

    if (type === 'error') {
        alertBox.classList.add('alert-error');
        alertIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else if (type === 'success') {
        alertBox.classList.add('alert-success');
        alertIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else {
        alertBox.classList.add('alert-info');
        alertIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D86C5A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0 pulse-effect"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    alertMessage.textContent = message;
}

// Login attempt function (will be wrapped with retry logic)
async function attemptLogin(username, password) {
    let response;
    let data;

    try {
        response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                username: (username || '').trim(),
                password: password
            })
        });

        data = await response.json();
    } catch (err) {
        // Network timeout / connection error - throw to trigger immediate retry
        throw new Error('Connection to portal failed. Retrying...');
    }

    const statusCode = response ? response.status : 500;
    const errorMsg = (data && (data.message || data.error)) ? (data.message || data.error) : '';
    const lowerMsg = errorMsg.toLowerCase();

    // ONLY TWO TERMINAL CASES STOP THE AUTO RETRY:
    // Case 1: Incorrect username or password
    const isIncorrectCredentials = 
        (lowerMsg.includes('username') || lowerMsg.includes('password') || lowerMsg.includes('credential')) &&
        (lowerMsg.includes('incorrect') || lowerMsg.includes('wrong') || lowerMsg.includes('invalid password') || lowerMsg.includes('invalid username'));

    // Case 2: User ID blocked by admin
    const isBlocked = 
        statusCode === 403 || 
        lowerMsg.includes('restricted from logging in') || 
        lowerMsg.includes('account has been restricted') || 
        lowerMsg.includes('account has been blocked') ||
        lowerMsg.includes('blocked');

    if (isIncorrectCredentials || isBlocked) {
        return { 
            status: 'invalid_credentials', 
            message: errorMsg || (isBlocked ? 'Your account has been restricted from logging in.' : 'Username or password is incorrect')
        };
    }

    // Check for success
    if (data && (data.status === 'success' || data.userId)) {
        return { 
            status: 'success', 
            data: data 
        };
    }

    // ALL OTHER CASES (Advising is ongoing, Invalid answer/captcha, 500, portal busy, unknown response)
    // -> Throw to trigger automatic next attempt
    throw new Error(errorMsg || 'Login attempt failed. Retrying...');
}

// Handle form submission
document.getElementById('loginForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn && loginBtn.disabled) return;

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const btnText = document.getElementById('btnText');

    // Validation
    if (!username || !password) {
        showAlert('Please enter both student ID and password', 'error');
        return;
    }

    // Disable button and show loading
    loginBtn.disabled = true;
    loginBtn.classList.add('opacity-75', 'cursor-not-allowed');
    const btnIconWrapper = document.getElementById('btnIconWrapper');
    const defaultSignInIcon = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>';
    const spinnerIcon = '<svg class="animate-spin h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    const checkIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    if (btnIconWrapper) btnIconWrapper.innerHTML = spinnerIcon;
    btnText.textContent = 'Signing in...';

    // Use retry handler for login
    await retryHandler.executeWithRetry(
        () => attemptLogin(username, password),
        {
            operationName: 'Login',
            retryDelay: 1000,
            onSuccess: (result) => {
                const sId = (result?.data?.userId && result.data.userId !== 'User') ? result.data.userId : username;
                try {
                    localStorage.setItem('studentId', sId);
                    localStorage.setItem('ewu_student_id', sId);
                } catch (e) {
                    console.warn('Unable to persist student ID:', e);
                }
                showAlert('Login successful! Redirecting...', 'success');
                if (btnIconWrapper) btnIconWrapper.innerHTML = checkIcon;
                btnText.textContent = 'Redirecting...';
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 800);
            },
            onInvalidCredentials: (result) => {
                showAlert(result.message || 'Invalid credentials. Please check your student ID and password.', 'error');
                loginBtn.disabled = false;
                loginBtn.classList.remove('opacity-75', 'cursor-not-allowed');
                if (btnIconWrapper) btnIconWrapper.innerHTML = defaultSignInIcon;
                btnText.textContent = 'Sign In';
            },
            onRetryAttempt: (attemptNum, elapsedTime, errorReason) => {
                console.log(`Login attempt ${attemptNum} failed. Elapsed time: ${elapsedTime}s. Reason: ${errorReason}`);
                showAlert(`${errorReason || 'Portal busy'}. Retrying automatically... (Attempt ${attemptNum + 1})`, 'info');
                if (btnIconWrapper) btnIconWrapper.innerHTML = spinnerIcon;
                btnText.textContent = `Retrying (Attempt ${attemptNum + 1})...`;
            },
            onStop: () => {
                loginBtn.disabled = false;
                loginBtn.classList.remove('opacity-75', 'cursor-not-allowed');
                if (btnIconWrapper) btnIconWrapper.innerHTML = defaultSignInIcon;
                btnText.textContent = 'Sign In';
                showAlert('Login process stopped.', 'info');
            }
        }
    );
});

// Auto-focus username field
document.getElementById('username')?.focus();

// Enter key support
document.getElementById('password')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn && loginBtn.disabled) {
            e.preventDefault();
            return;
        }
    }
});

// Expose inline-handler functions on window
window.togglePassword = togglePassword;
window.showAlert = showAlert;
})();

