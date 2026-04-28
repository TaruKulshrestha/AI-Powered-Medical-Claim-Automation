// Dashboard JavaScript - User dashboard functionality

document.addEventListener('DOMContentLoaded', function() {
    // Load user data and populate dashboard
    loadUserData();
    loadDashboardData();

    // Sidebar toggle (already handled in main.js, but ensure it works)
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
        });
    }

    // Upload Documents button now navigates directly via href to claim-status.html

    // Profile settings button
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'profile-settings.html';
        });
    }
});

// Helper: set element text to value if non-empty, otherwise 'NA'
function setPolicyField(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    var v = (value != null && value !== '') ? String(value).trim() : '';
    el.textContent = v ? v : 'NA';
}

// Load user data from localStorage
function loadUserData() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    // Always update topbar name and avatar from logged-in user (never leave "John Doe")
    const displayName = (user && user.name && String(user.name).trim()) ? String(user.name).trim() : (user && user.email) ? String(user.email).split('@')[0] : 'User';
    const initials = displayName.split(/\s+/).map(function (s) { return s.charAt(0); }).join('').toUpperCase().slice(0, 2) || 'U';

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = displayName;

    const userAvatar = document.querySelector('.topbar-right .user-avatar, .user-avatar');
    if (userAvatar) userAvatar.textContent = initials;

    // Policy details: dynamic from user; show NA when not provided
    updatePolicyDetails(user);

    if (user.name) {
        const claimPolicyNumberEl = document.getElementById('claimPolicyNumber');
        if (claimPolicyNumberEl && user.policyNumber) claimPolicyNumberEl.value = user.policyNumber;

        const claimNameEl = document.getElementById('claimName');
        if (claimNameEl) claimNameEl.value = user.name;

        const claimEmailEl = document.getElementById('claimEmail');
        if (claimEmailEl && user.email) claimEmailEl.value = user.email;

        const claimMobileEl = document.getElementById('claimMobile');
        if (claimMobileEl && user.mobile) claimMobileEl.value = user.mobile;
    }
}

// Populate Policy Details card from user; missing fields show NA
function updatePolicyDetails(user) {
    if (!user) user = {};
    setPolicyField('policyNumber', user.policyNumber);
    setPolicyField('policyType', user.policyType);
    setPolicyField('sumInsured', user.sumInsured);
    setPolicyField('validity', user.validity);
    setPolicyField('premium', user.premium);
    var statusEl = document.getElementById('policyStatus');
    if (statusEl) {
        var statusVal = (user.policyStatus != null && user.policyStatus !== '') ? String(user.policyStatus).trim() : '';
        statusEl.textContent = statusVal || 'NA';
        statusEl.className = 'status-badge ' + (statusVal && statusVal.toLowerCase() !== 'na' ? 'status-active' : 'status-pending');
    }
}

