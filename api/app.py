"""
MediClaim Pro - REST API
Database: PostgreSQL (structured data) + MongoDB (bill documents)
"""

import os
import json
import joblib
import pandas as pd
import pdfplumber
import re
import hashlib
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import psycopg2.extras
from pymongo import MongoClient

# ── Safe import of claim verification utility ──────────────────
try:
    from utils.claim_verification import verify_claim_data
except ImportError:
    def verify_claim_data(manual_data: dict, bill_data: dict) -> list:
        return []


# ─────────────────────────────────────────────────────
# Password Hashing Helper
# ─────────────────────────────────────────────────────
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


# ─────────────────────────────────────────────────────
# PostgreSQL Connection
# ─────────────────────────────────────────────────────
PG_CONFIG = {
    "dbname":   os.getenv("PG_DB",       "insurance_claims"),
    "user":     os.getenv("PG_USER",     "postgres"),
    "password": os.getenv("PG_PASSWORD", "Tiya@893"),
    "host":     os.getenv("PG_HOST",     "localhost"),
    "port":     os.getenv("PG_PORT",     "5432"),
}

def get_pg():
    conn = psycopg2.connect(**PG_CONFIG)
    conn.autocommit = False
    return conn


# ─────────────────────────────────────────────────────
# MongoDB Connection
# ─────────────────────────────────────────────────────
mongo_client  = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
mongo_db      = mongo_client["insurance_docs"]
bills_col     = mongo_db["medical_bills"]
documents_col = mongo_db["documents"]
claims_col    = mongo_db["claims"]


# ─────────────────────────────────────────────────────
# Load ML Fraud Model
# ─────────────────────────────────────────────────────
fraud_model = None
try:
    fraud_model = joblib.load("fraud_model.pkl")
    print("[OK] Fraud model loaded successfully")
except Exception as e:
    print(f"[WARN] Fraud model not found: {e}")
    print("   Run train_fraud_model.py first to generate fraud_model.pkl")


# ─────────────────────────────────────────────────────
# PDF Bill Extraction
# ─────────────────────────────────────────────────────
def extract_bill_details(pdf_path):
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
    except Exception as e:
        return {"patient": None, "hospital": None, "amount": 0, "error": str(e)}

    patient_match  = re.search(r"Patient:\s*(.*)", text, re.IGNORECASE)
    hospital_match = re.search(r"^(.*?)\s+INVOICE", text, re.MULTILINE | re.IGNORECASE)

    # Support common bill amount labels across different hospitals.
    amount_patterns = [
        r"Subtotal:\s*[^\d]*([\d,]+(?:\.\d{1,2})?)",
        r"Grand\s*Total:\s*[^\d]*([\d,]+(?:\.\d{1,2})?)",
        r"Total\s*Amount:\s*[^\d]*([\d,]+(?:\.\d{1,2})?)",
        r"Amount\s*Payable:\s*[^\d]*([\d,]+(?:\.\d{1,2})?)",
        r"Net\s*Amount:\s*[^\d]*([\d,]+(?:\.\d{1,2})?)",
        r"Total:\s*[^\d]*([\d,]+(?:\.\d{1,2})?)",
    ]
    candidate_amounts = []
    for pattern in amount_patterns:
        try:
            for m in re.finditer(pattern, text, re.IGNORECASE):
                num_txt = (m.group(1) or "").replace(",", "").strip()
                if not num_txt:
                    continue
                amt = float(num_txt)
                if amt > 0:
                    candidate_amounts.append(amt)
        except Exception:
            continue
    extracted_amount = max(candidate_amounts) if candidate_amounts else 0

    return {
        "patient":  patient_match.group(1).strip()                if patient_match  else None,
        "hospital": hospital_match.group(1).strip()               if hospital_match else None,
        "amount":   extracted_amount,
    }


