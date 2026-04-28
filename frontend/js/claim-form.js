// claim-form.js
// Multi-step claim form with empty fields for user input

let currentStep = 1;
const totalSteps = 5;

document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    setupExpenseCalculation();
    setupFileUploads();
    setTopbarFromUser();
    prefillFromLoggedInUser();

    const claimForm = document.getElementById('claimForm');
    if (claimForm) claimForm.addEventListener('submit', handleFormSubmit);

    // Default claim date to today
    const claimDateInput = document.getElementById('claimDate');
    if (claimDateInput) {
        const today = new Date().toISOString().split('T')[0];
        claimDateInput.value = today;
    }

    // Discharge date min based on admission date
    const admissionDateInput = document.getElementById('admissionDate');
    const dischargeDateInput = document.getElementById('dischargeDate');

    if (admissionDateInput && dischargeDateInput) {
        admissionDateInput.addEventListener('change', function() {
            dischargeDateInput.min = this.value;
            if (dischargeDateInput.value && dischargeDateInput.value < this.value) {
                dischargeDateInput.value = this.value;
            }
        });
    }
});

// Show logged-in user in topbar
function setTopbarFromUser() {
    try {
        const userStr = localStorage.getItem('user');
        const userNameEl = document.getElementById('topbarUserName');
        const userAvatarEl = document.getElementById('topbarUserAvatar');
        if (!userNameEl || !userAvatarEl) return;
        if (userStr) {
            const user = JSON.parse(userStr);
            const name = (user && user.name) ? String(user.name).trim() : 'User';
            userNameEl.textContent = name;
            userAvatarEl.textContent = name.split(/\s+/).map(function(s) { return s.charAt(0); }).join('').toUpperCase().slice(0, 2) || 'U';
        } else {
            userNameEl.textContent = 'User';
            userAvatarEl.textContent = 'U';
        }
    } catch (e) {}
}

// Pre-fill personal details from logged-in user
function prefillFromLoggedInUser() {
    try {
        const userStr = localStorage.getItem('user');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        if (!user) return;
        const nameEl = document.getElementById('claimName');
        const policyEl = document.getElementById('claimPolicyNumber');
        const emailEl = document.getElementById('claimEmail');
        const mobileEl = document.getElementById('claimMobile');
        if (nameEl && user.name) nameEl.value = String(user.name).trim();
        if (policyEl && user.policyNumber) policyEl.value = String(user.policyNumber).trim();
        if (emailEl && user.email) emailEl.value = String(user.email).trim();
        if (mobileEl && user.mobile) mobileEl.value = String(user.mobile).trim();
    } catch (e) {}
}

// Initialize form
function initializeForm() {
    updateProgressBar();
    showStep(currentStep);

    const today = new Date().toISOString().split('T')[0];
    const claimDateInput = document.getElementById('claimDate');
    const admissionDateInput = document.getElementById('admissionDate');

    if (claimDateInput) claimDateInput.max = today;
    if (admissionDateInput) admissionDateInput.max = today;
}