// Load dashboard data
function loadDashboardData() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userEmail = user && user.email ? String(user.email).trim().toLowerCase() : '';
    const userPolicy = user && user.policyNumber ? String(user.policyNumber).trim().toLowerCase() : '';

    function normalizeClaims(claims) {
        return (claims || []).map(function(c) {
            return {
                claimId: c.claimId || c.claim_id,
                submittedDate: c.submittedDate || c.submitted_date,
                hospitalName: c.hospitalName || c.hospital_name,
                totalAmount: c.totalAmount != null ? c.totalAmount : c.total_amount,
                approvedAmount: c.approvedAmount != null ? c.approvedAmount : c.approved_amount,
                status: String(c.status || 'pending').toLowerCase(),
                email: (c.email || c.user_email || '').toLowerCase(),
                policyNumber: c.policyNumber || c.policy_number
            };
        });
    }

    function render(userClaims) {
        userClaims = normalizeClaims(userClaims);

        const activeClaims = userClaims.filter(c => c.status === 'under-review' || c.status === 'review' || c.status === 'pending').length;
        const completedClaims = userClaims.filter(c => c.status === 'settled' || c.status === 'approved').length;
        const pendingDocs = userClaims.filter(c => c.status === 'pending-docs').length;

        const totalClaimed = userClaims
            .filter(c => c.status === 'settled' || c.status === 'approved')
            .reduce((sum, c) => {
                const credited = parseFloat(c.approvedAmount);
                if (!isNaN(credited)) return sum + credited;
                return sum + parseFloat(c.totalAmount || 0);
            }, 0);

        const activeClaimsEl = document.getElementById('activeClaims');
        if (activeClaimsEl) activeClaimsEl.textContent = activeClaims || '0';

        const completedClaimsEl = document.getElementById('completedClaims');
        if (completedClaimsEl) completedClaimsEl.textContent = completedClaims || '0';

        const pendingDocsEl = document.getElementById('pendingDocs');
        if (pendingDocsEl) pendingDocsEl.textContent = pendingDocs || '0';

        const totalClaimedEl = document.getElementById('totalClaimed');
        if (totalClaimedEl) totalClaimedEl.textContent = formatCurrency(totalClaimed);

        updateRecentClaimsTable(userClaims.slice(0, 5));
    }

    function localFallback() {
        let claims = [];
        try {
            claims = JSON.parse(localStorage.getItem('claims') || '[]');
        } catch (e) {}
        const userClaims = normalizeClaims(claims).filter(function(c) {
            const cEmail = String(c.email || '').trim().toLowerCase();
            const cPolicy = String(c.policyNumber || '').trim().toLowerCase();
            return (userEmail && cEmail === userEmail) || (userPolicy && cPolicy === userPolicy);
        });
        render(userClaims);
    }

    if (window.MediClaimAPI && window.MediClaimAPI.claims && userEmail) {
        window.MediClaimAPI.claims.list(userEmail)
            .then(function(res) {
                if (Array.isArray(res)) {
                    render(res);
                } else if (res && Array.isArray(res.claims)) {
                    render(res.claims);
                } else {
                    localFallback();
                }
            })
            .catch(function() {
                localFallback();
            });
    } else {
        localFallback();
    }
}

// Update recent claims table
function updateRecentClaimsTable(claims) {
    const tableBody = document.getElementById('recentClaimsTable');
    if (!tableBody) return;

    // Clear existing rows (except header)
    const existingRows = tableBody.querySelectorAll('tr');
    existingRows.forEach(row => row.remove());

    if (claims.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No claims found. <a href="file-claim.html">File your first claim</a></td>';
        tableBody.appendChild(row);
        return;
    }

    // Sort claims by date (newest first)
    claims.sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate));

    claims.forEach(claim => {
        const row = document.createElement('tr');
        const statusBadge = getStatusBadge(claim.status);
        const date = new Date(claim.submittedDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        row.innerHTML = `
            <td>${claim.claimId || 'N/A'}</td>
            <td>${date}</td>
            <td>${claim.hospitalName || 'N/A'}</td>
            <td>${formatCurrency(parseFloat(claim.totalAmount || 0))}</td>
            <td>${statusBadge}</td>
            <td><a href="claim-status.html" class="btn-link">View</a></td>
        `;
        tableBody.appendChild(row);
    });
}

// Get status badge HTML
function getStatusBadge(status) {
    const statusMap = {
        'pending': '<span class="status-badge status-pending">Pending</span>',
        'under-review': '<span class="status-badge status-pending">Under Review</span>',
        'approved': '<span class="status-badge status-approved">Approved</span>',
        'rejected': '<span class="status-badge status-rejected">Rejected</span>',
        'settled': '<span class="status-badge status-settled">Settled</span>',
        'processing': '<span class="status-badge status-processing">Processing</span>'
    };
    return statusMap[status] || '<span class="status-badge status-pending">Pending</span>';
}

// Format currency helper
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
}

// Show notification helper
function showNotification(message, type = 'success') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        alert(message);
    }
}

