# OCR Post-processing Layer

This package owns the layer after OCR inference and before review, storage, or CSV export.

It does not crop forms, train OCR models, or render the frontend. It accepts raw OCR field output, cleans each value, validates business rules, and returns structured JSON with review flags.

## Main Entry Point

```python
from backend.postprocessing import process_ocr_result

raw_ocr = {
    "form_type": "property_claim",
    "fields": {
        "policy no": {"text": " FP - 2026 - 00124 ", "confidence": 0.94, "source": "printed_ocr"},
        "full_name": {"text": " Aung Min ", "confidence": 0.72, "source": "handwritten_ocr"},
        "total_claim": {"text": "15,000,000 MMK", "confidence": 0.86, "source": "printed_ocr"},
    },
}

processed = process_ocr_result(raw_ocr)
```

## Output Shape

```json
{
  "form_type": "property_claim",
  "is_valid": true,
  "requires_review": true,
  "fields": {
    "policy_number": {
      "raw_value": " FP - 2026 - 00124 ",
      "value": "FP-2026-00124",
      "confidence": 0.94,
      "source": "printed_ocr",
      "field_type": "policy_number",
      "is_valid": true,
      "requires_review": false,
      "errors": [],
      "warnings": [],
      "input_field": "policy no",
      "label": "Policy number"
    }
  }
}
```

## What It Handles

- Unicode text cleanup
- Myanmar digit to ASCII digit normalization
- Policy/reference number cleanup
- Phone, email, NRC, amount, currency, date, period, and time normalization
- Required field validation
- Field-type validation
- Confidence threshold review flags
- Unknown field review flags
- Generic form configuration for multiple insurance form types

## CLI Check

From the project root:

```powershell
python -m backend.postprocessing.pipeline --demo
```

Process a raw OCR JSON file:

```powershell
python -m backend.postprocessing.pipeline raw_ocr.json -o processed_ocr.json --form-type property_claim
```

## Extending for a New Form Type

Add or override field rules in `field_config.py`.

Use aliases to map OCR/model output names to canonical system fields. Keep form-specific rules in configuration instead of hard-coding them in the pipeline.
