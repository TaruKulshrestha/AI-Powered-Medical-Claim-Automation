// Admin Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Load admin dashboard data
    loadAdminData();
    setupReportsActions();
    setupUserManagementActions();
    setupSupportActions();

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
        });
    }
});

var adminClaimsList = [];
var adminUsersList = [];
var adminSupportTickets = [];
var claimsBarChart = null;
var statusPieChart = null;
var fraudLineChart = null;

function setupUserManagementActions() {
    var usersSection = document.getElementById('users');
    if (!usersSection) return;
    var addUserForm = document.getElementById('adminAddUserForm');
    if (addUserForm && !addUserForm.hasAttribute('data-admin-add-user-bound')) {
        addUserForm.setAttribute('data-admin-add-user-bound', 'true');
        addUserForm.addEventListener('submit', handleAdminAddUser);
    }

    usersSection.addEventListener('click', function(e) {
        var target = e.target;
        if (!target || target.tagName !== 'BUTTON') return;

        var action = (target.textContent || '').trim().toLowerCase();
        if (action !== 'view') return;

        var row = target.closest('tr');
        if (!row) return;

        var cells = row.querySelectorAll('td');
        if (!cells || cells.length < 6) return;

        openUserModal({
            name: (cells[0].textContent || '').trim(),
            email: (cells[1].textContent || '').trim(),
            policyNumber: (cells[2].textContent || '').trim(),
            mobile: (cells[3].textContent || '').trim(),
            totalClaims: (cells[4].textContent || '').trim(),
            totalAmount: (cells[5].textContent || '').trim(),
            status: (cells[6].textContent || '').trim()
        });
    });
}

function setupSupportActions() {
    var supportSection = document.getElementById('support-complaints');
    if (!supportSection) return;
    supportSection.addEventListener('click', function(e) {
        var target = e.target;
        if (!target || !target.classList.contains('reply-support-btn')) return;
        var ticketId = target.getAttribute('data-ticket-id');
        var input = document.getElementById('supportReplyInput-' + ticketId);
        var replyText = input ? (input.value || '').trim() : '';
        if (!replyText) {
            showNotification('Please write a reply before sending.', 'error');
            return;
        }
        var adminObj = JSON.parse(localStorage.getItem('adminUser') || '{}');
        var adminId = adminObj.adminId || localStorage.getItem('adminId') || 'admin';
        if (!(window.MediClaimAPI && window.MediClaimAPI.support && window.MediClaimAPI.support.replyToTicket)) {
            showNotification('Support reply API unavailable.', 'error');
            return;
        }
        window.MediClaimAPI.support.replyToTicket(ticketId, {
            admin_id: adminId,
            reply_message: replyText
        }).then(function() {
            showNotification('Reply sent successfully.', 'success');
            loadSupportTickets();
        }).catch(function(err) {
            var msg = (err && err.data && (err.data.error || err.data.message)) ? String(err.data.error || err.data.message) : 'Failed to send reply.';
            showNotification(msg, 'error');
        });
    });
}

function handleAdminAddUser(e) {
    e.preventDefault();
    var form = e.target;
    var name = (document.getElementById('adminUserName').value || '').trim();
    var email = (document.getElementById('adminUserEmail').value || '').trim().toLowerCase();
    var mobile = (document.getElementById('adminUserMobile').value || '').trim();
    var policyNumber = (document.getElementById('adminUserPolicy').value || '').trim();
    var password = (document.getElementById('adminUserPassword').value || '');

    if (!name || !email || !mobile || !policyNumber || !password) {
        showNotification('Please fill all required user fields.', 'error');
        return;
    }
    if (!/^[0-9]{10}$/.test(mobile)) {
        showNotification('Mobile must be 10 digits.', 'error');
        return;
    }
    if (password.length < 8) {
        showNotification('Password must be at least 8 characters.', 'error');
        return;
    }
    if (!(window.MediClaimAPI && window.MediClaimAPI.users && window.MediClaimAPI.users.register)) {
        showNotification('User registration API is unavailable.', 'error');
        return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';
    }

    window.MediClaimAPI.users.register({
        name: name,
        email: email,
        mobile: mobile,
        policyNumber: policyNumber,
        password: password
    }).then(function () {
        var exists = adminUsersList.some(function (u) {
            return String(u.email || '').trim().toLowerCase() === email;
        });
        if (!exists) {
            adminUsersList.unshift({
                name: name,
                email: email,
                policyNumber: policyNumber,
                mobile: mobile,
                totalClaims: 0,
                totalAmount: 0
            });
        }
        showNotification('User registered successfully from admin panel.', 'success');
        form.reset();
        loadAdminData();
    }).catch(function (err) {
        var msg = (err && err.data && (err.data.error || err.data.message)) ? String(err.data.error || err.data.message) : '';
        showNotification(msg || 'Failed to register user.', 'error');
    }).finally(function () {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add User';
        }
    });
}

function openUserModal(user) {
    var modal = document.getElementById('userModal');
    if (!modal) return;

    function set(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value || '-';
    }

    set('userModalName', user.name);
    set('userModalEmail', user.email);
    set('userModalPolicy', user.policyNumber);
    set('userModalMobile', user.mobile);
    set('userModalClaims', user.totalClaims);
    set('userModalAmount', user.totalAmount);
    set('userModalStatus', user.status);

    modal.style.display = 'flex';
}

