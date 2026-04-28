/**
 * Profile Settings Page - Manage user profile and account
 * Handles profile viewing, editing, password changes, and account deletion
 */

document.addEventListener('DOMContentLoaded', function() {
    const user = JSON.parse(localStorage.getItem('user'));
    
    // Check if user is logged in
    if (!user || !user.email) {
        window.location.href = 'login.html';
        return;
    }

    // Initialize page
    loadUserProfile();
    setupEventListeners();
});

/**
 * Load user profile from backend
 */
function loadUserProfile() {
    showLoadingSpinner(true);
    
    const user = JSON.parse(localStorage.getItem('user'));
    
    MediClaimAPI.users.getProfile(user.email)
        .then(function(response) {
            const profile = response.profile || user;
            displayUserProfile(profile);
            populateEditForm(profile);
            showLoadingSpinner(false);
        })
        .catch(function(error) {
            console.error('Error loading profile:', error);
            // Fallback to localStorage if API fails
            const user = JSON.parse(localStorage.getItem('user'));
            displayUserProfile(user);
            populateEditForm(user);
            showLoadingSpinner(false);
        });
}

/**
 * Display user profile in view mode
 */
function displayUserProfile(profile) {
    document.getElementById('displayName').textContent = profile.name || '-';
    document.getElementById('displayEmail').textContent = profile.email || '-';
    document.getElementById('displayMobile').textContent = profile.mobile || '-';
    document.getElementById('displayPolicy').textContent = profile.policyNumber || '-';
    document.getElementById('userNameDisplay').textContent = profile.name || 'User';
}

/**
 * Populate edit form with current profile data
 */
function populateEditForm(profile) {
    document.getElementById('editName').value = profile.name || '';
    document.getElementById('editEmail').value = profile.email || '';
    document.getElementById('editMobile').value = profile.mobile || '';
    document.getElementById('editPolicy').value = profile.policyNumber || '';
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Edit Profile button
    document.getElementById('editProfileBtn').addEventListener('click', function(e) {
        e.preventDefault();
        toggleEditMode(true);
    });

    // Cancel Edit button
    document.getElementById('cancelEditBtn').addEventListener('click', function(e) {
        e.preventDefault();
        toggleEditMode(false);
    });

    // Edit Profile Form submission
    document.getElementById('editProfileForm').addEventListener('submit', function(e) {
        e.preventDefault();
        updateUserProfile();
    });

    // Change Password Form submission
    document.getElementById('changePasswordForm').addEventListener('submit', function(e) {
        e.preventDefault();
        changePassword();
    });

    // Delete Account button
    document.getElementById('deleteAccountBtn').addEventListener('click', function(e) {
        e.preventDefault();
        confirmDeleteAccount();
    });

    // Contact Support button in sidebar
    const contactSupportBtn = document.getElementById('contactSupportBtn');
    if (contactSupportBtn) {
        contactSupportBtn.addEventListener('click', function(e) {
            const contactSection = document.getElementById('contactSupport');
            if (contactSection) {
                e.preventDefault();
                contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            // Fallback to page navigation when inline section is not present.
            window.location.href = contactSupportBtn.getAttribute('href') || 'contact-support.html';
        });
    }
}

/**
 * Toggle between view and edit modes
 */
function toggleEditMode(isEdit) {
    const viewMode = document.getElementById('viewMode');
    const editForm = document.getElementById('editProfileForm');
    const editBtn = document.getElementById('editProfileBtn');

    if (isEdit) {
        viewMode.style.display = 'none';
        editForm.style.display = 'block';
        editBtn.style.display = 'none';
    } else {
        viewMode.style.display = 'block';
        editForm.style.display = 'none';
        editBtn.style.display = 'block';
        // Reload original data
        const user = JSON.parse(localStorage.getItem('user'));
        populateEditForm(user);
    }
}

/**
 * Update user profile
 */
function updateUserProfile() {
    const form = document.getElementById('editProfileForm');
    const formData = {
        name: document.getElementById('editName').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        mobile: document.getElementById('editMobile').value.trim(),
        policyNumber: document.getElementById('editPolicy').value.trim()
    };

    // Validation
    if (!formData.name || !formData.email || !formData.mobile || !formData.policyNumber) {
        showError('All fields are required');
        return;
    }

    showLoadingSpinner(true);

    MediClaimAPI.users.updateProfile(formData)
        .then(function(response) {
            showLoadingSpinner(false);
            showSuccess('Profile updated successfully!');
            
            // Update localStorage
            const updatedUser = JSON.parse(localStorage.getItem('user'));
            updatedUser.name = formData.name;
            updatedUser.email = formData.email;
            updatedUser.mobile = formData.mobile;
            updatedUser.policyNumber = formData.policyNumber;
            localStorage.setItem('user', JSON.stringify(updatedUser));

            // Update display
            displayUserProfile(updatedUser);
            toggleEditMode(false);
        })
        .catch(function(error) {
            showLoadingSpinner(false);
            showError(error.message || 'Failed to update profile');
        });
}

/**
 * Change user password
 */
function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showError('All password fields are required');
        return;
    }

    if (newPassword.length < 6) {
        showError('New password must be at least 6 characters');
        return;
    }

    if (newPassword !== confirmPassword) {
        showError('New passwords do not match');
        return;
    }

    if (currentPassword === newPassword) {
        showError('New password must be different from current password');
        return;
    }

    showLoadingSpinner(true);

    const user = JSON.parse(localStorage.getItem('user'));
    MediClaimAPI.users.changePassword({
        email: user.email,
        currentPassword: currentPassword,
        newPassword: newPassword
    })
        .then(function(response) {
            showLoadingSpinner(false);
            showSuccess('Password changed successfully!');
            
            // Clear the form
            document.getElementById('changePasswordForm').reset();
        })
        .catch(function(error) {
            showLoadingSpinner(false);
            showError(error.message || 'Failed to change password');
        });
}

/**
 * Confirm and delete user account
 */
function confirmDeleteAccount() {
    const confirmed = confirm('Are you sure you want to delete your account? This action cannot be undone.');
    
    if (!confirmed) {
        return;
    }

    const secondConfirm = confirm('This will permanently delete your account and all associated data. Type DELETE to confirm.');
    
    if (!secondConfirm) {
        return;
    }

    deleteAccount();
}

/**
 * Delete user account
 */
function deleteAccount() {
    showLoadingSpinner(true);

    const user = JSON.parse(localStorage.getItem('user'));
    MediClaimAPI.users.deleteAccount(user.email)
        .then(function(response) {
            showLoadingSpinner(false);
            showSuccess('Account deleted successfully');
            
            // Clear localStorage
            localStorage.removeItem('user');
            localStorage.removeItem('isLoggedIn');

            // Redirect to home page
            setTimeout(function() {
                window.location.href = 'index.html';
            }, 1500);
        })
        .catch(function(error) {
            showLoadingSpinner(false);
            showError(error.message || 'Failed to delete account');
        });
}

/**
 * Show success message
 */
function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    
    setTimeout(function() {
        successDiv.style.display = 'none';
    }, 4000);
}

/**
 * Show error message
 */
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    setTimeout(function() {
        errorDiv.style.display = 'none';
    }, 4000);
}

/**
 * Show/hide loading spinner
 */
function showLoadingSpinner(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (show) {
        spinner.style.display = 'flex';
    } else {
        spinner.style.display = 'none';
    }
}

/**
 * Show notification (toast-like)
 */
function showNotification(message, type = 'info') {
    if (type === 'success') {
        showSuccess(message);
    } else if (type === 'error') {
        showError(message);
    } else {
        showSuccess(message);
    }
}
