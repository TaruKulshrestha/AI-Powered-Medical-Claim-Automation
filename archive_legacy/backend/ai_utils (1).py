# ai_utils.py

import joblib
import os

# -------------------------------
# Load ML Model (Fraud Detection)
# -------------------------------
MODEL_PATH = "fraud_model.pkl"

if os.path.exists(MODEL_PATH):
    fraud_model = joblib.load(MODEL_PATH)
else:
    fraud_model = None


# -------------------------------
# Fraud Prediction Function
# -------------------------------
def predict_fraud(data: dict):
    """
    Predict fraud using ML model
    Returns: (prediction, probability, reason)
    """

    try:
        # Extract features
        amount = float(data.get("totalAmount", 0))
        age = int(data.get("patientAge", 30))
        admission_days = int(data.get("admissionDays", 1))

        # Example feature vector (adjust based on your trained model)
        features = [[amount, age, admission_days]]

        # If model exists → use ML
        if fraud_model:
            prediction = int(fraud_model.predict(features)[0])

            if hasattr(fraud_model, "predict_proba"):
                probability = float(fraud_model.predict_proba(features)[0][1])
            else:
                probability = 0.5

        else:
            # Fallback rule-based (if model not found)
            if amount > 200000:
                prediction = 1
                probability = 0.9
            else:
                prediction = 0
                probability = 0.2

        # Reason generation
        if prediction == 1:
            reason = "High claim amount or suspicious pattern"
        else:
            reason = "Normal claim pattern"

        return prediction, probability, reason

    except Exception as e:
        return 0, 0.0, f"Error: {str(e)}"


# -------------------------------
# Risk Score Calculation
# -------------------------------
def calculate_risk_score(data: dict, fraud_prob: float):
    """
    Calculate risk score (0–100)
    """

    try:
        score = fraud_prob * 100

        amount = float(data.get("totalAmount", 0))
        admission_days = int(data.get("admissionDays", 1))

        # Add risk based on conditions
        if amount > 100000:
            score += 10

        if admission_days <= 1:
            score += 10

        if amount > 200000:
            score += 20

        return min(score, 100)

    except:
        return 0


# -------------------------------
# Optional: Data Verification (Future Use)
# -------------------------------
def verify_claim_data(form_data: dict, bill_data: dict):
    """
    Compare form data with extracted PDF data
    """

    mismatch_score = 0

    if form_data.get("patientName") != bill_data.get("patient"):
        mismatch_score += 20

    if form_data.get("hospitalName") != bill_data.get("hospital"):
        mismatch_score += 20

    return mismatch_score