function closeUserModal() {
    var modal = document.getElementById('userModal');
    if (modal) modal.style.display = 'none';
}

function normalizeProbabilityToPercent(value) {
    if (value == null) return null;
    var n = Number(value);
    if (isNaN(n)) return null;
    if (n < 0) return 0;
    if (n <= 1) return n * 100;
    return n;
}

function formatDateStable(value) {
    if (!value) return '-';
    var raw = String(value).trim();

    // Keep date-only values as-is (no timezone conversion).
    var dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        var d = new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // For ISO timestamps from backend (without timezone), use the date part directly.
    var isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) {
        var d2 = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        return d2.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // For RFC/GMT strings, render in UTC to avoid local timezone date rollover.
    var parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
        var useUtc = /GMT|UTC/i.test(raw);
        return parsed.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: useUtc ? 'UTC' : undefined
        });
    }
    return raw;
}

function setupReportsActions() {
    var generateBtn = document.getElementById('generateMonthlyReportBtn');
    var exportBtn = document.getElementById('exportMonthlyReportCsvBtn');
    var reportOutput = document.getElementById('monthlyReportOutput');

    if (generateBtn) {
        generateBtn.addEventListener('click', generateMonthlyReport);
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', exportMonthlyReport);
    }

    if (reportOutput) {
        reportOutput.addEventListener('click', function(e) {
            var target = e.target;
            if (!target || target.tagName !== 'BUTTON') return;
            var action = target.getAttribute('data-report-action');
            var report = buildMonthlyReport(adminClaimsList);
            if (!report.rows.length) {
                showNotification('No monthly claims available to export', 'error');
                return;
            }
            if (action === 'download-pdf') {
                downloadMonthlyReportPdf(report);
                showNotification('Monthly report downloaded as PDF', 'success');
            }
        });
    }
}

function generateMonthlyReport() {
    var report = buildMonthlyReport(adminClaimsList);
    renderMonthlyReport(report);
    showNotification('Monthly report generated', 'success');
}

function exportMonthlyReport() {
    var report = buildMonthlyReport(adminClaimsList);
    if (!report.rows.length) {
        showNotification('No monthly claims available to export', 'error');
        return;
    }
    exportMonthlyReportCsv(report);
    showNotification('Monthly report exported as CSV', 'success');
}

// Load admin dashboard data (API first, then localStorage)
function loadAdminData() {
    function render(claims) {
        claims = claims || [];
        claims = claims.map(function(c) {
            var fraudProbRaw = c.fraudProbability != null ? c.fraudProbability : c.fraud_probability;
            var fraudProbNum = null;
            if (fraudProbRaw != null) {
                if (typeof fraudProbRaw === 'string') {
                    var cleaned = fraudProbRaw.replace('%', '').trim();
                    var parsed = parseFloat(cleaned);
                    fraudProbNum = isNaN(parsed) ? null : parsed;
                } else {
                    var parsedNum = Number(fraudProbRaw);
                    fraudProbNum = isNaN(parsedNum) ? null : parsedNum;
                }
            }
            var fraudProbPct = fraudProbNum == null ? null : (fraudProbNum <= 1 ? fraudProbNum * 100 : fraudProbNum);
            var mappedStatus = c.status || 'pending';
            var mappedMode = c.approvalMode || c.approval_mode;

            return {
                claimId: c.claimId || c.claim_id,
                name: c.name,
                policyNumber: c.policyNumber || c.policy_number,
                email: c.email || c.user_email,
                mobile: c.mobile,
                patientName: c.patientName || c.patient_name,
                hospitalName: c.hospitalName || c.hospital_name,
                totalAmount: c.totalAmount != null ? c.totalAmount : c.total_amount,
                submittedDate: c.submittedDate || c.submitted_date,
                approvedDate: c.approvedDate || c.approved_date,
                admissionDate: c.admissionDate || c.admission_date,
                dischargeDate: c.dischargeDate || c.discharge_date,
                status: mappedStatus,
                diagnosis: c.diagnosis,
                claimType: c.claimType || c.claim_type,
                fraudFlag: c.fraudFlag != null ? c.fraudFlag : c.fraud_flag,
                fraudProbability: c.fraudProbability != null ? c.fraudProbability : c.fraud_probability,
                riskLevel: c.riskLevel || c.risk_level,
                riskScore: c.riskScore != null ? c.riskScore : c.risk_score,
                approvalMode: mappedMode,
                approvedAmount: c.approvedAmount != null ? c.approvedAmount : c.approved_amount
            };
        });
        adminClaimsList = claims;
        updateSummaryCards(claims);
        updateClaimsTable(claims);
        updateUsersTable(claims, adminUsersList);
        renderCharts(claims);
        renderMonthlyReport(buildMonthlyReport(claims));
    }

    function loadUsersList() {
        if (window.MediClaimAPI && window.MediClaimAPI.users && window.MediClaimAPI.users.list) {
            return window.MediClaimAPI.users.list().then(function (res) {
                return Array.isArray(res) ? res : [];
            }).catch(function () {
                return adminUsersList || [];
            });
        }
        return Promise.resolve(adminUsersList || []);
    }

    loadUsersList().then(function (usersRes) {
        adminUsersList = usersRes.map(function (u) {
            return {
                name: u.name || '-',
                email: u.email || '-',
                policyNumber: u.policy_number || u.policyNumber || '-',
                mobile: u.mobile || '-',
                totalClaims: 0,
                totalAmount: 0
            };
        });
        if (window.MediClaimAPI && window.MediClaimAPI.claims) {
            window.MediClaimAPI.claims.listAdmin()
                .then(function(res) {
                    if (Array.isArray(res)) {
                        render(res);
                    } else if (res && res.claims) {
                        render(res.claims);
                    } else {
                        render([]);
                    }
                })
                .catch(function(err) {
                    console.error('Admin claims load error:', err);
                    render([]);
                });
        } else {
            render([]);
        }
        loadSupportTickets();
    });
}

