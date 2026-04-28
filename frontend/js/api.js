/**
 * MediClaim Pro - API client for backend
 * Set window.API_BASE_URL to override (e.g. "http://localhost:5000/api")
 */
(function () {
    var BASE = typeof window !== 'undefined' && window.API_BASE_URL
        ? window.API_BASE_URL
        : 'http://localhost:5000/api';

    function request(method, path, body) {
        var url = BASE + path;
        var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
        if (body && (method === 'POST' || method === 'PUT')) opts.body = JSON.stringify(body);
        return fetch(url, opts).then(function (res) {
            return res.json().then(function (data) {
                if (res.ok) return data;
                var err = new Error(data.error || data.message || 'Request failed');
                err.status = res.status;
                err.data = data;
                throw err;
            }).catch(function (e) {
                if (e && e.status) throw e;
                return res.text().then(function (text) {
                    var err = new Error(text || 'Request failed');
                    err.status = res.status;
                    throw err;
                });
            });
        });
    }

    window.MediClaimAPI = {
        getBase: function () { return BASE; },
        setBase: function (url) { BASE = url.replace(/\/$/, ''); },

        health: function () {
            return fetch(BASE + '/health').then(function (r) { return r.json(); });
        },

        users: {
            register: function (data) {
                return request('POST', '/users/register', {
                    name:          data.name,
                    email:         data.email,
                    mobile:        data.mobile,
                    policy_number: data.policyNumber || data.policy_number,
                    password:      data.password
                });
            },
            login: function (email, password) {
                return request('POST', '/users/login', { email: email, password: password });
            },
            getProfile: function (email) {
                return request('GET', '/users/profile?email=' + encodeURIComponent(email || ''));
            },
            list: function () {
                return request('GET', '/users');
            },
            updateProfile: function (data) {
                return request('PUT', '/users/profile', {
                    email:         data.email,
                    name:          data.name,
                    mobile:        data.mobile,
                    policy_number: data.policyNumber || data.policy_number
                });
            },
            changePassword: function (data) {
                return request('POST', '/users/change-password', {
                    email:        data.email,
                    old_password: data.currentPassword || data.old_password,
                    new_password: data.newPassword     || data.new_password
                });
            },
            deleteAccount: function (email) {
                return request('DELETE', '/users/delete', { email: email });
            }
        },

        admin: {
            register: function (data) {
                return request('POST', '/admin/register', {
                    admin_id: data.adminId || data.admin_id,
                    password: data.password
                });
            },
            login: function (adminId, password) {
                return request('POST', '/admin/login', {
                    admin_id: adminId,
                    password: password
                });
            }
        },

        // ── Single claims object with all methods ──────────────
        claims: {
            list: function (email) {
                return request('GET', '/claims?email=' + encodeURIComponent(email || ''));
            },
            listAdmin: function () {
                return request('GET', '/claims?admin=1');
            },
            getUserClaims: function (email) {
                return request('GET', '/claims?email=' + encodeURIComponent(email || ''));
            },
            submit: function (data) {
                // Map camelCase frontend fields → snake_case backend fields
                return request('POST', '/claims', {
                    user_email:        data.email        || data.user_email,
                    name:              data.name,
                    policy_number:     data.policyNumber || data.policy_number,
                    mobile:            data.mobile,
                    claim_date:        data.claimDate    || data.claim_date,
                    claim_type:        data.claimType    || data.claim_type,
                    hospital_name:     data.hospitalName    || data.hospital_name,
                    hospital_address:  data.hospitalAddress || data.hospital_address,
                    hospital_city:     data.hospitalCity    || data.hospital_city,
                    hospital_state:    data.hospitalState   || data.hospital_state,
                    hospital_pincode:  data.hospitalPincode || data.hospital_pincode,
                    hospital_phone:    data.hospitalPhone   || data.hospital_phone,
                    hospital_type:     data.hospitalType    || data.hospital_type || 'Private',
                    admission_date:    data.admissionDate   || data.admission_date,
                    discharge_date:    data.dischargeDate   || data.discharge_date,
                    patient_name:      data.patientName     || data.patient_name,
                    patient_age:       data.patientAge      || data.patient_age,
                    patient_relation:  data.patientRelation || data.patient_relation,
                    doctor_name:       data.doctorName      || data.doctor_name,
                    diagnosis:         data.diagnosis,
                    treatment_details: data.treatmentDetails || data.treatment_details,
                    room_charges:      data.roomCharges      || data.room_charges      || 0,
                    surgery_charges:   data.surgeryCharges   || data.surgery_charges   || 0,
                    doctor_fees:       data.doctorFees       || data.doctor_fees       || 0,
                    medicine_charges:  data.medicineCharges  || data.medicine_charges  || 0,
                    lab_charges:       data.labCharges       || data.lab_charges       || 0,
                    other_charges:     data.otherCharges     || data.other_charges     || 0,
                    icu_charges:       data.icuCharges       || data.icu_charges       || 0
                });
            },
            update: function (claimId, data) {
                var payload = data || {};
                return request('PUT', '/claims/' + encodeURIComponent(claimId), {
                    status: payload.status,
                    admin_remarks: payload.admin_remarks != null ? payload.admin_remarks : payload.adminRemarks,
                    approved: payload.approved
                });
            }
        },

        support: {
            submitRequest: function (payload) {
                var body = payload;
                if (payload instanceof FormData) {
                    body = {
                        user_email: payload.get('user_email') || payload.get('email'),
                        subject: payload.get('subject'),
                        message: payload.get('message'),
                        category: payload.get('category'),
                        priority: payload.get('priority')
                    };
                }
                return request('POST', '/support/submit', body);
            },
            getTickets: function (email) {
                return request('GET', '/support/tickets?email=' + encodeURIComponent(email || ''));
            },
            getAdminTickets: function () {
                return request('GET', '/support/tickets?admin=1');
            },
            replyToTicket: function (ticketId, data) {
                return request('POST', '/support/tickets/' + encodeURIComponent(ticketId) + '/reply', {
                    admin_id: data && (data.admin_id || data.adminId),
                    reply_message: data && (data.reply_message || data.admin_reply || data.reply)
                });
            }
        },

        bills: {
            uploadAndExtract: function (file) {
                var formData = new FormData();
                formData.append('bill', file);
                return fetch(BASE + '/upload-bill', {
                    method: 'POST',
                    body: formData
                }).then(function (res) {
                    return res.json().then(function (data) {
                        if (res.ok) return data;
                        var err = new Error(data.error || data.message || 'Bill upload failed');
                        err.status = res.status;
                        err.data = data;
                        throw err;
                    });
                });
            }
        },

        documents: {
            uploadDocument: function (formData) {
                return fetch(BASE + '/documents/upload', {
                    method: 'POST',
                    body: formData
                }).then(function (res) {
                    return res.json().then(function (data) {
                        if (res.ok) return data;
                        var err = new Error(data.error || data.message || 'Upload failed');
                        err.status = res.status;
                        err.data = data;
                        throw err;
                    });
                });
            },
            getUserDocuments: function (email) {
                return request('GET', '/documents/user/' + encodeURIComponent(email));
            },
            getClaimDocuments: function (claimId) {
                return request('GET', '/documents/claim/' + encodeURIComponent(claimId || ''));
            }
        }
    };
})();