// Next and previous steps
function nextStep(step) {
    if (!validateCurrentStep()) return;
    if (step <= totalSteps) {
        currentStep = step;
        updateProgressBar();
        showStep(currentStep);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function prevStep(step) {
    if (step >= 1) {
        currentStep = step;
        updateProgressBar();
        showStep(currentStep);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Show step
function showStep(step) {
    for (let i = 1; i <= totalSteps; i++) {
        const stepElement = document.getElementById(`step${i}`);
        if (stepElement) stepElement.classList.remove('active');
    }
    const currentStepElement = document.getElementById(`step${step}`);
    if (currentStepElement) currentStepElement.classList.add('active');
}

// Progress bar
function updateProgressBar() {
    for (let i = 1; i <= totalSteps; i++) {
        const stepElement = document.querySelector(`.progress-step[data-step="${i}"]`);
        if (stepElement) {
            if (i < currentStep) {
                stepElement.classList.add('completed');
                stepElement.classList.remove('active');
            } else if (i === currentStep) {
                stepElement.classList.add('active');
                stepElement.classList.remove('completed');
            } else {
                stepElement.classList.remove('active', 'completed');
            }
        }
    }
}

// Validate current step
function validateCurrentStep() {
    const stepElement = document.getElementById(`step${currentStep}`);
    if (!stepElement) return false;

    const requiredFields = stepElement.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            field.style.borderColor = '#f44336';
            let errorMsg = field.parentElement.querySelector('.error-message');
            if (!errorMsg) {
                errorMsg = document.createElement('span');
                errorMsg.className = 'error-message';
                field.parentElement.appendChild(errorMsg);
            }
            errorMsg.textContent = 'This field is required';
        } else {
            field.style.borderColor = '';
            const errorMsg = field.parentElement.querySelector('.error-message');
            if (errorMsg) errorMsg.textContent = '';
        }
    });

    if (currentStep === 2) {
        const admissionDate = document.getElementById('admissionDate').value;
        const dischargeDate = document.getElementById('dischargeDate').value;
        if (admissionDate && dischargeDate && new Date(dischargeDate) < new Date(admissionDate)) {
            isValid = false;
            showNotification('Discharge date must be after admission date', 'error');
        }
    }

    if (currentStep === 4) {
        const expenses = ['roomCharges','surgeryCharges','doctorFees','medicineCharges','labCharges','otherCharges','icuCharges'];
        const totalExpense = expenses.reduce((sum, id) => {
            const el = document.getElementById(id);
            return sum + (el ? (parseFloat(el.value) || 0) : 0);
        }, 0);
        if (totalExpense === 0) {
            isValid = false;
            showNotification('Please enter at least one expense amount', 'error');
        }
    }

    if (!isValid) showNotification('Please fill all required fields correctly', 'error');
    return isValid;
}

// Expense calculation — includes icuCharges
function setupExpenseCalculation() {
    const expenseFields = ['roomCharges','surgeryCharges','doctorFees','medicineCharges','labCharges','otherCharges','icuCharges'];
    expenseFields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.addEventListener('input', calculateTotalAmount);
    });
}

function calculateTotalAmount() {
    const fields = ['roomCharges','surgeryCharges','doctorFees','medicineCharges','labCharges','otherCharges','icuCharges'];
    const total = fields.reduce((sum, id) => {
        const el = document.getElementById(id);
        return sum + (el ? (parseFloat(el.value) || 0) : 0);
    }, 0);
    const totalAmountEl = document.getElementById('totalAmount');
    if (totalAmountEl) totalAmountEl.textContent = formatCurrency(total);
}

function compareAmountsWithTolerance(a, b, tolerance) {
    var left = Number(a) || 0;
    var right = Number(b) || 0;
    var diff = Math.abs(left - right);
    return diff <= (Number(tolerance) || 0.01);
}

function verifyUploadedBillAmount(manualTotalAmount) {
    const medicalBillsInput = document.getElementById('medicalBills');
    const billFiles = medicalBillsInput && medicalBillsInput.files ? Array.from(medicalBillsInput.files) : [];
    const billFile = billFiles.find(function (f) {
        return f && String(f.name || '').toLowerCase().endsWith('.pdf');
    }) || null;

    if (billFiles.length === 0) {
        return Promise.resolve({
            ok: false,
            message: 'Please upload a medical bill to verify amount before submission.'
        });
    }

    if (!billFile) {
        return Promise.resolve({
            ok: true,
            skipped: true,
            message: 'Amount verification skipped (no PDF bill uploaded).'
        });
    }

    if (!window.MediClaimAPI || !window.MediClaimAPI.bills || !window.MediClaimAPI.bills.uploadAndExtract) {
        return Promise.resolve({
            ok: true,
            skipped: true,
            message: 'Bill verification service unavailable. Proceeding without amount verification.'
        });
    }

    return window.MediClaimAPI.bills.uploadAndExtract(billFile)
        .then(function (billResult) {
            const extractedAmount = Number(billResult && billResult.amount);
            if (!Number.isFinite(extractedAmount) || extractedAmount <= 0) {
                return {
                    ok: true,
                    skipped: true,
                    message: 'Could not read amount from uploaded PDF. Proceeding without amount verification.'
                };
            }

            if (!compareAmountsWithTolerance(manualTotalAmount, extractedAmount, 1)) {
                return {
                    ok: false,
                    message: 'Amount mismatch: entered ' + formatCurrency(manualTotalAmount) +
                             ' but bill shows ' + formatCurrency(extractedAmount) +
                             '. Claim submission blocked.'
                };
            }

            return {
                ok: true,
                extractedAmount: extractedAmount
            };
        })
        .catch(function (err) {
            var backendMsg = '';
            try {
                backendMsg = err && err.data && (err.data.error || err.data.message) ? String(err.data.error || err.data.message) : '';
            } catch (e) {}

            return {
                ok: true,
                skipped: true,
                message: backendMsg ? ('Bill verification skipped: ' + backendMsg) : 'Bill verification skipped due to service error.'
            };
        });
}