# ─────────────────────────────────────────────────────
# Fraud Prediction
# ─────────────────────────────────────────────────────
def predict_fraud(claim_amount, admission_days=3, num_services=2,
                  claim_month=None, hospital_type="Private"):
    if claim_month is None:
        claim_month = datetime.now().month

    if fraud_model is not None:
        model_obj = fraud_model
        feature_columns = None

        # Support both plain sklearn model and bundled artifact dict.
        if isinstance(fraud_model, dict):
            model_obj = fraud_model.get("model")
            feature_columns = fraud_model.get("feature_columns")
            if model_obj is None:
                raise ValueError("Invalid fraud model bundle: missing 'model'")

        base_row = {
            "claim_amount":             float(claim_amount),
            "admission_days":           int(admission_days),
            "num_services":             int(num_services),
            "claim_month":              int(claim_month),
            "hospital_type_Government": 1 if hospital_type == "Government" else 0,
            "hospital_type_Private":    1 if hospital_type == "Private"    else 0,
        }
        data = pd.DataFrame([base_row])

        # Align request features to training schema when bundle provides columns.
        if feature_columns and isinstance(feature_columns, (list, tuple)):
            for col in feature_columns:
                if col not in data.columns:
                    data[col] = 0
            data = data[list(feature_columns)]

        prediction = int(model_obj.predict(data)[0])
        probability = float(model_obj.predict_proba(data)[0][1])
        return prediction, round(probability, 4)

    # Rule-based fallback
    probability = 0.0
    if claim_amount > 75000:
        probability = 0.90
    elif admission_days == 1 and claim_amount > 40000:
        probability = 0.75
    elif num_services <= 1 and claim_amount > 40000:
        probability = 0.70

    prediction = 1 if probability >= 0.50 else 0
    return prediction, round(probability, 4)


# ─────────────────────────────────────────────────────
# ICU Mismatch Detection
# ─────────────────────────────────────────────────────
def detect_icu_mismatch(admission_days, icu_charges):
    if icu_charges > 20000 and admission_days <= 1:
        return True, 0.25
    if icu_charges > 30000 and admission_days <= 2:
        return True, 0.20
    return False, 0.0


# ─────────────────────────────────────────────────────
# Duplicate Claim Detection
# ─────────────────────────────────────────────────────
def detect_duplicate_claim(cur, patient_name, hospital_name, amount, admission_date=None, discharge_date=None):
    """
    Duplicate guard should only block near-identical re-submissions.
    We match on patient + hospital + amount + same admission/discharge dates.
    """
    ad = str(admission_date or "").strip()
    dd = str(discharge_date or "").strip()
    cur.execute("""
        SELECT COUNT(*) AS cnt FROM claims
        WHERE LOWER(patient_name) = %s
          AND LOWER(hospital_name) = %s
          AND ABS(total_amount - %s) < 1
          AND COALESCE(admission_date::text, '') = %s
          AND COALESCE(discharge_date::text, '') = %s
    """, (patient_name.lower(), hospital_name.lower(), amount, ad, dd))
    row = cur.fetchone()
    count = row["cnt"] if isinstance(row, dict) else row[0]
    return count > 0


# ─────────────────────────────────────────────────────
# Tiered Coverage + Auto Approval Logic
# ─────────────────────────────────────────────────────
def calculate_claim_result(claim_amount, fraud_prediction, fraud_probability):
    # Accept both normalized (0-1) and percentage (0-100) fraud probability.
    raw_prob = float(fraud_probability)
    prob_pct = raw_prob * 100.0 if raw_prob <= 1.0 else raw_prob

    # Invalid inputs outside 0-100 are sent to manual review with zero auto payout.
    if prob_pct < 0.0 or prob_pct > 100.0:
        risk_score = 100 if prob_pct > 100.0 else 0
        coverage, status, risk, mode = 0.0, "pending", "high", "manual_review_invalid_probability"
        approved_amount = round(float(claim_amount) * coverage, 2)
        return approved_amount, status, risk, risk_score, mode, coverage

    risk_score = int(round(prob_pct))

    # Decision bands (non-overlapping):
    # 0 <= p <= 10            -> AUTO_APPROVED (80%)
    # 10 < p <= 40            -> MANUAL_REVIEW (60%)
    # 40 < p <= 75            -> MANUAL_REVIEW (40%)
    # 75 < p <= 100           -> AUTO_REJECTED (0%)
    if 0.0 <= prob_pct <= 10.0:
        coverage, status, risk, mode = 0.80, "approved", "low", "AUTO_APPROVED"
    elif 10.0 < prob_pct <= 40.0:
        coverage, status, risk, mode = 0.60, "pending", "medium", "MANUAL_REVIEW"
    elif 40.0 < prob_pct <= 75.0:
        coverage, status, risk, mode = 0.40, "pending", "high", "MANUAL_REVIEW"
    else:  # 75.0 < p <= 100.0
        coverage, status, risk, mode = 0.0, "rejected", "high", "AUTO_REJECTED"

    approved_amount = round(claim_amount * coverage, 2)
    return approved_amount, status, risk, risk_score, mode, coverage


