// Authentication JavaScript - Login and Registration

document.addEventListener('DOMContentLoaded', function () {

    /* ================= REGISTER ================= */

    var registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegistration);
    }

    /* ================= LOGIN ================= */

    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    /* Show hint when redirected from File a Claim or Check Status */
    var nextHint = document.getElementById('loginNextHint');
    var registerLink = document.getElementById('registerLink');
    if (nextHint || registerLink) {
        try {
            var params = new URLSearchParams(window.location.search);
            var next = params.get('next');
            if (next) {
                if (nextHint) {
                    nextHint.style.display = 'block';
                    if (next.indexOf('file-claim') !== -1) {
                        nextHint.textContent = 'Please login (or register) to file a new claim.';
                    } else if (next.indexOf('claim-status') !== -1) {
                        nextHint.textContent = 'Please login (or register) to check your claim status.';
                    } else {
                        nextHint.textContent = 'Please login to continue.';
                    }
                }
                if (registerLink && registerLink.getAttribute('href') === 'register.html') {
                    registerLink.setAttribute('href', 'register.html?next=' + encodeURIComponent(next));
                }
            }
        } catch (e) {}
    }
});

/* ================= REGISTER HANDLER ================= */

function handleRegistration(e) {
    e.preventDefault();

    clearAllErrors();

    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const mobile = document.getElementById('registerMobile').value.trim();
    const policyNumber = document.getElementById('registerPolicy').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const termsChecked = document.getElementById('termsCheck').checked;

    let isValid = true;

    if (!validateName(name)) isValid = false;
    if (!validateEmail(email)) isValid = false;
    if (!validateMobile(mobile)) isValid = false;
    if (!validatePolicy(policyNumber)) isValid = false;
    if (!validatePassword(password)) isValid = false;
    if (!validateConfirmPassword(confirmPassword, password)) isValid = false;

    if (!termsChecked) {
        alert('Please accept Terms & Privacy Policy');
        isValid = false;
    }

    if (!isValid) return;

    const rawUsers = JSON.parse(localStorage.getItem('users') || '[]');
    const users = Array.isArray(rawUsers) ? rawUsers : [];
    const emailNormalized = email.toLowerCase().trim();

    const existingUser = users.find(function (u) {
        if (!u || typeof u.email !== 'string') return false;
        return u.email.toLowerCase().trim() === emailNormalized;
    });
    if (existingUser) {
        showError('emailError', 'Email already registered');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';
    }

    function doLocalRegister() {
        try {
            users.push({ name, email: emailNormalized, mobile, policyNumber, password });
            localStorage.setItem('users', JSON.stringify(users));
            var nextParam = '';
            try {
                var p = new URLSearchParams(window.location.search);
                var n = p.get('next');
                if (n) nextParam = '?next=' + encodeURIComponent(n);
            } catch (e) {}
            alert('Account created successfully! You will be redirected to login.');
            window.location.replace('login.html' + nextParam);
        } catch (err) {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account'; }
            alert('Something went wrong. Please try again.');
        }
    }

    if (window.MediClaimAPI && window.MediClaimAPI.users) {
        window.MediClaimAPI.users.register({ name, email: emailNormalized, mobile, policyNumber, password })
            .then(function () {
                // Keep a local copy so login still works if API is unavailable later.
                upsertLocalUser({ name: name, email: emailNormalized, mobile: mobile, policyNumber: policyNumber, password: password });
                var nextParam = '';
                try {
                    var p = new URLSearchParams(window.location.search);
                    var n = p.get('next');
                    if (n) nextParam = '?next=' + encodeURIComponent(n);
                } catch (e) {}
                alert('Account created successfully! You will be redirected to login.');
                window.location.replace('login.html' + nextParam);
            })
            .catch(function (err) {
                var msg = (err && err.data && err.data.error) ? err.data.error : (err && err.message) ? err.message : '';
                if (msg && msg.toLowerCase().indexOf('already registered') !== -1) {
                    showError('emailError', 'Email already registered');
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account'; }
                    return;
                }
                doLocalRegister();
            });
    } else {
        doLocalRegister();
    }
}

/* ================= LOGIN HANDLER ================= */

