from __future__ import annotations

from typing import Any


def mock_ocr_result(file_name: str, form_type_id: str) -> dict[str, Any]:
    """Temporary OCR adapter.

    Replace this function with the real OCR/layout inference integration when the
    model service is ready. Keep the output shape stable for post-processing.
    """

    prefix = {
        "health": "HLT",
        "life": "LFE",
        "motor": "MTR",
        "fire": "FIR",
    }.get(form_type_id, "GEN")

    category = {
        "health": "Medical reimbursement",
        "life": "Life payout",
        "motor": "Vehicle accident",
        "fire": "Fire damage",
    }.get(form_type_id, "Insurance claim")

    return {
        "form_type": f"{form_type_id}_claim",
        "source_file": file_name,
        "fields": {
            "policy no": {"text": f" {prefix} - 2026 - 00124 ", "confidence": 0.93, "source": "mock_ocr"},
            "report_no": {"text": "CLM / 2026 / 045", "confidence": 0.84, "source": "mock_ocr"},
            "full_name": {"text": "Pending Review", "confidence": 0.68, "source": "mock_ocr"},
            "phone": {"text": "09 4500 12345", "confidence": 0.88, "source": "mock_ocr"},
            "claim_date": {"text": "21/07/2026", "confidence": 0.86, "source": "mock_ocr"},
            "category": {"text": category, "confidence": 0.82, "source": "mock_ocr"},
            "total_claim": {"text": "15,000,000 MMK", "confidence": 0.81, "source": "mock_ocr"},
            "currency_code": {"text": "MMK", "confidence": 0.95, "source": "mock_ocr"},
            "remarks": {"text": "Review handwritten fields before approval.", "confidence": 0.62, "source": "mock_ocr"},
        },
    }

