// Contact Support Page - Contact form handling
document.addEventListener('DOMContentLoaded', function() {
    loadUserProfile();
    setupContactSupportForm();
    loadMySupportTickets();
    setupLogout();
    setupSidebar();
});

function loadUserProfile() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    const userNameEl = document.getElementById('topbarUserName');
    if (userNameEl && user.name) {
        userNameEl.textContent = user.name;
    }

    const userAvatar = document.querySelector('.user-avatar');
    if (userAvatar && user.name) {
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
        userAvatar.textContent = initials;
    }
}

function setupSidebar() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
        });
    }
}

function setupContactSupportForm() {
    const form = document.getElementById('contactSupportForm');
    const clearBtn = document.getElementById('clearSupportBtn');

    if (form) {
        form.addEventListener('submit', submitContactSupport);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            form.reset();
            showNotification('Form cleared', 'info');
        });
    }
}

function submitContactSupport(e) {
    e.preventDefault();

    const subject = document.getElementById('supportSubject').value.trim();
    const category = document.getElementById('supportCategory').value.trim();
    const priority = document.getElementById('supportPriority').value.trim();
    const message = document.getElementById('supportMessage').value.trim();
    const attachmentInput = document.getElementById('supportAttachment');

    // Validate required fields
    if (!subject || !category || !message) {
        showNotification('Please fill in all required fields (Subject, Category, Message)', 'error');
        return;
    }

    // Validate message length
    if (message.length < 10) {
        showNotification('Message must be at least 10 characters long', 'error');
        return;
    }

    // Prepare FormData
    const formData = new FormData();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    formData.append('user_email', user.email || '');
    formData.append('subject', subject);
    formData.append('category', category);
    formData.append('priority', priority);
    formData.append('message', message);

    // Handle file attachment
    if (attachmentInput && attachmentInput.files && attachmentInput.files.length > 0) {
        const file = attachmentInput.files[0];
        
        // Validate file size (5MB max)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            showNotification('File size exceeds 5MB limit', 'error');
            return;
        }

        // Validate file type
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(fileExtension)) {
            showNotification('Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX', 'error');
            return;
        }

        formData.append('attachment', file);
    }

    // Show loading state
    const submitBtn = document.querySelector('#contactSupportForm button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Sending...';
    showLoadingSpinner(true);

    // Submit to backend
    MediClaimAPI.support.submitRequest(formData)
        .then(function(response) {
            showLoadingSpinner(false);
            showNotification('Support request submitted successfully! We will contact you soon.', 'success');
            document.getElementById('contactSupportForm').reset();
            document.getElementById('supportAttachment').value = '';
            loadMySupportTickets();
        })
        .catch(function(error) {
            showLoadingSpinner(false);
            console.error('Support request error:', error);
            showNotification('Error submitting support request: ' + error.message, 'error');
        })
        .finally(function() {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });
}

function loadMySupportTickets() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const tableBody = document.getElementById('supportTicketsTbody');
    if (!tableBody || !user.email || !(window.MediClaimAPI && window.MediClaimAPI.support)) {
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="5" class="admin-loading">Loading support requests...</td></tr>';
    window.MediClaimAPI.support.getTickets(user.email)
        .then(function(tickets) {
            const list = Array.isArray(tickets) ? tickets : [];
            if (!list.length) {
                tableBody.innerHTML = '<tr><td colspan="5" class="admin-loading">No support requests yet.</td></tr>';
                return;
            }
            tableBody.innerHTML = list.map(function(t) {
                const createdAt = t.created_at ? new Date(t.created_at).toLocaleString() : '-';
                const status = (t.status || 'open').toUpperCase();
                const reply = t.admin_reply ? t.admin_reply : 'No reply yet';
                return '<tr>' +
                    '<td>' + escapeHtml(t.subject || '-') + '</td>' +
                    '<td>' + escapeHtml(status) + '</td>' +
                    '<td>' + escapeHtml(createdAt) + '</td>' +
                    '<td>' + escapeHtml(reply) + '</td>' +
                    '<td>' + escapeHtml(t.replied_by || '-') + '</td>' +
                '</tr>';
            }).join('');
        })
        .catch(function() {
            tableBody.innerHTML = '<tr><td colspan="5" class="admin-loading">Failed to load support requests.</td></tr>';
        });
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

// Helper function to show notifications
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification ' + type;
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Add animation class
    setTimeout(function() {
        notification.classList.add('show');
    }, 10);
    
    // Auto remove after 4 seconds
    setTimeout(function() {
        notification.classList.remove('show');
        setTimeout(function() {
            document.body.removeChild(notification);
        }, 300);
    }, 4000);
}

function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        });
    }
}

function showLoadingSpinner(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
    }
}
