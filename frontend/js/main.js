// Main JavaScript file - Common functionality across all pages

// Mobile Navigation Toggle
document.addEventListener('DOMContentLoaded', function() {
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            if (!navToggle.contains(event.target) && !navMenu.contains(event.target)) {
                navMenu.classList.remove('active');
            }
        });
    }

    // Sidebar Toggle for Dashboard Pages
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
        });

        // Close sidebar when clicking outside on mobile
        if (window.innerWidth <= 768) {
            document.addEventListener('click', function(event) {
                if (sidebar && !sidebar.contains(event.target) && 
                    !sidebarToggle.contains(event.target) && 
                    sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                }
            });
        }
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href !== '') {
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });

                    // Close mobile menu if open
                    if (navMenu && navMenu.classList.contains('active')) {
                        navMenu.classList.remove('active');
                    }
                }
            }
        });
    });

    // Logout functionality (sidebar links with class "logout" or id "logoutBtn")
    function handleLogout(e) {
        e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('user');
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('isAdminLoggedIn');
            localStorage.removeItem('adminUser');
            window.location.href = 'index.html';
        }
    }
    var logoutEls = document.querySelectorAll('#logoutBtn, .nav-item.logout, a.logout');
    logoutEls.forEach(function(el) {
        if (el && !el.hasAttribute('data-logout-bound')) {
            el.setAttribute('data-logout-bound', 'true');
            el.addEventListener('click', handleLogout);
        }
    });

    // Check if user is logged in (for protected pages)
    const protectedPages = ['dashboard.html', 'file-claim.html', 'claim-status.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
        var isLoggedIn = localStorage.getItem('isLoggedIn');
        if (!isLoggedIn) {
            var next = encodeURIComponent(currentPage);
            window.location.href = 'login.html?next=' + next;
        }
    }

    // Set topbar user name and avatar from logged-in user (claim-status, file-claim, dashboard)
    setTopbarFromUser();
});

// Set topbar to show logged-in user name and avatar
function setTopbarFromUser() {
    try {
        var userStr = localStorage.getItem('user');
        var name = 'User';
        var initials = 'U';
        if (userStr) {
            var user = JSON.parse(userStr);
            if (user && user.name) {
                name = String(user.name).trim();
                initials = name.split(/\s+/).map(function(s) { return s.charAt(0); }).join('').toUpperCase().slice(0, 2) || 'U';
            }
        }
        var topbarName = document.getElementById('topbarUserName');
        var topbarAvatar = document.getElementById('topbarUserAvatar');
        if (topbarName) topbarName.textContent = name;
        if (topbarAvatar) topbarAvatar.textContent = initials;
        var dashName = document.getElementById('userName');
        if (dashName) dashName.textContent = name;
        var dashAvatar = document.querySelector('.topbar-right .user-avatar');
        if (dashAvatar) dashAvatar.textContent = initials;
    } catch (e) {}
}

// Utility function to format dates
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Utility function to format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
}

// Utility function to show notifications (toast)
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

