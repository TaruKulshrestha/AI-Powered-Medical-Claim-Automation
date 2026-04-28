def verify_claim_data(manual_data, bill_data):
    """
    Compare manual form data with bill extracted data
    """

    mismatches = {}

    for key in manual_data:
        if key in bill_data:
            if str(manual_data[key]).strip() != str(bill_data[key]).strip():
                mismatches[key] = {
                    "manual_value": manual_data[key],
                    "bill_value": bill_data[key]
                }

    if len(mismatches) == 0:
        return {
            "status": "verified",
            "message": "Manual details match with bill"
        }

    return {
        "status": "mismatch",
        "mismatched_fields": mismatches
    }