function uploadClaimDocuments(claimId, userEmail) {
    const uploadConfigs = [
        { inputId: 'dischargeSummary', documentType: 'discharge_summary' },
        { inputId: 'medicalBills', documentType: 'medical_bill' },
        { inputId: 'prescription', documentType: 'prescription' },
        { inputId: 'labReports', documentType: 'lab_report' },
        { inputId: 'idProof', documentType: 'id_proof' }
    ];

    const uploads = [];
    uploadConfigs.forEach(function (cfg) {
        const input = document.getElementById(cfg.inputId);
        if (!input || !input.files || input.files.length === 0) return;

        Array.from(input.files).forEach(function (file) {
            const formData = new FormData();
            formData.append('document', file);
            formData.append('email', userEmail);
            formData.append('claim_id', claimId);
            formData.append('documentType', cfg.documentType);
            formData.append('source', 'claim_form');
            uploads.push(
                window.MediClaimAPI.documents.uploadDocument(formData).catch(function () {
                    return null;
                })
            );
        });
    });

    if (uploads.length === 0) return Promise.resolve(0);

    return Promise.all(uploads).then(function (results) {
        return results.filter(function (r) { return !!r; }).length;
    });
}

function uploadClaimBillsToBillCollection() {
    const medicalBillsInput = document.getElementById('medicalBills');
    const billFiles = medicalBillsInput && medicalBillsInput.files ? Array.from(medicalBillsInput.files) : [];
    const pdfBills = billFiles.filter(function (f) {
        return f && String(f.name || '').toLowerCase().endsWith('.pdf');
    });

    if (pdfBills.length === 0) return Promise.resolve(0);
    if (!window.MediClaimAPI || !window.MediClaimAPI.bills || !window.MediClaimAPI.bills.uploadAndExtract) {
        return Promise.resolve(0);
    }

    const uploads = pdfBills.map(function (pdf) {
        return window.MediClaimAPI.bills.uploadAndExtract(pdf).catch(function () {
            return null;
        });
    });

    return Promise.all(uploads).then(function (results) {
        return results.filter(function (r) { return !!r; }).length;
    });
}

// File uploads
function setupFileUploads() {
    const fileInputs = document.querySelectorAll('.file-upload-box input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener('change', function() {
            const fileNameDiv = this.parentElement.querySelector('.file-name');
            if (fileNameDiv) {
                if (this.files.length > 0) {
                    const fileNames = Array.from(this.files).map(f => f.name).join(', ');
                    fileNameDiv.textContent = fileNames;
                    fileNameDiv.style.color = '#4caf50';
                } else fileNameDiv.textContent = '';
            }

            Array.from(this.files).forEach(file => {
                if (file.size > 5 * 1024 * 1024) {
                    showNotification(`${file.name} is too large. Max 5MB`, 'error');
                    this.value = '';
                    if (fileNameDiv) fileNameDiv.textContent = '';
                }
            });
        });
    });
}

