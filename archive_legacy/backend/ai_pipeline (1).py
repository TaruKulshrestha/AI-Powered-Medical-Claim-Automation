# ai_pipeline.py

from ai_utils import predict_fraud, calculate_risk_score


def process_claim(data: dict):
    """
    Main AI pipeline for claim processing
    """

    try:
        # -------------------------------
        # Step 1: Fraud Detection (ML)
        # -------------------------------
        fraud_prediction, fraud_prob, reason = predict_fraud(data)

        # -------------------------------
        # Step 2: Risk Score Calculation
        # -------------------------------
        risk_score = calculate_risk_score(data, fraud_prob)

        # -------------------------------
        # Step 3: Extract Total Amount
        # -------------------------------
        total_amount = float(
            data.get("totalAmount") or data.get("total_amount") or 0
        )

        # -------------------------------
        # Step 4: Approval Logic
        # -------------------------------
        if fraud_prediction == 1:
            approved_amount = 0
            status = "Rejected (Fraud Detected)"

        elif risk_score > 70:
            approved_amount = total_amount * 0.5
            status = "High Risk - 50% Approved"

        elif risk_score > 40:
            approved_amount = total_amount * 0.7
            status = "Medium Risk - 70% Approved"

        else:
            approved_amount = total_amount * 0.8
            status = "Low Risk - 80% Approved"

        # -------------------------------
        # Step 5: Final Response
        # -------------------------------
        result = {
            "fraud_prediction": int(fraud_prediction),
            "fraud_probability": float(fraud_prob),
            "risk_score": float(risk_score),
            "approved_amount": float(approved_amount),
            "status": status,
            "reason": reason
        }

        return result

    except Exception as e:
        return {
            "error": str(e),
            "status": "Failed"
        }