function loadSupportTickets() {
    var tbody = document.getElementById('adminSupportTbody');
    if (!tbody) return;
    if (!(window.MediClaimAPI && window.MediClaimAPI.support && window.MediClaimAPI.support.getAdminTickets)) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">Support API unavailable.</td></tr>';
        return;
    }
    tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">Loading support complaints...</td></tr>';
    window.MediClaimAPI.support.getAdminTickets().then(function(tickets) {
        adminSupportTickets = Array.isArray(tickets) ? tickets : [];
        if (!adminSupportTickets.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">No support complaints found.</td></tr>';
            return;
        }
        tbody.innerHTML = adminSupportTickets.map(function(t) {
            var status = String(t.status || 'open').toLowerCase();
            var statusCls = status === 'answered' ? 'status-approved' : 'status-pending';
            var existingReply = t.admin_reply ? '<div style="margin-bottom:0.5rem;"><small><strong>Last:</strong> ' + escHtml(t.admin_reply) + '</small></div>' : '';
            return '<tr>' +
                '<td>' + escHtml(t.id) + '</td>' +
                '<td>' + escHtml(t.user_email || '-') + '</td>' +
                '<td>' + escHtml(t.subject || '-') + '</td>' +
                '<td>' + escHtml(t.message || '-') + '</td>' +
                '<td><span class="status-badge ' + statusCls + '">' + escHtml(status.toUpperCase()) + '</span></td>' +
                '<td>' + existingReply +
                    '<textarea id="supportReplyInput-' + escHtml(t.id) + '" class="remarks-input" rows="2" placeholder="Write admin reply..."></textarea>' +
                    '<button type="button" class="btn btn-sm btn-primary reply-support-btn" data-ticket-id="' + escHtml(t.id) + '" style="margin-top:0.5rem;">Send Reply</button>' +
                '</td>' +
            '</tr>';
        }).join('');
    }).catch(function() {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">Failed to load support complaints.</td></tr>';
    });
}