# ─────────────────────────────────────────────────────
# Flask App Setup
# ─────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins=["*"], supports_credentials=True)

def ensure_support_reply_table():
    conn = get_pg()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS support_ticket_replies (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
                admin_id VARCHAR(100),
                reply_message TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL
            )
        """)
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()

# ─────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────
@app.route("/api", methods=["GET"])
@app.route("/api/", methods=["GET"])
def api_root():
    return jsonify({"message": "MediClaim Pro API is running", "database": "PostgreSQL + MongoDB"})

@app.route("/api/health", methods=["GET"])
def health():
    try:
        conn = get_pg()
        conn.close()
        pg_status = "connected"
    except Exception as e:
        pg_status = f"error: {e}"

    try:
        mongo_client.admin.command("ping")
        mongo_status = "connected"
    except Exception as e:
        mongo_status = f"error: {e}"

    return jsonify({
        "status":    "ok",
        "postgres":  pg_status,
        "mongodb":   mongo_status,
        "timestamp": datetime.now().isoformat()
    })


# ─────────────────────────────────────────────────────
# User Routes
# ─────────────────────────────────────────────────────
@app.route("/api/users/register", methods=["POST"])
def register_user():
    data = request.get_json() or {}
    required = ["name", "email", "mobile", "policy_number", "password"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            INSERT INTO users (name, email, mobile, policy_number, password, created_at)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (data["name"], data["email"], data["mobile"],
              data["policy_number"], hash_password(data["password"]),
              datetime.now().isoformat()))
        conn.commit()
        return jsonify({"message": "User registered successfully"}), 201
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "Email already registered"}), 409
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/users/login", methods=["POST"])
def login_user():
    data = request.get_json() or {}
    email = str(data.get("email") or "").strip()
    password = data.get("password")
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Case-insensitive lookup to avoid login failures due to email casing.
        cur.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
        user = cur.fetchone()
        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        stored_password = str(user.get("password") or "")
        hashed_input = hash_password(str(password))

        # Backward-compatible auth:
        # accept either legacy plain-text password rows or hashed rows.
        if not (stored_password == hashed_input or stored_password == str(password)):
            return jsonify({"error": "Invalid email or password"}), 401

        # Auto-migrate legacy plain-text password to hash after successful login.
        if stored_password == str(password):
            try:
                cur.execute("UPDATE users SET password = %s WHERE id = %s", (hashed_input, user.get("id")))
                conn.commit()
            except Exception:
                conn.rollback()

        return jsonify({
            "message": "Login successful",
            "user": {
                "name":          user["name"],
                "email":         user["email"],
                "mobile":        user["mobile"],
                "policy_number": user["policy_number"],
            }
        })
    finally:
        conn.close()


@app.route("/api/users/profile", methods=["GET"])
def get_user_profile():
    email = request.args.get("email")
    if not email:
        return jsonify({"error": "Email required"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT name, email, mobile, policy_number, created_at FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify(dict(user))
    finally:
        conn.close()


@app.route("/api/users", methods=["GET"])
def list_users():
    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT name, email, mobile, policy_number, created_at
            FROM users
            ORDER BY created_at DESC
        """)
        users = [dict(row) for row in cur.fetchall()]
        return jsonify(users)
    finally:
        conn.close()


