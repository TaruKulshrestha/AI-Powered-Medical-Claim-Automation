// Upload Documents Page - Document upload and management
document.addEventListener('DOMContentLoaded', function() {
    loadClaimsForUpload();
    loadUserDocuments();
    setupFileUpload();
    setupFormHandlers();
    loadUserProfile();
    setupLogout();
});

function setupFileUpload() {
    const fileUploadArea = document.getElementById('fileUploadArea');
    const documentFile = document.getElementById('documentFile');
    const fileName = document.getElementById('fileName');

    if (!fileUploadArea || !documentFile) return;

    // Click to upload
    fileUploadArea.addEventListener('click', function() {
        documentFile.click();
    });

    // File selection handler
    documentFile.addEventListener('change', function(e) {
        handleFileSelect(e.target.files[0]);
    });

    // Drag and drop
    fileUploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });

    fileUploadArea.addEventListener('dragleave', function() {
        fileUploadArea.classList.remove('dragover');
    });

    fileUploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelect(file) {
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'txt'];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    // Validate file size
    if (file.size > maxSize) {
        showNotification('File size exceeds 10MB limit', 'error');
        return;
    }

    // Validate file type
    if (!allowedExtensions.includes(fileExtension)) {
        showNotification('Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX, TXT', 'error');
        return;
    }

    // Update UI
    const documentFile = document.getElementById('documentFile');
    const fileName = document.getElementById('fileName');
    const uploadText = document.querySelector('.upload-text');
    
    if (fileName && uploadText) {
        fileName.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
        fileName.style.display = 'block';
        uploadText.style.display = 'none';
    }
}

function setupFormHandlers() {
    const uploadForm = document.getElementById('uploadForm');
    const clearFormBtn = document.getElementById('clearFormBtn');

    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUploadSubmit);
    }

    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', function() {
            uploadForm.reset();
            const fileName = document.getElementById('fileName');
            const uploadText = document.querySelector('.upload-text');
            if (fileName && uploadText) {
                fileName.style.display = 'none';
                uploadText.style.display = 'block';
            }
            showNotification('Form cleared', 'info');
        });
    }
}

function handleUploadSubmit(e) {
    e.preventDefault();

    const claimId = document.getElementById('claimSelect').value;
    const documentType = document.getElementById('documentType').value;
    const description = document.getElementById('documentDescription').value;
    const fileInput = document.getElementById('documentFile');
    const file = fileInput.files[0];

    // Validate required fields
    if (!claimId) {
        showNotification('Please select a claim', 'error');
        return;
    }

    if (!documentType) {
        showNotification('Please select a document type', 'error');
        return;
    }

    if (!file) {
        showNotification('Please select a file to upload', 'error');
        return;
    }

    // Prepare form data
    const formData = new FormData();
    formData.append('claim_id', claimId);
    formData.append('documentType', documentType);
    formData.append('description', description);
    formData.append('document', file);

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user && user.email) {
        formData.append('email', user.email);
    }

    // Show loading state
    showLoadingSpinner(true);
    const submitBtn = document.querySelector('#uploadForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Uploading...</span>';

    // Submit to backend
    MediClaimAPI.documents.uploadDocument(formData)
        .then(function(response) {
            showLoadingSpinner(false);
            showNotification('Document uploaded successfully!', 'success');
            document.getElementById('uploadForm').reset();
            
            // Reset file upload area
            const fileName = document.getElementById('fileName');
            const uploadText = document.querySelector('.upload-text');
            if (fileName && uploadText) {
                fileName.style.display = 'none';
                uploadText.style.display = 'block';
            }
            
            // Reload documents list
            loadUserDocuments();
        })
        .catch(function(error) {
            showLoadingSpinner(false);
            showNotification('Error uploading document: ' + error.message, 'error');
        })
        .finally(function() {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        });
}

function loadClaimsForUpload() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!user || !user.email) {
        showNotification('User not found', 'error');
        return;
    }

    showLoadingSpinner(true);

    // Fetch claims for this user
    MediClaimAPI.claims.getUserClaims(user.email)
        .then(function(claims) {
            showLoadingSpinner(false);
            
            const claimSelect = document.getElementById('claimSelect');
            if (!claimSelect) return;

            // Clear existing options except the default
            claimSelect.innerHTML = '<option value="">Choose a claim...</option>';

            if (claims && claims.length > 0) {
                claims.forEach(function(claim) {
                    const option = document.createElement('option');
                    const claimId = claim.claim_id || claim.claimId || claim.id || '';
                    const claimType = claim.claim_type || claim.claimType || 'Claim';
                    option.value = claimId;
                    option.textContent = `Claim #${claimId} - ${claimType} (${claim.status || 'Pending'})`;
                    claimSelect.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No claims available';
                claimSelect.appendChild(option);
            }
        })
        .catch(function(error) {
            showLoadingSpinner(false);
            console.error('Error loading claims:', error);
            showNotification('Error loading claims', 'error');
        });
}

function loadUserDocuments() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!user || !user.email) return;

    MediClaimAPI.documents.getUserDocuments(user.email)
        .then(function(documents) {
            displayUploadedDocuments(documents);
        })
        .catch(function(error) {
            console.error('Error loading documents:', error);
        });
}

function displayUploadedDocuments(documents) {
    const documentsList = document.getElementById('uploadedDocumentsList');
    
    if (!documentsList) return;

    if (!documents || documents.length === 0) {
        documentsList.innerHTML = '<p class="no-documents">No documents uploaded yet</p>';
        return;
    }

    let html = '<div class="documents-grid">';
    
    documents.forEach(function(doc) {
        const uploadDate = new Date(doc.uploaded_at || doc.uploadedDate || doc.createdAt || Date.now()).toLocaleDateString();
        const docName = doc.filename || doc.fileName || 'File';
        const documentType = doc.document_type || doc.documentType || 'Document';
        const claimId = doc.claim_id || doc.claimId || '-';
        html += `
            <div class="document-item">
                <div class="document-icon">📄</div>
                <h4>${documentType}</h4>
                <p class="document-name">${docName}</p>
                <p class="document-claim">Claim #${claimId}</p>
                <p class="document-date">${uploadDate}</p>
                <p class="document-status">${doc.status || 'Uploaded'}</p>
                ${doc.description ? `<p class="document-description">${doc.description}</p>` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    documentsList.innerHTML = html;
}

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

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification ' + type;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(function() {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(function() {
        notification.classList.remove('show');
        setTimeout(function() {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function showLoadingSpinner(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
    }
}