// Form submission
function handleFormSubmit(e) {
    e.preventDefault();
    // Keep validator aligned with the visible step even after refresh/back navigation.
    var activeStepEl = document.querySelector('.form-step.active');
    if (activeStepEl && activeStepEl.id) {
        var m = activeStepEl.id.match(/^step(\d+)$/);
        if (m && m[1]) currentStep = parseInt(m[1], 10) || currentStep;
    }
    if (!validateCurrentStep()) return;

    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };
    const getFloat = (id) => {
        const el = document.getElementById(id);
        return el ? (parseFloat(el.value) || 0) : 0;
    };

    const formData = {
        // Step 1
        name:          getVal('claimName'),
        policyNumber:  getVal('claimPolicyNumber'),
        email:         getVal('claimEmail'),
        mobile:        getVal('claimMobile'),
        claimDate:     getVal('claimDate'),
        claimType:     getVal('claimType'),
        // Step 2
        hospitalName:    getVal('hospitalName'),
        hospitalAddress: getVal('hospitalAddress'),
        hospitalCity:    getVal('hospitalCity'),
        hospitalState:   getVal('hospitalState'),
        hospitalPincode: getVal('hospitalPincode'),
        hospitalPhone:   getVal('hospitalPhone'),
        hospitalType:    getVal('hospitalType') || 'Private',
        admissionDate:   getVal('admissionDate'),
        dischargeDate:   getVal('dischargeDate'),
        // Step 3
        patientName:      getVal('patientName'),
        patientAge:       getVal('patientAge'),
        patientRelation:  getVal('patientRelation'),
        doctorName:       getVal('doctorName'),
        diagnosis:        getVal('diagnosis'),
        treatmentDetails: getVal('treatmentDetails'),
        // Step 4
        roomCharges:     getFloat('roomCharges'),
        surgeryCharges:  getFloat('surgeryCharges'),
        doctorFees:      getFloat('doctorFees'),
        medicineCharges: getFloat('medicineCharges'),
        labCharges:      getFloat('labCharges'),
        otherCharges:    getFloat('otherCharges'),
        icuCharges:      getFloat('icuCharges'),
    };

    // Ensure ownership identifiers are always present for API persistence + user/admin visibility.
    try {
        const loggedUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (!formData.email && loggedUser && loggedUser.email) formData.email = String(loggedUser.email).trim();
        if (!formData.policyNumber && loggedUser && loggedUser.policyNumber) formData.policyNumber = String(loggedUser.policyNumber).trim();
    } catch (e) {}

    formData.totalAmount = formData.roomCharges + formData.surgeryCharges +
                           formData.doctorFees  + formData.medicineCharges +
                           formData.labCharges  + formData.otherCharges +
                           formData.icuCharges;

    verifyUploadedBillAmount(formData.totalAmount).then(function (billVerification) {
        if (!billVerification.ok) {
            showNotification(billVerification.message, 'error');
            throw new Error('bill-verification-failed');
        }
        if (billVerification.skipped && billVerification.message) {
            showNotification(billVerification.message, 'info');
        }
        return true;
    }).then(function () {

    // Offline fallback (optional, demo-only): save to localStorage if API fails
    // Keep disabled by default so real submissions always go to PostgreSQL + MongoDB.
    var ALLOW_OFFLINE_CLAIM_SUBMIT = !!window.ALLOW_OFFLINE_CLAIM_SUBMIT;
    function doLocalSubmit() {
            // Local adjudication fallback to keep admin decisions consistent when API is unavailable.
            var admissionDays = 3;
            try {
                if (formData.admissionDate && formData.dischargeDate) {
                    var d1 = new Date(formData.admissionDate);
                    var d2 = new Date(formData.dischargeDate);
                    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
                        admissionDays = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
                    }
                }
            } catch (e) {}

            var amount = Number(formData.totalAmount) || 0;
            var amountPerDay = amount / Math.max(1, admissionDays);
            // Simple local risk estimate (percentage) for offline mode only.
            var fraudProbability = 30;
            if (admissionDays <= 1 && amount >= 200000) fraudProbability = 90;
            else if (admissionDays >= 3 && amountPerDay <= 60000) fraudProbability = 6;
            else if (amount > 150000) fraudProbability = 55;
            else if (amount > 80000) fraudProbability = 35;

            var status = 'pending';
            var approvalMode = 'MANUAL_REVIEW';
            var coverage = 0.6;
            var riskLevel = 'medium';
            if (fraudProbability >= 0 && fraudProbability <= 10) {
                status = 'approved';
                approvalMode = 'AUTO_APPROVED';
                coverage = 0.8;
                riskLevel = 'low';
            } else if (fraudProbability > 10 && fraudProbability <= 40) {
                status = 'pending';
                approvalMode = 'MANUAL_REVIEW';
                coverage = 0.6;
                riskLevel = 'medium';
            } else if (fraudProbability > 40 && fraudProbability <= 75) {
                status = 'pending';
                approvalMode = 'MANUAL_REVIEW';
                coverage = 0.4;
                riskLevel = 'high';
            } else {
                status = 'rejected';
                approvalMode = 'AUTO_REJECTED';
                coverage = 0.0;
                riskLevel = 'high';
            }

            formData.fraudProbability = fraudProbability;
            formData.fraudFlag = fraudProbability > 75 ? 1 : 0;
            formData.riskScore = Math.round(fraudProbability);
            formData.riskLevel = riskLevel;
            formData.status = status;
            formData.approvalMode = approvalMode;
            formData.coveragePercent = coverage;
            formData.approvedAmount = Number((amount * coverage).toFixed(2));

            formData.claimId = 'CLM-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
            formData.submittedDate = new Date().toISOString();
            var claims = JSON.parse(localStorage.getItem('claims') || '[]');
            claims.push(formData);
            localStorage.setItem('claims', JSON.stringify(claims));
            showSuccessScreen(formData.claimId, formData.submittedDate, null);
        }

    if (window.MediClaimAPI && window.MediClaimAPI.claims && window.MediClaimAPI.claims.submit) {
        console.log('Submitting claim to API...');
        window.MediClaimAPI.claims.submit(formData)
            .then(function (res) {
                // API returns claim_id (snake_case)
                const claimId = res.claim_id || res.claimId || formData.claimId;
                const date    = res.submittedDate || new Date().toISOString();
                const userEmail = formData.email;
                Promise.all([
                    uploadClaimBillsToBillCollection(),
                    uploadClaimDocuments(claimId, userEmail)
                ]).finally(function () {
                    showSuccessScreen(claimId, date, res);
                });
            })
            .catch(function (err) {
                console.error('API claim submit failed:', err);
                var backendMsg = '';
                try {
                    backendMsg = err && err.data && (err.data.error || err.data.message) ? String(err.data.error || err.data.message) : '';
                } catch (e) {}
                if (ALLOW_OFFLINE_CLAIM_SUBMIT) {
                    showNotification((backendMsg ? ('Server/API issue: ' + backendMsg + '. ') : 'Server unavailable. ') + 'Claim saved in offline mode.', 'error');
                    doLocalSubmit();
                    return;
                }
                showNotification((backendMsg ? ('Claim submission failed: ' + backendMsg) : 'Claim submission failed. Start backend so data is saved to PostgreSQL and MongoDB.'), 'error');
            });
    } else {
        if (ALLOW_OFFLINE_CLAIM_SUBMIT) {
            doLocalSubmit();
            return;
        }
        showNotification('Backend API is not configured. Claim not submitted to database.', 'error');
    }
    }).catch(function (err) {
        if (err && err.message === 'bill-verification-failed') return;
        showNotification('Claim submission blocked due to bill verification error.', 'error');
    });
}

