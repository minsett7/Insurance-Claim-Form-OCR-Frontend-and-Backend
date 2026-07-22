from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Mapping

from .field_config import get_field_rules, key_slug, resolve_field_name
from .normalizers import normalize_by_type
from .schemas import FieldRule, OcrField, ProcessedField
from .validators import validate_field


def _confidence(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    if score > 1 and score <= 100:
        score = score / 100
    return max(0.0, min(score, 1.0))


def _coerce_ocr_field(value: object) -> OcrField:
    if isinstance(value, Mapping):
        raw_text = value.get("text", value.get("raw_text", value.get("value", "")))
        confidence = value.get("confidence", value.get("score", value.get("probability")))
        source = value.get("source", value.get("engine", "unknown"))
        return OcrField(raw_text=str(raw_text or ""), confidence=_confidence(confidence), source=str(source or "unknown"))

    return OcrField(raw_text=str(value or ""), confidence=None, source="unknown")


def _extract_field_mapping(ocr_result: Mapping[str, Any]) -> tuple[str | None, Mapping[str, Any]]:
    fields = ocr_result.get("fields")
    form_type = ocr_result.get("form_type")
    if isinstance(fields, Mapping):
        return str(form_type) if form_type else None, fields
    return str(form_type) if form_type else None, ocr_result


def _choose_best_input(entries: list[tuple[str, OcrField, FieldRule, bool]]) -> tuple[str, OcrField, FieldRule, bool]:
    def rank(entry: tuple[str, OcrField, FieldRule, bool]) -> tuple[int, float]:
        _, ocr_field, _, _ = entry
        has_text = 1 if ocr_field.raw_text.strip() else 0
        confidence = ocr_field.confidence if ocr_field.confidence is not None else -1.0
        return has_text, confidence

    return max(entries, key=rank)


def _process_single_field(rule: FieldRule, ocr_field: OcrField) -> ProcessedField:
    value = normalize_by_type(ocr_field.raw_text, rule.field_type)
    is_valid, requires_review, errors, warnings = validate_field(value, rule, ocr_field.confidence)
    return ProcessedField(
        raw_value=ocr_field.raw_text,
        value=value,
        confidence=ocr_field.confidence,
        source=ocr_field.source,
        field_type=rule.field_type,
        is_valid=is_valid,
        requires_review=requires_review,
        errors=errors,
        warnings=warnings,
    )


def process_ocr_result(
    ocr_result: Mapping[str, Any],
    *,
    form_type: str = "generic",
    include_unknown_fields: bool = True,
) -> dict[str, Any]:
    """Normalize and validate raw OCR field output.

    Accepted input formats:
    - {"policy_number": "POL-001"}
    - {"policy_number": {"text": "POL-001", "confidence": 0.92, "source": "printed_ocr"}}
    - {"form_type": "property_claim", "fields": {...}}
    """

    detected_form_type, raw_fields = _extract_field_mapping(ocr_result)
    active_form_type = detected_form_type or form_type
    rules = get_field_rules(active_form_type)
    grouped: dict[str, list[tuple[str, OcrField, FieldRule, bool]]] = {}

    for raw_key, raw_value in raw_fields.items():
        canonical = resolve_field_name(str(raw_key), rules)
        unknown = canonical is None
        if unknown:
            if not include_unknown_fields:
                continue
            canonical = key_slug(str(raw_key)) or "unknown_field"
            rule = FieldRule(
                name=canonical,
                label=str(raw_key),
                field_type="text",
                required=False,
                min_confidence=0.0,
            )
        else:
            rule = rules[canonical]

        grouped.setdefault(canonical, []).append((str(raw_key), _coerce_ocr_field(raw_value), rule, unknown))

    processed_fields: dict[str, dict[str, Any]] = {}

    for canonical, entries in grouped.items():
        raw_key, ocr_field, rule, unknown = _choose_best_input(entries)
        processed = _process_single_field(rule, ocr_field)

        if unknown:
            processed.warnings.append("field is not defined in the active form configuration")
            processed.requires_review = True

        if len(entries) > 1:
            keys = ", ".join(entry[0] for entry in entries)
            processed.warnings.append(f"multiple OCR inputs mapped to this field: {keys}")
            processed.requires_review = True

        output = processed.to_dict()
        output["input_field"] = raw_key
        output["label"] = rule.label
        processed_fields[canonical] = output

    for canonical, rule in rules.items():
        if rule.required and canonical not in processed_fields:
            missing = _process_single_field(rule, OcrField(raw_text="", confidence=None, source="missing"))
            output = missing.to_dict()
            output["input_field"] = None
            output["label"] = rule.label
            processed_fields[canonical] = output

    invalid_fields = [name for name, field in processed_fields.items() if not field["is_valid"]]
    review_fields = [name for name, field in processed_fields.items() if field["requires_review"]]
    low_confidence_fields = [
        name
        for name, field in processed_fields.items()
        if any(str(warning).startswith("low confidence") for warning in field["warnings"])
    ]
    configured_count = len(rules)
    present_configured = sum(
        1 for name, field in processed_fields.items() if name in rules and str(field["value"]).strip()
    )

    return {
        "form_type": active_form_type,
        "is_valid": not invalid_fields,
        "requires_review": bool(review_fields),
        "fields": processed_fields,
        "summary": {
            "field_count": len(processed_fields),
            "configured_field_count": configured_count,
            "present_configured_field_count": present_configured,
            "completion_rate": round(present_configured / configured_count, 4) if configured_count else 0.0,
            "invalid_fields": invalid_fields,
            "review_fields": review_fields,
            "low_confidence_fields": low_confidence_fields,
        },
    }


def process_ocr_json_file(
    input_path: str | Path,
    output_path: str | Path | None = None,
    *,
    form_type: str = "generic",
) -> dict[str, Any]:
    input_file = Path(input_path)
    data = json.loads(input_file.read_text(encoding="utf-8"))
    result = process_ocr_result(data, form_type=form_type)

    if output_path is not None:
        Path(output_path).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    return result


def _demo_payload() -> dict[str, Any]:
    return {
        "form_type": "property_claim",
        "fields": {
            "policy no": {"text": " FP - 2026 - 00124 ", "confidence": 0.94, "source": "printed_ocr"},
            "report_no": {"text": "CLM / 2026 / 045", "confidence": 0.83, "source": "printed_ocr"},
            "full_name": {"text": " Aung Min ", "confidence": 0.72, "source": "handwritten_ocr"},
            "phone": {"text": "09 4500 12345", "confidence": 0.91, "source": "printed_ocr"},
            "email": {"text": "Claims@Example.Com ", "confidence": 0.96, "source": "printed_ocr"},
            "date_of_occurrence": {"text": "၁၅/၀၃/၂၀၂၆", "confidence": 0.9, "source": "printed_ocr"},
            "time_of_loss": {"text": "22.30", "confidence": 0.88, "source": "printed_ocr"},
            "total_claim": {"text": "15,000,000 MMK", "confidence": 0.86, "source": "printed_ocr"},
        },
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Post-process raw insurance OCR JSON output.")
    parser.add_argument("input", nargs="?", help="Path to raw OCR JSON input.")
    parser.add_argument("-o", "--output", help="Path to write processed JSON.")
    parser.add_argument("--form-type", default="generic", help="Form configuration to use.")
    parser.add_argument("--demo", action="store_true", help="Run the built-in demo payload.")
    args = parser.parse_args()

    if args.demo:
        result = process_ocr_result(_demo_payload(), form_type=args.form_type)
    elif args.input:
        result = process_ocr_json_file(args.input, args.output, form_type=args.form_type)
    else:
        parser.error("provide an input JSON file or use --demo")
        return

    if not args.output:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