@app.route("/api/users/profile", methods=["PUT"])
def update_user_profile():
    data = request.get_json() or {}
    email = data.get("email")
    if not email:
        return jsonify({"error": "Email required"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE users SET name = %s, mobile = %s, policy_number = %s
            WHERE email = %s
        """, (data.get("name"), data.get("mobile"), data.get("policy_number"), email))
        conn.commit()
        return jsonify({"message": "Profile updated successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/users/change-password", methods=["POST"])
def change_password():
    data = request.get_json() or {}
    email        = data.get("email")
    old_password = data.get("old_password")
    new_password = data.get("new_password")

    if not all([email, old_password, new_password]):
        return jsonify({"error": "All fields required"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT password FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        if not user or user["password"] != hash_password(old_password):
            return jsonify({"error": "Current password is incorrect"}), 401
        cur.execute("UPDATE users SET password = %s WHERE email = %s",
                    (hash_password(new_password), email))
        conn.commit()
        return jsonify({"message": "Password changed successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/users/delete", methods=["DELETE"])
def delete_user_account():
    data  = request.get_json() or {}
    email = data.get("email")
    if not email:
        return jsonify({"error": "Email required"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE email = %s", (email,))
        if cur.rowcount == 0:
            return jsonify({"error": "User not found"}), 404
        conn.commit()
        return jsonify({"message": "Account deleted successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


# ─────────────────────────────────────────────────────
# Admin Routes
# ─────────────────────────────────────────────────────
@app.route("/api/admin/register", methods=["POST"])
def register_admin():
    data = request.get_json() or {}
    if not data.get("admin_id") or not data.get("password"):
        return jsonify({"error": "admin_id and password required"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO admin_accounts (admin_id, password, created_at)
            VALUES (%s, %s, %s)
        """, (data["admin_id"], hash_password(data["password"]),
              datetime.now().isoformat()))
        conn.commit()
        return jsonify({"message": "Admin registered successfully"}), 201
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "Admin ID already exists"}), 409
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/admin/login", methods=["POST"])
def login_admin():
    data = request.get_json() or {}
    if not data.get("admin_id") or not data.get("password"):
        return jsonify({"error": "admin_id and password required"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM admin_accounts WHERE admin_id = %s", (data["admin_id"],))
        admin = cur.fetchone()
        if not admin or admin["password"] != hash_password(data["password"]):
            return jsonify({"error": "Invalid admin ID or password"}), 401
        return jsonify({
            "message":  "Admin login successful",
            "admin_id": admin["admin_id"]
        })
    finally:
        conn.close()


# ─────────────────────────────────────────────────────
# Bill Upload (stored in MongoDB)
# ─────────────────────────────────────────────────────
@app.route("/api/upload-bill", methods=["POST"])
def upload_bill():
    file = request.files.get("bill")
    if not file:
        return jsonify({"error": "No file provided"}), 400

    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, file.filename)
    file.save(filepath)

    bill_data = extract_bill_details(filepath)

    doc_id = bills_col.insert_one({
        "filename":    file.filename,
        "patient":     bill_data.get("patient"),
        "hospital":    bill_data.get("hospital"),
        "amount":      bill_data.get("amount"),
        "uploaded_at": datetime.now()
    }).inserted_id

    return jsonify({
        "message":  "Bill uploaded successfully",
        "mongo_id": str(doc_id),
        **bill_data
    }), 200


# ─────────────────────────────────────────────────────
# Claims Routes
# ─────────────────────────────────────────────────────
@app.route("/api/claims", methods=["GET"])
def list_claims():
    email    = request.args.get("email")
    is_admin = request.args.get("admin")
    is_admin_view = bool(is_admin)

    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if is_admin:
            cur.execute("SELECT * FROM claims ORDER BY submitted_date DESC")
        elif email:
            cur.execute("SELECT * FROM claims WHERE user_email = %s ORDER BY submitted_date DESC", (email,))
        else:
            return jsonify({"error": "email or admin param required"}), 400

        claims = [dict(row) for row in cur.fetchall()]

        # Normalize stale historical claims in API response only for user view.
        if not is_admin_view:
            for c in claims:
                try:
                    total_amount = float(c.get("total_amount") or 0)
                    approval_mode_raw = str(c.get("approval_mode") or "").upper().strip()
                    status_raw = str(c.get("status") or "").lower().strip()
                    # Parse fraud_probability safely from number/string/percent formats.
                    fp_raw = c.get("fraud_probability")
                    if isinstance(fp_raw, str):
                        fp_clean = fp_raw.replace("%", "").strip()
                        fraud_prob = float(fp_clean) if fp_clean else 0.0
                    else:
                        fraud_prob = float(fp_raw or 0.0)
                    fraud_prob_pct = fraud_prob * 100.0 if fraud_prob <= 1.0 else fraud_prob

                    if 0.0 <= fraud_prob_pct <= 10.0:
                        c["risk_level"] = "low"
                        c["risk_score"] = min(int(round(fraud_prob_pct)), 10)
                        c["fraud_flag"] = 0
                        c["status"] = "approved"
                        c["approval_mode"] = "AUTO_APPROVED"
                        c["coverage_percent"] = 0.80
                        c["approved_amount"] = round(total_amount * 0.80, 2)
                        continue

                    if approval_mode_raw == "AUTO_APPROVED" or (status_raw == "approved" and 0.0 <= fraud_prob_pct <= 10.0):
                        c["status"] = "approved"
                        c["approval_mode"] = "AUTO_APPROVED"
                        c["coverage_percent"] = 0.80
                        c["approved_amount"] = round(total_amount * 0.80, 2)
                        c["risk_level"] = "low"
                        c["risk_score"] = min(int(round(fraud_prob_pct)), 10)
                        c["fraud_flag"] = 0
                        continue

                    ad = c.get("admission_date")
                    dd = c.get("discharge_date")
                    if ad and dd:
                        d1 = datetime.strptime(str(ad)[:10], "%Y-%m-%d")
                        d2 = datetime.strptime(str(dd)[:10], "%Y-%m-%d")
                        days = max(1, (d2 - d1).days)
                        amount_per_day = total_amount / float(days)

                        if days <= 1 and total_amount >= 200000:
                            c["risk_level"] = "high"
                            c["risk_score"] = max(int(c.get("risk_score") or 0), 80)
                            c["fraud_flag"] = 1
                            c["status"] = "pending"
                            c["approval_mode"] = "manual_required"
                        elif days >= 3 and amount_per_day <= 60000:
                            c["risk_level"] = "low"
                            c["risk_score"] = min(int(c.get("risk_score") or 10), 9)
                            c["fraud_flag"] = 0
                            c["status"] = "approved"
                            c["approval_mode"] = "auto"
                except Exception:
                    pass
        return jsonify(claims)
    finally:
        conn.close()


@app.route("/api/claims", methods=["POST"])
def create_claim():
    data = request.get_json() or {}

    claim_id = "CLM" + datetime.now().strftime("%Y%m%d%H%M%S%f")

    room_charges     = float(data.get("room_charges",     0))
    surgery_charges  = float(data.get("surgery_charges",  0))
    doctor_fees      = float(data.get("doctor_fees",      0))
    medicine_charges = float(data.get("medicine_charges", 0))
    lab_charges      = float(data.get("lab_charges",      0))
    other_charges    = float(data.get("other_charges",    0))
    icu_charges      = float(data.get("icu_charges",      0))
    total_amount     = (room_charges + surgery_charges + doctor_fees +
                        medicine_charges + lab_charges + other_charges + icu_charges)

    try:
        admit          = datetime.strptime(data.get("admission_date", ""), "%Y-%m-%d")
        disch          = datetime.strptime(data.get("discharge_date", ""), "%Y-%m-%d")
        admission_days = max(1, (disch - admit).days)
    except Exception:
        admission_days = 3

    num_services  = sum(1 for c in [room_charges, surgery_charges, doctor_fees,
                                     medicine_charges, lab_charges, icu_charges] if c > 0)
    hospital_type = data.get("hospital_type", "Private")

    # ── Per-bill (per charge component) fraud probability ──────
    bill_items = [
        ("room_charges", room_charges),
        ("surgery_charges", surgery_charges),
        ("doctor_fees", doctor_fees),
        ("medicine_charges", medicine_charges),
        ("lab_charges", lab_charges),
        ("other_charges", other_charges),
        ("icu_charges", icu_charges),
    ]
    bill_probabilities = []
    for bill_name, bill_amount in bill_items:
        if bill_amount and bill_amount > 0:
            p_pred, p_prob = predict_fraud(
                float(bill_amount),
                admission_days=admission_days,
                num_services=1,
                claim_month=datetime.now().month,
                hospital_type=hospital_type
            )
            bill_probabilities.append({
                "bill": bill_name,
                "amount": float(bill_amount),
                "fraud_prediction": int(p_pred),
                "fraud_probability": float(p_prob),
            })

    # Decide overall claim fraud risk based on the worst (highest) bill probability.
    if bill_probabilities:
        fraud_prob = max(x["fraud_probability"] for x in bill_probabilities)
        fraud_pred = 1 if fraud_prob >= 0.5 else 0
    else:
        fraud_pred, fraud_prob = predict_fraud(
            total_amount, admission_days, num_services,
            datetime.now().month, hospital_type
        )

    icu_flag, icu_risk = detect_icu_mismatch(admission_days, icu_charges)
    if icu_flag:
        fraud_prob = min(1.0, fraud_prob + icu_risk)
        if fraud_prob >= 0.5:
            fraud_pred = 1

    # Hard anomaly guards: very high bill for very short admission
    # should never remain low risk even if model underestimates.
    anomaly_flags = []
    if admission_days <= 1 and total_amount >= 300000:
        fraud_prob = max(fraud_prob, 0.90)
        fraud_pred = 1
        anomaly_flags.append("one_day_very_high_amount")
    elif admission_days <= 1 and total_amount >= 200000:
        fraud_prob = max(fraud_prob, 0.80)
        fraud_pred = 1 if fraud_prob >= 0.5 else fraud_pred
        anomaly_flags.append("one_day_high_amount")

    # Reliable long-stay pattern:
    # for multi-day admissions with proportionate amount/day, move to auto-approve band.
    try:
        amount_per_day = total_amount / float(max(1, admission_days))
        if admission_days >= 3 and amount_per_day <= 60000 and fraud_prob < 0.50:
            fraud_prob = min(fraud_prob, 0.09)
            fraud_pred = 0
            anomaly_flags.append("long_stay_reasonable_amount_auto_approve")
    except Exception:
        pass

    approved_amount, status, risk_level, risk_score, approval_mode, coverage = \
        calculate_claim_result(total_amount, fraud_pred, fraud_prob)

    conn = get_pg()
    mongo_claim_doc_id = None
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        patient_name  = data.get("patient_name",  "")
        hospital_name = data.get("hospital_name", "")

        if detect_duplicate_claim(
            cur,
            patient_name,
            hospital_name,
            total_amount,
            data.get("admission_date"),
            data.get("discharge_date")
        ):
            return jsonify({"error": "Duplicate claim detected"}), 409

        # ── 41 columns, 41 values ──────────────────────────────
        # Include per-bill fraud breakdown in raw_json for audit/explainability.
        try:
            data["fraud_breakdown"] = bill_probabilities
            data["fraud_anomaly_flags"] = anomaly_flags
        except Exception:
            pass

        submitted_at = datetime.now().isoformat()
        approved_at = submitted_at if str(status).lower() in ("approved", "settled") else None

        cur.execute("""
            INSERT INTO claims (
                claim_id, user_email, name, policy_number, mobile,
                claim_date, claim_type,
                hospital_name, hospital_address, hospital_city,
                hospital_state, hospital_pincode, hospital_phone,
                admission_date, discharge_date,
                patient_name, patient_age, patient_relation,
                doctor_name, diagnosis, treatment_details,
                room_charges, surgery_charges, doctor_fees,
                medicine_charges, lab_charges, other_charges, icu_charges,
                total_amount, approved_amount, coverage_percent,
                fraud_flag, fraud_probability, risk_score,
                risk_level, approval_mode, status,
                admin_remarks, submitted_date, approved_date, raw_json
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s
            ) RETURNING id
        """, (
            claim_id,                    data.get("user_email"),      data.get("name"),
            data.get("policy_number"),   data.get("mobile"),
            data.get("claim_date"),      data.get("claim_type"),
            hospital_name,               data.get("hospital_address"), data.get("hospital_city"),
            data.get("hospital_state"),  data.get("hospital_pincode"), data.get("hospital_phone"),
            data.get("admission_date"),  data.get("discharge_date"),
            patient_name,                data.get("patient_age"),      data.get("patient_relation"),
            data.get("doctor_name"),     data.get("diagnosis"),        data.get("treatment_details"),
            room_charges,                surgery_charges,               doctor_fees,
            medicine_charges,            lab_charges,                   other_charges,             icu_charges,
            total_amount,                approved_amount,               coverage,
            fraud_pred,                  fraud_prob,                    risk_score,
            risk_level,                  approval_mode,                 status,
            None,                        submitted_at,                  approved_at,               json.dumps(data)
        ))
        inserted_row = cur.fetchone() or {}
        pg_claim_pk = inserted_row.get("id") if isinstance(inserted_row, dict) else None

        # Save the same submitted claim in MongoDB for durable document storage.
        mongo_doc = {
            "claim_id": claim_id,
            "pg_claim_id": pg_claim_pk,
            "submitted_at": submitted_at,
            "status": status,
            "risk_level": risk_level,
            "risk_score": risk_score,
            "approval_mode": approval_mode,
            "fraud_detected": bool(fraud_pred),
            "fraud_probability": float(fraud_prob),
            "total_amount": float(total_amount),
            "approved_amount": float(approved_amount),
            "coverage_percent": float(coverage),
            "payload": data
        }
        mongo_claim_doc_id = claims_col.insert_one(mongo_doc).inserted_id

        conn.commit()

        return jsonify({
            "message":         "Claim submitted successfully",
            "claim_id":        claim_id,
            "mongo_claim_id":  str(mongo_claim_doc_id),
            "status":          status,
            "total_amount":    total_amount,
            "approved_amount": approved_amount,
            "coverage_pct":    f"{int(coverage * 100)}%",
            "risk_level":      risk_level,
            "risk_score":      risk_score,
            "fraud_detected":  bool(fraud_pred),
            "approval_mode":   approval_mode,
        }), 201

    except Exception as e:
        conn.rollback()
        if mongo_claim_doc_id is not None:
            try:
                claims_col.delete_one({"_id": mongo_claim_doc_id})
            except Exception:
                pass
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "type": type(e).__name__}), 500
    finally:
        conn.close()