// Success screen — shows AI result if available
function showSuccessScreen(claimId, submittedDate, apiResult) {
    const successScreen = document.getElementById('successScreen');
    const successClaimId = document.getElementById('successClaimId');
    const successDate = document.getElementById('successDate');

    if (successScreen && successClaimId && successDate) {
        successClaimId.textContent = claimId;
        successDate.textContent = new Date(submittedDate).toLocaleDateString('en-IN', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // Show AI fraud result if available
        if (apiResult) {
            let resultHtml = '';
            const status      = apiResult.status      || 'pending';
            const riskLevel   = apiResult.risk_level  || 'low';
            const approved    = apiResult.approved_amount;
            const coverage    = apiResult.coverage_pct || '';
            const fraud       = apiResult.fraud_detected;

            const statusColor = status === 'approved' ? '#4caf50' : status === 'rejected' ? '#f44336' : '#ff9800';

            resultHtml = `
                <div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;text-align:left;">
                    <p><strong>Status:</strong> <span style="color:${statusColor};text-transform:capitalize;">${status}</span></p>
                    <p><strong>Risk Level:</strong> ${riskLevel}</p>
                    ${approved !== undefined ? `<p><strong>Approved Amount:</strong> ₹${Number(approved).toLocaleString('en-IN')}</p>` : ''}
                    ${coverage ? `<p><strong>Coverage:</strong> ${coverage}</p>` : ''}
                    ${fraud ? `<p style="color:#f44336;"><strong>⚠ Fraud flag raised — claim under review</strong></p>` : ''}
                </div>`;

            // Insert result below the claim details
            const claimDetails = successScreen.querySelector('.claim-details');
            if (claimDetails) {
                let existingResult = claimDetails.querySelector('.ai-result');
                if (!existingResult) {
                    existingResult = document.createElement('div');
                    existingResult.className = 'ai-result';
                    claimDetails.appendChild(existingResult);
                }
                existingResult.innerHTML = resultHtml;
            }
        }

        const claimForm = document.getElementById('claimForm');
        if (claimForm) claimForm.style.display = 'none';
        successScreen.style.display = 'flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Helpers
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function showNotification(message, type) {
    type = type || 'success';
    if (typeof window.showNotification === 'function' && window.showNotification !== showNotification) {
        window.showNotification(message, type);
    } else {
        if (type === 'error') {
            console.error(message);
            alert(message);
        } else {
            console.log(message);
        }
    }
}

// Make functions global
window.nextStep = nextStep;
window.prevStep = prevStep;