function escHtml(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function renderCharts(claims) {
    if (typeof Chart === 'undefined') return;
    var safeClaims = claims || [];

    // Build last 12 months labels.
    var now = new Date();
    var monthLabels = [];
    var monthKeys = [];
    for (var i = 11; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthLabels.push(d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
        monthKeys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }

    var monthlyCounts = {};
    var monthlyFraud = {};
    monthKeys.forEach(function(k) { monthlyCounts[k] = 0; monthlyFraud[k] = 0; });

    var approved = 0, rejected = 0, pending = 0;
    safeClaims.forEach(function(c) {
        var sd = new Date(c.submittedDate || c.submitted_date || 0);
        if (!isNaN(sd.getTime())) {
            var key = sd.getFullYear() + '-' + String(sd.getMonth() + 1).padStart(2, '0');
            if (monthlyCounts[key] != null) monthlyCounts[key] += 1;
            if (monthlyFraud[key] != null && Number(c.fraudFlag) === 1) monthlyFraud[key] += 1;
        }
        var st = String(c.status || 'pending').toLowerCase();
        if (st === 'approved' || st === 'settled') approved += 1;
        else if (st === 'rejected') rejected += 1;
        else pending += 1;
    });

    var monthlyValues = monthKeys.map(function(k) { return monthlyCounts[k] || 0; });
    var fraudValues = monthKeys.map(function(k) { return monthlyFraud[k] || 0; });

    var barEl = document.getElementById('claimsBarChart');
    if (barEl) {
        if (claimsBarChart) claimsBarChart.destroy();
        claimsBarChart = new Chart(barEl.getContext('2d'), {
            type: 'bar',
            data: {
                labels: monthLabels,
                datasets: [{
                    label: 'Claim Submissions',
                    data: monthlyValues,
                    backgroundColor: 'rgba(33, 150, 243, 0.65)',
                    borderColor: 'rgba(33, 150, 243, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.8,
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    var pieEl = document.getElementById('statusPieChart');
    if (pieEl) {
        if (statusPieChart) statusPieChart.destroy();
        statusPieChart = new Chart(pieEl.getContext('2d'), {
            type: 'pie',
            data: {
                labels: ['Approved', 'Rejected', 'Pending'],
                datasets: [{
                    data: [approved, rejected, pending],
                    backgroundColor: ['#66bb6a', '#ef5350', '#ffca28']
                }]
            },
            options: { responsive: true, maintainAspectRatio: true, aspectRatio: 1.5 }
        });
    }

    var lineEl = document.getElementById('fraudLineChart');
    if (lineEl) {
        if (fraudLineChart) fraudLineChart.destroy();
        fraudLineChart = new Chart(lineEl.getContext('2d'), {
            type: 'line',
            data: {
                labels: monthLabels,
                datasets: [{
                    label: 'Fraud Detected',
                    data: fraudValues,
                    borderColor: 'rgba(244, 67, 54, 1)',
                    backgroundColor: 'rgba(244, 67, 54, 0.2)',
                    fill: false,
                    tension: 0.25
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.9,
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }
}

function buildMonthlyReport(claims) {
    var now = new Date();
    var month = now.getMonth();
    var year = now.getFullYear();
    var safeClaims = (claims || []).filter(function(c) {
        var submitted = new Date(c.submittedDate || c.submitted_date || 0);
        return submitted.getMonth() === month && submitted.getFullYear() === year;
    });

    var totals = {
        totalClaims: safeClaims.length,
        totalAmount: 0,
        approved: 0,
        rejected: 0,
        pending: 0
    };

    safeClaims.forEach(function(c) {
        var amount = Number(c.totalAmount != null ? c.totalAmount : c.total_amount) || 0;
        totals.totalAmount += amount;
        if (c.status === 'approved' || c.status === 'settled') totals.approved += 1;
        else if (c.status === 'rejected') totals.rejected += 1;
        else totals.pending += 1;
    });

    var rows = safeClaims.map(function(c) {
        return {
            claimId: c.claimId || c.claim_id || '',
            policyHolder: c.name || '',
            policyNumber: c.policyNumber || c.policy_number || '',
            patientName: c.patientName || c.patient_name || c.name || '',
            hospitalName: c.hospitalName || c.hospital_name || '',
            claimType: c.claimType || c.claim_type || '',
            diagnosis: c.diagnosis || '',
            amount: Number(c.totalAmount != null ? c.totalAmount : c.total_amount) || 0,
            status: c.status || 'pending',
            submittedDate: c.submittedDate || c.submitted_date || ''
        };
    });

    return { month: month, year: year, rows: rows, totals: totals };
}

function renderMonthlyReport(report) {
    var output = document.getElementById('monthlyReportOutput');
    if (!output) return;

    var monthName = new Date(report.year, report.month, 1).toLocaleString('en-US', { month: 'long' });
    var currency = '₹ ' + Number(report.totals.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    var summaryHtml =
        '<div class="support-info">' +
        '<p><strong>Report Period:</strong> ' + monthName + ' ' + String(report.year) + '</p>' +
        '<p><strong>Total Claims:</strong> ' + String(report.totals.totalClaims) + '</p>' +
        '<p><strong>Total Claim Amount:</strong> ' + currency + '</p>' +
        '<p><strong>Approved:</strong> ' + String(report.totals.approved) +
        ' | <strong>Rejected:</strong> ' + String(report.totals.rejected) +
        ' | <strong>Pending:</strong> ' + String(report.totals.pending) + '</p>' +
        '<div class="form-actions" style="margin-top: 0.75rem;">' +
        '<button type="button" class="btn btn-secondary" data-report-action="download-pdf">Download PDF</button>' +
        '</div>' +
        '</div>';

    output.innerHTML = summaryHtml;
}

function downloadMonthlyReportPdf(report) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showNotification('PDF library not loaded. Please refresh and try again.', 'error');
        return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'pt', format: 'a4' });
    var monthStr = String(report.month + 1).padStart(2, '0');
    var titleMonth = new Date(report.year, report.month, 1).toLocaleString('en-US', { month: 'long' });
    var pageWidth = doc.internal.pageSize.getWidth();
    var y = 40;

    doc.setFontSize(16);
    doc.text('Monthly Claims Report', 40, y);
    y += 24;

    doc.setFontSize(11);
    doc.text('Report Period: ' + titleMonth + ' ' + String(report.year), 40, y); y += 16;
    doc.text('Total Claims: ' + String(report.totals.totalClaims), 40, y); y += 16;
    doc.text('Total Claim Amount: INR ' + Number(report.totals.totalAmount || 0).toLocaleString('en-IN'), 40, y); y += 16;
    doc.text('Approved: ' + String(report.totals.approved) + '   Rejected: ' + String(report.totals.rejected) + '   Pending: ' + String(report.totals.pending), 40, y); y += 24;
    doc.text('Claim Details', 40, y); y += 16;

    report.rows.forEach(function(r, idx) {
        var line = String(idx + 1) + '. ' + (r.claimId || '-') + ' | ' + (r.policyHolder || '-') + ' | INR ' + Number(r.amount || 0).toLocaleString('en-IN') + ' | ' + (r.status || 'pending');
        var wrapped = doc.splitTextToSize(line, pageWidth - 80);
        if (y + (wrapped.length * 14) > 800) {
            doc.addPage();
            y = 40;
        }
        doc.text(wrapped, 40, y);
        y += (wrapped.length * 14) + 4;
    });

    doc.save('monthly-claims-report-' + String(report.year) + '-' + monthStr + '.pdf');
}

function csvEscape(value) {
    var str = value == null ? '' : String(value);
    if (str.indexOf('"') !== -1 || str.indexOf(',') !== -1 || str.indexOf('\n') !== -1) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function exportMonthlyReportCsv(report) {
    var headers = [
        'Claim ID',
        'Policy Holder',
        'Policy Number',
        'Patient Name',
        'Hospital Name',
        'Claim Type',
        'Diagnosis',
        'Amount',
        'Status',
        'Submitted Date'
    ];

    var lines = [headers.join(',')];
    report.rows.forEach(function(r) {
        lines.push([
            csvEscape(r.claimId),
            csvEscape(r.policyHolder),
            csvEscape(r.policyNumber),
            csvEscape(r.patientName),
            csvEscape(r.hospitalName),
            csvEscape(r.claimType),
            csvEscape(r.diagnosis),
            csvEscape(r.amount),
            csvEscape(r.status),
            csvEscape(r.submittedDate)
        ].join(','));
    });

    lines.push('');
    lines.push('Summary');
    lines.push('Total Claims,' + String(report.totals.totalClaims));
    lines.push('Total Amount,' + String(report.totals.totalAmount));
    lines.push('Approved,' + String(report.totals.approved));
    lines.push('Rejected,' + String(report.totals.rejected));
    lines.push('Pending,' + String(report.totals.pending));

    var csvContent = lines.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var monthStr = String(report.month + 1).padStart(2, '0');
    link.href = url;
    link.download = 'monthly-claims-report-' + String(report.year) + '-' + monthStr + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Update summary cards
function updateSummaryCards(claims) {
    function normalizeStatus(value) {
        return String(value || '').trim().toLowerCase();
    }
    function dateKey(value) {
        if (!value) return '';
        var d = new Date(value);
        if (isNaN(d.getTime())) return '';
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    var todayKey = dateKey(new Date());
    var pending = claims.filter(function(c) { return normalizeStatus(c.status) === 'pending'; }).length;
    var underReview = claims.filter(function(c) {
        var s = normalizeStatus(c.status);
        return s === 'under-review' || s === 'review' || s === 'pending-docs';
    }).length;
    var approvedToday = claims.filter(function(c) {
        var s = normalizeStatus(c.status);
        if (s === 'approved' || s === 'settled') {
            // Backward compatibility: older records may miss approvedDate.
            // In that case, use submittedDate as fallback for approved/settled claims.
            var approvedKey = dateKey(c.approvedDate || c.approved_date || c.submittedDate || c.submitted_date);
            return approvedKey !== '' && approvedKey === todayKey;
        }
        return false;
    }).length;
    var totalThisMonth = claims.filter(function(c) {
        var d = new Date(c.submittedDate || c.submitted_date || 0);
        var today = new Date();
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }).length;

    var cards = document.querySelectorAll('.summary-number');
    if (cards.length >= 4) {
        cards[0].textContent = String(pending);
        cards[1].textContent = String(underReview);
        cards[2].textContent = String(approvedToday);
        cards[3].textContent = String(totalThisMonth);
    }
}

// Update claims table
function updateClaimsTable(claims) {
    var tbody = document.getElementById('adminClaimsTbody');
    if (!tbody) return;

    claims = claims || [];
    claims.sort(function(a, b) {
        var da = new Date(a.submittedDate || a.submitted_date || 0);
        var db = new Date(b.submittedDate || b.submitted_date || 0);
        return db - da;
    });

    if (claims.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="admin-loading">No claims found.</td></tr>';
        return;
    }

    function esc(s) {
        if (s == null) return '';
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }
    function fmtDate(d) {
        return formatDateStable(d);
    }
    function fmtAmount(n) {
        if (n == null || isNaN(n)) return '₹ 0';
        return '₹ ' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }
    function statusClass(s) {
        if (s === 'approved' || s === 'settled') return 'status-approved';
        if (s === 'rejected') return 'status-rejected';
        return 'status-pending';
    }
    function statusLabel(s) {
        if (s === 'approved') return 'Approved';
        if (s === 'settled') return 'Settled';
        if (s === 'rejected') return 'Rejected';
        if (s === 'under-review' || s === 'review') return 'Under Review';
        if (s === 'pending-docs') return 'Pending Docs';
        return 'Pending';
    }
    function fraudClass(c) {
        if (isHighAmountShortStay(c)) return 'status-rejected';
        if (Number(c.fraudFlag) === 1) return 'status-rejected';
        var lvl = String(c.riskLevel || '').toLowerCase();
        if (!lvl) {
            var derived = deriveRiskFromMetrics(c);
            if (derived === 'high') return 'status-rejected';
            if (derived === 'medium') return 'status-pending';
            return 'status-approved';
        }
        if (lvl === 'high') return 'status-rejected';
        if (lvl === 'medium') return 'status-pending';
        return 'status-approved';
    }
    function fraudLabel(c) {
        if (isHighAmountShortStay(c)) return 'High Risk (Anomaly)';
        if (Number(c.fraudFlag) === 1) return 'Fraud Alert';
        var lvl = String(c.riskLevel || '').toLowerCase();
        var score = c.riskScore != null ? Number(c.riskScore) : null;
        if (!lvl) lvl = deriveRiskFromMetrics(c);
        if (lvl === 'high') return 'High Risk' + (score != null && !isNaN(score) ? ' (' + score + ')' : '');
        if (lvl === 'medium') return 'Medium Risk' + (score != null && !isNaN(score) ? ' (' + score + ')' : '');
        return 'Low Risk' + (score != null && !isNaN(score) ? ' (' + score + ')' : '');
    }
    function deriveRiskFromMetrics(c) {
        var fpRaw = c.fraudProbability != null ? c.fraudProbability : c.fraud_probability;
        var fp = Number(fpRaw);
        var pct = !isNaN(fp) ? (fp <= 1 ? fp * 100 : fp) : null;
        if (pct != null) {
            if (pct > 75) return 'high';
            if (pct > 10) return 'medium';
            return 'low';
        }
        var score = Number(c.riskScore != null ? c.riskScore : c.risk_score);
        if (!isNaN(score)) {
            if (score > 75) return 'high';
            if (score > 10) return 'medium';
            return 'low';
        }
        return 'low';
    }
    function decisionClass(mode) {
        var m = String(mode || '').toUpperCase();
        if (m === 'AUTO_APPROVED' || m === 'AUTO') return 'status-approved';
        if (m === 'AUTO_REJECTED') return 'status-rejected';
        if (m === 'MANUAL_REVIEW' || m === 'MANUAL_REQUIRED') return 'status-pending';
        return 'status-pending';
    }
    function decisionLabel(mode) {
        var m = String(mode || '').toUpperCase();
        if (m === 'AUTO_APPROVED' || m === 'AUTO') return 'Auto Approved';
        if (m === 'AUTO_REJECTED') return 'Auto Rejected';
        if (m === 'MANUAL_REVIEW' || m === 'MANUAL_REQUIRED') return 'Manual Review';
        return 'Manual Review';
    }
    function isHighAmountShortStay(c) {
        var amount = Number(c.totalAmount != null ? c.totalAmount : c.total_amount) || 0;
        var ad = c.admissionDate || c.admission_date;
        var dd = c.dischargeDate || c.discharge_date;
        if (!ad || !dd) return false;
        var d1 = new Date(ad);
        var d2 = new Date(dd);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
        var days = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
        return days <= 1 && amount >= 200000;
    }

    var html = claims.map(function(c) {
        var id = esc(c.claimId || c.claim_id || '-');
        var name = esc(c.name || '-');
        var policy = esc(c.policyNumber || c.policy_number || '-');
        var patient = esc(c.patientName || c.patient_name || c.name || '-');
        var hospital = esc(c.hospitalName || c.hospital_name || '-');
        var amount = fmtAmount(c.totalAmount != null ? c.totalAmount : c.total_amount);
        var submitted = fmtDate(c.submittedDate || c.submitted_date);
        var status = c.status || 'pending';
        var fraud = '<span class="status-badge ' + fraudClass(c) + '">' + esc(fraudLabel(c)) + '</span>';
        var decision = '<span class="status-badge ' + decisionClass(c.approvalMode) + '">' + esc(decisionLabel(c.approvalMode)) + '</span>';
        var canReview = status === 'pending' || status === 'under-review' || status === 'review' || status === 'pending-docs';
        var btn = canReview
            ? '<button class="btn btn-sm btn-primary" onclick="openClaimModal(\'' + id.replace(/'/g, "\\'") + '\')">Review</button>'
            : '<button class="btn btn-sm btn-secondary" onclick="openClaimModal(\'' + id.replace(/'/g, "\\'") + '\')">View</button>';
        return '<tr><td>' + id + '</td><td>' + name + '<br><small>' + policy + '</small></td><td>' + patient + '</td><td>' + hospital + '</td><td>' + amount + '</td><td>' + submitted + '</td><td>' + fraud + '</td><td>' + decision + '</td><td><span class="status-badge ' + statusClass(status) + '">' + esc(statusLabel(status)) + '</span></td><td>' + btn + '</td></tr>';
    }).join('');
    tbody.innerHTML = html;
}

function updateUsersTable(claims, registeredUsers) {
    var tbody = document.getElementById('adminUsersTbody');
    if (!tbody) return;

    var safeClaims = claims || [];
    var usersMap = {};

    safeClaims.forEach(function(c) {
        var key = (c.email || '').trim().toLowerCase() || (c.policyNumber || '').trim().toLowerCase() || (c.name || '').trim().toLowerCase();
        if (!key) return;
        if (!usersMap[key]) {
            usersMap[key] = {
                name: c.name || '-',
                email: c.email || '-',
                policyNumber: c.policyNumber || '-',
                mobile: c.mobile || '-',
                totalClaims: 0,
                totalAmount: 0
            };
        }
        usersMap[key].totalClaims += 1;
        // Customer-level total should reflect credited/approved amount,
        // not demanded amount. Fallback to totalAmount only if unavailable.
        var creditedAmount = Number(c.approvedAmount);
        if (isNaN(creditedAmount)) creditedAmount = Number(c.totalAmount) || 0;
        usersMap[key].totalAmount += creditedAmount;
    });

    (registeredUsers || []).forEach(function (u) {
        var key = (u.email || '').trim().toLowerCase();
        if (!key) return;
        if (!usersMap[key]) {
            usersMap[key] = {
                name: u.name || '-',
                email: u.email || '-',
                policyNumber: u.policyNumber || '-',
                mobile: u.mobile || '-',
                totalClaims: 0,
                totalAmount: 0
            };
        }
    });

    var users = Object.keys(usersMap).map(function(k) { return usersMap[k]; });
    users.sort(function(a, b) { return b.totalClaims - a.totalClaims; });

    function esc(s) {
        if (s == null) return '';
        var div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }
    function fmtAmount(n) {
        return '₹ ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="admin-loading">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(function(u) {
        return '<tr>' +
            '<td>' + esc(u.name) + '</td>' +
            '<td>' + esc(u.email) + '</td>' +
            '<td>' + esc(u.policyNumber) + '</td>' +
            '<td>' + esc(u.mobile) + '</td>' +
            '<td>' + String(u.totalClaims) + '</td>' +
            '<td>' + fmtAmount(u.totalAmount) + '</td>' +
            '<td><span class="status-badge status-active">Active</span></td>' +
            '<td><button class="btn btn-sm btn-text">View</button> <button class="btn btn-sm btn-text">Edit</button></td>' +
            '</tr>';
    }).join('');
}

// Open claim review modal
function openClaimModal(claimId) {
    const modal = document.getElementById('claimModal');
    const modalClaimId = document.getElementById('modalClaimId');
    
    if (modal && modalClaimId) {
        modalClaimId.textContent = claimId;
        modal.style.display = 'flex';
        
        // Load claim data
        loadClaimDetails(claimId);
    }
}

// Close claim review modal
function closeClaimModal() {
    const modal = document.getElementById('claimModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Load claim details into modal
function loadClaimDetails(claimId) {
    var claim = adminClaimsList.filter(function(c) {
        var id = c.claimId || c.claim_id;
        return id && String(id) === String(claimId);
    })[0];
    if (!claim) {
        claim = (JSON.parse(localStorage.getItem('claims') || '[]')).filter(function(c) {
            return (c.claimId || c.claim_id) === claimId;
        })[0];
    }
    function set(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val != null ? String(val) : '-';
    }
    function fmtDate(d) {
        var stable = formatDateStable(d);
        if (stable === '-') return stable;
        var parsed = new Date(stable);
        if (!isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        return stable;
    }
    function fmtAmount(n) {
        if (n == null || isNaN(n)) return '₹ 0';
        return '₹ ' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }
    function renderUploadedFiles(docs) {
        var container = document.getElementById('modalUploadedFiles');
        if (!container) return;
        if (!Array.isArray(docs) || docs.length === 0) {
            container.innerHTML = '<p>No files uploaded for this claim yet.</p>';
            return;
        }
        var html = '<ul style="margin:0; padding-left: 1rem;">';
        docs.forEach(function(doc) {
            var fileName = escHtml(doc.filename || 'Unnamed file');
            var docType = escHtml(doc.document_type || doc.documentType || 'Document');
            var uploadedAt = formatDateStable(doc.uploaded_at || doc.uploadedAt);
            html += '<li><strong>' + fileName + '</strong> (' + docType + ') - Uploaded: ' + escHtml(uploadedAt) + '</li>';
        });
        html += '</ul>';
        container.innerHTML = html;
    }
    var filesContainer = document.getElementById('modalUploadedFiles');
    if (filesContainer) {
        filesContainer.innerHTML = '<p>Loading uploaded files...</p>';
    }
    if (claim) {
        var normalizedPct = normalizeProbabilityToPercent(claim.fraudProbability);
        var fraudPct = normalizedPct != null ? Math.round(normalizedPct) : null;
        var fraudText = Number(claim.fraudFlag) === 1
            ? 'Fraud Alert'
            : ((claim.riskLevel ? String(claim.riskLevel).toUpperCase() + ' risk' : 'Unknown risk') + (fraudPct != null && !isNaN(fraudPct) ? ' (' + String(fraudPct) + '%)' : ''));
        set('modalPolicyHolder', claim.name);
        set('modalPatient', claim.patientName || claim.patient_name || claim.name);
        set('modalHospital', (claim.hospitalName || claim.hospital_name) + (claim.hospitalAddress || claim.hospital_address ? ' - ' + (claim.hospitalAddress || claim.hospital_address) : ''));
        set('modalTreatment', claim.diagnosis || claim.claimType || claim.claim_type || '-');
        set('modalAmount', fmtAmount(claim.totalAmount != null ? claim.totalAmount : claim.total_amount));
        set('modalSubmittedDate', fmtDate(claim.submittedDate || claim.submitted_date));
        set('modalFraudRisk', fraudText);
        set('modalDecisionType', (function(m) {
            m = String(m || '').toUpperCase();
            if (m === 'AUTO_APPROVED' || m === 'AUTO') return 'Auto Approved';
            if (m === 'AUTO_REJECTED') return 'Auto Rejected';
            if (m === 'MANUAL_REVIEW' || m === 'MANUAL_REQUIRED') return 'Manual Review';
            return 'Manual Review';
        })(claim.approvalMode || claim.approval_mode));
    } else {
        set('modalPolicyHolder', '-');
        set('modalPatient', '-');
        set('modalHospital', '-');
        set('modalTreatment', '-');
        set('modalAmount', '-');
        set('modalSubmittedDate', '-');
        set('modalFraudRisk', '-');
        set('modalDecisionType', '-');
    }

    if (window.MediClaimAPI && window.MediClaimAPI.documents && window.MediClaimAPI.documents.getClaimDocuments) {
        window.MediClaimAPI.documents.getClaimDocuments(claimId)
            .then(function(docs) {
                renderUploadedFiles(docs);
            })
            .catch(function() {
                if (filesContainer) {
                    filesContainer.innerHTML = '<p>Unable to load uploaded files for this claim.</p>';
                }
            });
    } else if (filesContainer) {
        filesContainer.innerHTML = '<p>Document API unavailable.</p>';
    }
}

// Approve claim
function approveClaim() {
    var modalClaimId = document.getElementById('modalClaimId') && document.getElementById('modalClaimId').textContent;
    var remarks = (document.getElementById('adminRemarks') && document.getElementById('adminRemarks').value) || '';
    if (!modalClaimId) {
        showNotification('Claim ID not found', 'error');
        return;
    }
    function doLocalApprove() {
        var claims = JSON.parse(localStorage.getItem('claims') || '[]');
        var claimIndex = claims.findIndex(function(c) { return c.claimId === modalClaimId; });
        if (claimIndex !== -1) {
            claims[claimIndex].status = 'approved';
            claims[claimIndex].approvedDate = new Date().toISOString();
            claims[claimIndex].adminRemarks = remarks;
            localStorage.setItem('claims', JSON.stringify(claims));
            showNotification('Claim approved successfully!', 'success');
            closeClaimModal();
            setTimeout(function() { window.location.reload(); }, 1000);
        } else {
            showNotification('Claim not found', 'error');
        }
    }
    if (window.MediClaimAPI && window.MediClaimAPI.claims) {
        window.MediClaimAPI.claims.update(modalClaimId, { status: 'approved', adminRemarks: remarks, approved: true })
            .then(function() {
                showNotification('Claim approved successfully!', 'success');
                closeClaimModal();
                setTimeout(function() { window.location.reload(); }, 1000);
            })
            .catch(function() {
                doLocalApprove();
            });
    } else {
        doLocalApprove();
    }
}

// Reject claim
function rejectClaim() {
    var modalClaimId = document.getElementById('modalClaimId') && document.getElementById('modalClaimId').textContent;
    var remarks = document.getElementById('adminRemarks') && document.getElementById('adminRemarks').value;
    if (!modalClaimId) {
        showNotification('Claim ID not found', 'error');
        return;
    }
    if (!remarks || remarks.trim().length < 10) {
        showNotification('Please provide rejection remarks (minimum 10 characters)', 'error');
        return;
    }
    if (!confirm('Are you sure you want to reject this claim?')) return;
    function doLocalReject() {
        var claims = JSON.parse(localStorage.getItem('claims') || '[]');
        var claimIndex = claims.findIndex(function(c) { return c.claimId === modalClaimId; });
        if (claimIndex !== -1) {
            claims[claimIndex].status = 'rejected';
            claims[claimIndex].rejectedDate = new Date().toISOString();
            claims[claimIndex].adminRemarks = remarks;
            localStorage.setItem('claims', JSON.stringify(claims));
            showNotification('Claim rejected', 'error');
            closeClaimModal();
            setTimeout(function() { window.location.reload(); }, 1000);
        } else {
            showNotification('Claim not found', 'error');
        }
    }
    if (window.MediClaimAPI && window.MediClaimAPI.claims) {
        window.MediClaimAPI.claims.update(modalClaimId, { status: 'rejected', adminRemarks: remarks })
            .then(function() {
                showNotification('Claim rejected', 'error');
                closeClaimModal();
                setTimeout(function() { window.location.reload(); }, 1000);
            })
            .catch(function() {
                doLocalReject();
            });
    } else {
        doLocalReject();
    }
}

// Request more info
function requestMoreInfo() {
    var modalClaimId = document.getElementById('modalClaimId') && document.getElementById('modalClaimId').textContent;
    var remarks = document.getElementById('adminRemarks') && document.getElementById('adminRemarks').value;
    if (!modalClaimId) {
        showNotification('Claim ID not found', 'error');
        return;
    }
    if (!remarks || remarks.trim().length < 10) {
        showNotification('Please specify what additional information is needed (minimum 10 characters)', 'error');
        return;
    }
    function doLocalRequest() {
        var claims = JSON.parse(localStorage.getItem('claims') || '[]');
        var claimIndex = claims.findIndex(function(c) { return c.claimId === modalClaimId; });
        if (claimIndex !== -1) {
            claims[claimIndex].status = 'pending-docs';
            claims[claimIndex].statusMessage = 'Additional documents required';
            claims[claimIndex].adminRemarks = remarks;
            localStorage.setItem('claims', JSON.stringify(claims));
            showNotification('Request sent to user for additional information', 'success');
            closeClaimModal();
            setTimeout(function() { window.location.reload(); }, 1000);
        } else {
            showNotification('Claim not found', 'error');
        }
    }
    if (window.MediClaimAPI && window.MediClaimAPI.claims) {
        window.MediClaimAPI.claims.update(modalClaimId, { status: 'pending-docs', adminRemarks: remarks })
            .then(function() {
                showNotification('Request sent to user for additional information', 'success');
                closeClaimModal();
                setTimeout(function() { window.location.reload(); }, 1000);
            })
            .catch(function() {
                doLocalRequest();
            });
    } else {
        doLocalRequest();
    }
}

// Show notification helper
function showNotification(message, type = 'success') {
    if (typeof window.showNotification === 'function' && window.showNotification !== showNotification) {
        window.showNotification(message, type);
    } else {
        alert(message);
    }
}

// Make functions globally available
window.openClaimModal = openClaimModal;
window.closeClaimModal = closeClaimModal;
window.approveClaim = approveClaim;
window.rejectClaim = rejectClaim;
window.requestMoreInfo = requestMoreInfo;
window.generateMonthlyReport = generateMonthlyReport;
window.exportMonthlyReport = exportMonthlyReport;
window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('claimModal');
    if (modal && e.target === modal) {
        closeClaimModal();
    }
    const userModal = document.getElementById('userModal');
    if (userModal && e.target === userModal) {
        closeUserModal();
    }
});

