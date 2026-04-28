// Claim Status page - load and display logged-in user's claims

document.addEventListener('DOMContentLoaded', function() {
    loadUserClaims();
});

function formatDateStable(value, options) {
    if (!value) return '';
    var raw = String(value).trim();

    // Keep date-only values stable (no timezone conversion).
    var dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        var d = new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
        return d.toLocaleDateString('en-US', options || { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // For backend timestamps without timezone, use date portion directly.
    var isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) {
        var d2 = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        return d2.toLocaleDateString('en-US', options || { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // For explicit GMT/UTC values, force UTC timezone display to avoid rollover.
    var parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
        var useUtc = /GMT|UTC/i.test(raw);
        var fmt = Object.assign({}, options || { year: 'numeric', month: 'long', day: 'numeric' });
        if (useUtc) fmt.timeZone = 'UTC';
        return parsed.toLocaleDateString('en-US', fmt);
    }
    return raw;
}

function loadUserClaims() {
    var listEl = document.getElementById('claimsList');
    var loadingEl = document.getElementById('claimsLoading');
    if (!listEl) return;

    var userStr = localStorage.getItem('user');
    var user = null;
    if (userStr) {
        try {
            user = JSON.parse(userStr);
        } catch (e) {}
    }
    var userEmail = (user && user.email) ? String(user.email).toLowerCase().trim() : '';
    var userPolicy = (user && user.policyNumber) ? String(user.policyNumber).toLowerCase().trim() : '';
    var apiUnavailableMessage = '<p class="claims-empty">Could not load claims from server. Please start backend API and refresh.</p>';

    function renderClaims(claims, options) {
        options = options || {};
        if (loadingEl) loadingEl.style.display = 'none';
        claims = claims || [];
        claims.sort(function(a, b) {
            var da = new Date(a.submittedDate || a.submitted_date || 0);
            var db = new Date(b.submittedDate || b.submitted_date || 0);
            return db - da;
        });
        if (claims.length === 0) {
            if (options.apiDown) {
                listEl.innerHTML = apiUnavailableMessage;
                return;
            }
            listEl.innerHTML = '<p class="claims-empty">No claims found. <a href="file-claim.html">File a new claim</a>.</p>';
            return;
        }
        var html = claims.map(function(c) {
            var c2 = c;
            if (c.user_email && !c.email) c2 = Object.assign({}, c, { email: c.user_email });
            if (c.claim_id && !c.claimId) c2 = Object.assign({}, c2, { claimId: c.claim_id });
            if (c.submitted_date && !c.submittedDate) c2 = Object.assign({}, c2, { submittedDate: c.submitted_date });
            if (c.total_amount != null && c.totalAmount == null) c2 = Object.assign({}, c2, { totalAmount: c.total_amount });
            if (c.approved_amount != null && c.approvedAmount == null) c2 = Object.assign({}, c2, { approvedAmount: c.approved_amount });
            if (c.coverage_percent != null && c.coveragePercent == null) c2 = Object.assign({}, c2, { coveragePercent: c.coverage_percent });
            if (c.approval_mode != null && c.approvalMode == null) c2 = Object.assign({}, c2, { approvalMode: c.approval_mode });
            if (c.patient_name != null) c2 = Object.assign({}, c2, { patientName: c.patient_name });
            if (c.hospital_name != null) c2 = Object.assign({}, c2, { hospitalName: c.hospital_name });
            return buildClaimCard(c2);
        }).join('');
        listEl.innerHTML = html;
    }

    function doLocalLoad() {
        var rawClaims = [];
        try {
            rawClaims = JSON.parse(localStorage.getItem('claims') || '[]');
        } catch (e) {}
        var allClaims = Array.isArray(rawClaims) ? rawClaims : [];
        var claims = allClaims.filter(function(c) {
            var claimEmail = (c && c.email) ? String(c.email).toLowerCase().trim() : '';
            var claimPolicy = (c && (c.policyNumber || c.policy_number)) ? String(c.policyNumber || c.policy_number).toLowerCase().trim() : '';
            return (userEmail && claimEmail === userEmail) || (userPolicy && claimPolicy === userPolicy);
        });
        renderClaims(claims);
    }

    if (window.MediClaimAPI && window.MediClaimAPI.claims && userEmail) {
        window.MediClaimAPI.claims.list(userEmail)
            .then(function (res) {
                if (Array.isArray(res)) {
                    renderClaims(res);
                } else if (res && res.claims) {
                    renderClaims(res.claims);
                } else {
                    doLocalLoad();
                }
            })
            .catch(function () {
                var rawClaims = [];
                try {
                    rawClaims = JSON.parse(localStorage.getItem('claims') || '[]');
                } catch (e) {}
                var allClaims = Array.isArray(rawClaims) ? rawClaims : [];
                var fallbackClaims = allClaims.filter(function(c) {
                    var claimEmail = (c && c.email) ? String(c.email).toLowerCase().trim() : '';
                    var claimPolicy = (c && (c.policyNumber || c.policy_number)) ? String(c.policyNumber || c.policy_number).toLowerCase().trim() : '';
                    return (userEmail && claimEmail === userEmail) || (userPolicy && claimPolicy === userPolicy);
                });
                renderClaims(fallbackClaims, { apiDown: fallbackClaims.length === 0 });
            });
    } else {
        doLocalLoad();
    }
}

function buildClaimCard(c) {
    var claimId = (c && c.claimId) ? escapeHtml(String(c.claimId)) : '-';
    var status = (c && c.status) ? String(c.status) : 'pending';
    var statusClass = 'status-pending';
    var statusLabel = 'Pending';
    if (status === 'approved' || status === 'settled') {
        statusClass = status === 'settled' ? 'status-settled' : 'status-approved';
        statusLabel = status === 'settled' ? 'Settled' : 'Approved';
    } else if (status === 'rejected') {
        statusClass = 'status-rejected';
        statusLabel = 'Rejected';
    } else if (status === 'under-review' || status === 'review') {
        statusClass = 'status-pending';
        statusLabel = 'Under Review';
    }

    var submittedDate = '';
    if (c && c.submittedDate) {
        submittedDate = formatDateStable(c.submittedDate, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    var hospital = (c && c.hospitalName) ? escapeHtml(String(c.hospitalName)) : '-';
    var patient = (c && c.patientName) ? escapeHtml(String(c.patientName)) : (c && c.name) ? escapeHtml(String(c.name)) : '-';
    var amount = (c && c.totalAmount != null) ? formatClaimCurrency(Number(c.totalAmount)) : '₹ 0';
    var approvedAmount = (c && c.approvedAmount != null) ? formatClaimCurrency(Number(c.approvedAmount)) : '-';
    var coveragePercent = (c && c.coveragePercent != null) ? (Number(c.coveragePercent) <= 1 ? (Math.round(Number(c.coveragePercent) * 100) + '%') : (String(c.coveragePercent) + (String(c.coveragePercent).indexOf('%') === -1 ? '%' : ''))) : '-';
    var decisionType = (c && c.approvalMode) ? String(c.approvalMode).replace(/_/g, ' ') : '-';
    var treatment = (c && c.diagnosis) ? escapeHtml(String(c.diagnosis)) : (c && c.claimType) ? escapeHtml(String(c.claimType)) : '-';

    return (
        '<div class="claim-status-card" data-status="' + escapeAttr(status) + '" data-claim-id="' + escapeAttr(claimId) + '">' +
        '  <div class="claim-header">' +
        '    <div><h3>Claim ID: ' + claimId + '</h3><p class="claim-date">Submitted on: ' + escapeHtml(submittedDate) + '</p></div>' +
        '    <span class="status-badge ' + statusClass + '">' + escapeHtml(statusLabel) + '</span>' +
        '  </div>' +
        '  <div class="claim-info-grid">' +
        '    <div class="info-item"><label>Hospital</label><p>' + hospital + '</p></div>' +
        '    <div class="info-item"><label>Patient</label><p>' + patient + '</p></div>' +
        '    <div class="info-item"><label>Claim Amount</label><p class="amount">' + amount + '</p></div>' +
        '    <div class="info-item"><label>Approved Amount</label><p class="amount">' + approvedAmount + '</p></div>' +
        '    <div class="info-item"><label>Coverage</label><p>' + escapeHtml(coveragePercent) + '</p></div>' +
        '    <div class="info-item"><label>Decision Type</label><p>' + escapeHtml(decisionType) + '</p></div>' +
        '    <div class="info-item"><label>Treatment</label><p>' + treatment + '</p></div>' +
        '  </div>' +
        '  <div class="timeline-container"><div class="timeline">' +
        '    <div class="timeline-step completed"><div class="timeline-icon">✓</div><div class="timeline-content"><h4>Submitted</h4><p>' + escapeHtml(submittedDate) + '</p></div></div>' +
        '    <div class="timeline-step ' + (status !== 'pending' ? 'completed' : 'active') + '"><div class="timeline-icon">' + (status !== 'pending' ? '✓' : '⏳') + '</div><div class="timeline-content"><h4>Under Review</h4><p>' + (status !== 'pending' ? 'Done' : 'In progress') + '</p></div></div>' +
        '    <div class="timeline-step ' + (status === 'approved' || status === 'settled' ? 'completed' : '') + '"><div class="timeline-icon">' + (status === 'approved' || status === 'settled' ? '✓' : '○') + '</div><div class="timeline-content"><h4>Approval</h4><p>' + (status === 'approved' || status === 'settled' ? statusLabel : 'Pending') + '</p></div></div>' +
        '    <div class="timeline-step ' + (status === 'settled' ? 'completed' : '') + '"><div class="timeline-icon">' + (status === 'settled' ? '✓' : '○') + '</div><div class="timeline-content"><h4>Settled</h4><p>' + (status === 'settled' ? 'Done' : 'Pending') + '</p></div></div>' +
        '  </div></div>' +
        '  <div class="claim-actions"><button class="btn btn-text">View Details</button><button class="btn btn-text">Download Receipt</button></div>' +
        '</div>'
    );
}

function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatClaimCurrency(num) {
    if (isNaN(num)) return '₹ 0';
    return '₹ ' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
