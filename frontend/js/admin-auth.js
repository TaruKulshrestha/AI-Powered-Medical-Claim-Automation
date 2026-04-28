// Admin login - credentials must start with MDC and match stored admin accounts

var ADMIN_STORAGE_KEY = 'adminAccounts';

document.addEventListener('DOMContentLoaded', function() {
    seedDefaultAdmins();
    setAdminRegisterLinkHref();
    checkAlreadyLoggedIn();
    var loginForm = document.getElementById('adminLoginForm');
    if (loginForm) loginForm.addEventListener('submit', handleAdminLogin);
    var registerForm = document.getElementById('adminRegisterForm');
    if (registerForm) registerForm.addEventListener('submit', handleAdminRegister);
});

function checkAlreadyLoggedIn() {
    if (localStorage.getItem('isAdminLoggedIn')) {
        window.location.replace('admin-dashboard.html');
    }
}

function setAdminRegisterLinkHref() {
    var link = document.getElementById('adminRegisterLink');
    if (!link) return;
    var path = window.location.pathname || '';
    var base = path.substring(0, path.lastIndexOf('/') + 1);
    link.href = base + 'admin-register.html';
}

function seedDefaultAdmins() {
    try {
        var raw = localStorage.getItem(ADMIN_STORAGE_KEY);
        if (raw) return;
        var defaultAdmins = [
            { adminId: 'MDC001', password: 'admin123' },
            { adminId: 'MDCadmin', password: 'admin123' }
        ];
        localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(defaultAdmins));
    } catch (e) {}
}