function handleLogin(e) {
    e.preventDefault();

    var emailEl = document.getElementById('loginEmail');
    var passwordEl = document.getElementById('loginPassword');
    if (!emailEl || !passwordEl) return;

    clearAllErrors();

    var email = emailEl.value.trim();
    var password = passwordEl.value;

    if (!validateEmail(email)) {
        return;
    }
    if (!password) {
        showError('passwordError', 'Enter your password');
        return;
    }

    function getLocalUserIfValid() {
        var rawUsers = JSON.parse(localStorage.getItem('users') || '[]');
        var users = Array.isArray(rawUsers) ? rawUsers : [];
        var emailNormalized = email.toLowerCase();
        return users.find(function (u) {
            if (!u || typeof u.email !== 'string') return false;
            return u.email.toLowerCase().trim() === emailNormalized && u.password === password;
        });
    }

    function completeLoginWithUser(user) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('user', JSON.stringify({
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            policyNumber: user.policyNumber
        }));
        var nextUrl = getLoginNextUrl();
        alert('Login successful! Redirecting...');
        window.location.replace(nextUrl);
    }

    function doLocalLogin(customInvalidMessage) {
        var user = getLocalUserIfValid();
        if (!user) {
            alert(customInvalidMessage || 'Invalid email or password');
            return;
        }
        completeLoginWithUser(user);
    }

    if (window.MediClaimAPI && window.MediClaimAPI.users) {
        window.MediClaimAPI.users.login(email, password)
            .then(function (res) {
                if (res && res.user) {
                    upsertLocalUser({
                        name: res.user.name || '',
                        email: (res.user.email || email).toLowerCase().trim(),
                        mobile: res.user.mobile || '',
                        policyNumber: res.user.policyNumber || '',
                        password: password
                    });
                    completeLoginWithUser({
                        name: res.user.name,
                        email: res.user.email,
                        mobile: res.user.mobile || '',
                        policyNumber: res.user.policyNumber || ''
                    });
                } else {
                    doLocalLogin();
                }
            })
            .catch(function (err) {
                // If backend says invalid credentials, allow local fallback.
                if (err && err.status === 401) {
                    doLocalLogin();
                    return;
                }

                // For API/network issues, avoid misleading "Invalid email or password" message.
                var localUser = getLocalUserIfValid();
                if (localUser) {
                    completeLoginWithUser(localUser);
                    return;
                }

                alert('Login service is unavailable (backend not running). Start API server and try again.');
            });
    } else {
        doLocalLogin();
    }
}

function getLoginNextUrl() {
    try {
        var params = new URLSearchParams(window.location.search);
        var next = params.get('next');
        if (next && typeof next === 'string' && next.length > 0) {
            return next.indexOf('.html') !== -1 ? next : next + '.html';
        }
    } catch (e) {}
    return 'dashboard.html';
}

/* ================= VALIDATIONS ================= */

function validateName(value) {
    if (value.length < 2) {
        showError('nameError', 'Enter full name');
        return false;
    }
    return true;
}

function validateEmail(value) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(value)) {
        showError('emailError', 'Enter valid email');
        return false;
    }
    return true;
}

function validateMobile(value) {
    if (!/^[0-9]{10}$/.test(value)) {
        showError('mobileError', 'Enter 10 digit mobile');
        return false;
    }
    return true;
}

function validatePolicy(value) {
    if (value.length < 5) {
        showError('policyError', 'Invalid policy number');
        return false;
    }
    return true;
}

function validatePassword(value) {
    if (value.length < 8) {
        showError('passwordError', 'Min 8 characters');
        return false;
    }
    return true;
}

function validateConfirmPassword(confirm, password) {
    if (confirm !== password) {
        showError('confirmPasswordError', 'Passwords do not match');
        return false;
    }
    return true;
}

/* ================= HELPERS ================= */

function showError(id, message) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    }
}

function clearAllErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
}

function showNotification(message, type = 'success') {
    if (window.showNotification) {
        window.showNotification(message, type);
    } else {
        alert(message);
    }
}

function upsertLocalUser(userData) {
    var rawUsers = JSON.parse(localStorage.getItem('users') || '[]');
    var users = Array.isArray(rawUsers) ? rawUsers : [];
    var emailKey = (userData.email || '').toLowerCase().trim();
    if (!emailKey) return;

    var idx = users.findIndex(function (u) {
        return u && typeof u.email === 'string' && u.email.toLowerCase().trim() === emailKey;
    });

    var user = {
        name: userData.name || '',
        email: emailKey,
        mobile: userData.mobile || '',
        policyNumber: userData.policyNumber || '',
        password: userData.password || ''
    };

    if (idx >= 0) users[idx] = Object.assign({}, users[idx], user);
    else users.push(user);

    localStorage.setItem('users', JSON.stringify(users));
}