@app.route("/api/claims/<claim_id>", methods=["PUT"])
def update_claim(claim_id):
    data = request.get_json() or {}
    admin_remarks = data.get("admin_remarks")
    if admin_remarks is None:
        admin_remarks = data.get("adminRemarks")

    conn = get_pg()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE claims
            SET status = %s, admin_remarks = %s, approved_date = %s
            WHERE claim_id = %s
        """, (data.get("status"), admin_remarks,
              datetime.now().isoformat(), claim_id))
        if cur.rowcount == 0:
            return jsonify({"error": "Claim not found"}), 404
        conn.commit()
        return jsonify({"message": "Claim updated successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


# ─────────────────────────────────────────────────────
# Support Tickets
# ─────────────────────────────────────────────────────
@app.route("/api/support/submit", methods=["POST"])
def submit_support_request():
    data = request.get_json(silent=True) or {}
    if not data:
        data = request.form.to_dict() if request.form else {}
    user_email = str(data.get("user_email") or data.get("email") or "").strip()
    subject = str(data.get("subject") or "").strip()
    message = str(data.get("message") or "").strip()
    if not user_email or not subject or not message:
        return jsonify({"error": "user_email, subject and message required"}), 400

    conn = get_pg()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO support_tickets (user_email, subject, message, status, created_at)
            VALUES (%s, %s, %s, 'open', %s)
        """, (user_email, subject, message,
              datetime.now().isoformat()))
        conn.commit()
        return jsonify({"message": "Support ticket submitted successfully"}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/support/tickets", methods=["GET"])
def get_support_tickets():
    email    = request.args.get("email")
    is_admin = request.args.get("admin")
    ensure_support_reply_table()

    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if is_admin:
            cur.execute("""
                SELECT t.*,
                       r.reply_message AS admin_reply,
                       r.admin_id AS replied_by,
                       r.created_at AS replied_at
                FROM support_tickets t
                LEFT JOIN LATERAL (
                    SELECT reply_message, admin_id, created_at
                    FROM support_ticket_replies
                    WHERE ticket_id = t.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) r ON TRUE
                ORDER BY t.created_at DESC
            """)
        elif email:
            cur.execute("""
                SELECT t.*,
                       r.reply_message AS admin_reply,
                       r.admin_id AS replied_by,
                       r.created_at AS replied_at
                FROM support_tickets t
                LEFT JOIN LATERAL (
                    SELECT reply_message, admin_id, created_at
                    FROM support_ticket_replies
                    WHERE ticket_id = t.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) r ON TRUE
                WHERE t.user_email = %s
                ORDER BY t.created_at DESC
            """, (email,))
        else:
            return jsonify({"error": "email or admin param required"}), 400

        tickets = [dict(row) for row in cur.fetchall()]
        return jsonify(tickets)
    finally:
        conn.close()


@app.route("/api/support/tickets/<int:ticket_id>/reply", methods=["POST"])
def reply_support_ticket(ticket_id):
    data = request.get_json() or {}
    admin_reply = str(data.get("reply_message") or data.get("admin_reply") or "").strip()
    admin_id = str(data.get("admin_id") or "").strip() or "admin"
    if not admin_reply:
        return jsonify({"error": "reply_message required"}), 400

    ensure_support_reply_table()
    conn = get_pg()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM support_tickets WHERE id = %s", (ticket_id,))
        ticket = cur.fetchone()
        if not ticket:
            return jsonify({"error": "Support ticket not found"}), 404

        cur.execute("""
            INSERT INTO support_ticket_replies (ticket_id, admin_id, reply_message, created_at)
            VALUES (%s, %s, %s, %s)
        """, (ticket_id, admin_id, admin_reply, datetime.now().isoformat()))
        cur.execute("UPDATE support_tickets SET status = 'answered' WHERE id = %s", (ticket_id,))
        conn.commit()
        return jsonify({"message": "Reply sent successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


# ─────────────────────────────────────────────────────
# Document Upload (stored in MongoDB)
# ─────────────────────────────────────────────────────
@app.route("/api/documents/upload", methods=["POST"])
def upload_document():
    file = request.files.get("document") or request.files.get("file")
    email = (
        request.form.get("email")
        or request.form.get("user_email")
        or request.form.get("userEmail")
    )
    claim_id = request.form.get("claim_id") or request.form.get("claimId")
    document_type = request.form.get("document_type") or request.form.get("documentType")
    description = request.form.get("description")
    source = request.form.get("source") or "upload_documents"

    if not file or not email:
        return jsonify({"error": "document file and email required"}), 400

    upload_dir = os.path.join("uploads", "documents")
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, file.filename)
    file.save(filepath)

    doc_id = documents_col.insert_one({
        "user_email": email,
        "claim_id": claim_id,
        "document_type": document_type,
        "description": description,
        "source": source,
        "filename": file.filename,
        "filepath": filepath,
        "content_type": file.content_type,
        "size_bytes": os.path.getsize(filepath) if os.path.exists(filepath) else None,
        "uploaded_at": datetime.now()
    }).inserted_id

    return jsonify({
        "message": "Document uploaded successfully",
        "mongo_id": str(doc_id),
        "filename": file.filename,
        "claim_id": claim_id
    }), 200


@app.route("/api/documents/user/<email>", methods=["GET"])
def get_user_documents(email):
    docs = list(documents_col.find({"user_email": email}, {"_id": 0}).sort("uploaded_at", -1))
    return jsonify(docs)


@app.route("/api/documents/claim/<claim_id>", methods=["GET"])
def get_claim_documents(claim_id):
    docs = list(documents_col.find({"claim_id": claim_id}, {"_id": 0}).sort("uploaded_at", -1))
    return jsonify(docs)


# ─────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Starting MediClaim Pro API...")
    print("Database: PostgreSQL + MongoDB")
    app.run(debug=True, host="0.0.0.0", port=5000)