function getAdminAccounts() {
    try {
        var raw = localStorage.getItem(ADMIN_STORAGE_KEY);
        if (!raw) return [];
        var list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function authenticateAdmin(adminId, password) {
    var admins = getAdminAccounts();
    var idNorm = adminId.trim().toUpperCase();
    if (idNorm.indexOf('MDC') !== 0) return null;
    for (var i = 0; i < admins.length; i++) {
        var a = admins[i];
        if (a && String(a.adminId || '').trim().toUpperCase() === idNorm && String(a.password || '') === password) {
            return a;
        }
    }
    return null;
}

function handleAdminLogin(e) {
    e.preventDefault();

    var adminIdEl = document.getElementById('adminId');
    var adminPasswordEl = document.getElementById('adminPassword');
    var adminIdErrorEl = document.getElementById('adminIdError');
    var adminPasswordErrorEl = document.getElementById('adminPasswordError');

    if (!adminIdEl || !adminPasswordEl) return;

    adminIdErrorEl.textContent = '';
    adminIdErrorEl.style.display = 'none';
    adminPasswordErrorEl.textContent = '';
    adminPasswordErrorEl.style.display = 'none';

    var adminId = adminIdEl.value.trim();
    var password = adminPasswordEl.value;

    if (!adminId) {
        adminIdErrorEl.textContent = 'Enter your Admin ID';
        adminIdErrorEl.style.display = 'block';
        return;
    }
    if (adminId.toUpperCase().indexOf('MDC') !== 0) {
        adminIdErrorEl.textContent = 'Admin ID must start with MDC';
        adminIdErrorEl.style.display = 'block';
        return;
    }
    if (!password) {
        adminPasswordErrorEl.textContent = 'Enter your password';
        adminPasswordErrorEl.style.display = 'block';
        return;
    }

    function doLocalAdminLogin() {
        var admin = authenticateAdmin(adminId, password);
        if (!admin) {
            adminPasswordErrorEl.textContent = 'Invalid Admin ID or password';
            adminPasswordErrorEl.style.display = 'block';
            return;
        }
        localStorage.setItem('isAdminLoggedIn', 'true');
        localStorage.setItem('adminUser', JSON.stringify({ adminId: (admin.adminId || adminId).trim() }));
        alert('Admin login successful. Redirecting to dashboard.');
        window.location.replace('admin-dashboard.html');
    }

    if (window.MediClaimAPI && window.MediClaimAPI.admin) {
        window.MediClaimAPI.admin.login(adminId, password)
            .then(function (res) {
                if (res && res.admin) {
                    localStorage.setItem('isAdminLoggedIn', 'true');
                    localStorage.setItem('adminUser', JSON.stringify({ adminId: res.admin.adminId || adminId }));
                    alert('Admin login successful. Redirecting to dashboard.');
                    window.location.replace('admin-dashboard.html');
                } else {
                    doLocalAdminLogin();
                }
            })
            .catch(function () {
                doLocalAdminLogin();
            });
    } else {
        doLocalAdminLogin();
    }
}

function handleAdminRegister(e) {
    e.preventDefault();

    var adminIdEl = document.getElementById('regAdminId');
    var passwordEl = document.getElementById('regAdminPassword');
    var confirmEl = document.getElementById('regAdminConfirmPassword');
    var idErrorEl = document.getElementById('regAdminIdError');
    var passwordErrorEl = document.getElementById('regAdminPasswordError');
    var confirmErrorEl = document.getElementById('regAdminConfirmPasswordError');

    if (!adminIdEl || !passwordEl || !confirmEl) return;

    idErrorEl.textContent = '';
    idErrorEl.style.display = 'none';
    passwordErrorEl.textContent = '';
    passwordErrorEl.style.display = 'none';
    confirmErrorEl.textContent = '';
    confirmErrorEl.style.display = 'none';

    var adminId = adminIdEl.value.trim();
    var password = passwordEl.value;
    var confirmPassword = confirmEl.value;

    var isValid = true;

    if (!adminId) {
        idErrorEl.textContent = 'Enter Admin ID';
        idErrorEl.style.display = 'block';
        isValid = false;
    } else if (adminId.toUpperCase().indexOf('MDC') !== 0) {
        idErrorEl.textContent = 'Admin ID must start with MDC';
        idErrorEl.style.display = 'block';
        isValid = false;
    } else {
        var admins = getAdminAccounts();
        var idNorm = adminId.toUpperCase();
        for (var i = 0; i < admins.length; i++) {
            if (admins[i] && String(admins[i].adminId || '').trim().toUpperCase() === idNorm) {
                idErrorEl.textContent = 'This Admin ID is already registered';
                idErrorEl.style.display = 'block';
                isValid = false;
                break;
            }
        }
    }

    if (!password) {
        passwordErrorEl.textContent = 'Enter a password';
        passwordErrorEl.style.display = 'block';
        isValid = false;
    } else if (password.length < 6) {
        passwordErrorEl.textContent = 'Password must be at least 6 characters';
        passwordErrorEl.style.display = 'block';
        isValid = false;
    }

    if (password !== confirmPassword) {
        confirmErrorEl.textContent = 'Passwords do not match';
        confirmErrorEl.style.display = 'block';
        isValid = false;
    }

    if (!isValid) return;

    function doLocalAdminRegister() {
        var admins = getAdminAccounts();
        admins.push({ adminId: adminId, password: password });
        localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(admins));
        alert('Admin registration successful. You can now login.');
        window.location.replace('admin-login.html');
    }

    if (window.MediClaimAPI && window.MediClaimAPI.admin) {
        window.MediClaimAPI.admin.register({
            adminId: adminId,
            password: password,
            confirmPassword: confirmPassword
        })
            .then(function () {
                alert('Admin registration successful. You can now login.');
                window.location.replace('admin-login.html');
            })
            .catch(function (err) {
                var msg = (err && err.data && err.data.error) ? err.data.error : (err && err.message) ? err.message : '';
                if (msg && msg.indexOf('already registered') !== -1) {
                    idErrorEl.textContent = 'This Admin ID is already registered';
                    idErrorEl.style.display = 'block';
                    return;
                }
                doLocalAdminRegister();
            });
    } else {
        doLocalAdminRegister();
    }
}
