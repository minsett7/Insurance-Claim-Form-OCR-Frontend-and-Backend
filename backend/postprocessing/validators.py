from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation

from .schemas import FieldRule


def _blank(value: str) -> bool:
    return value.strip() == ""


def _valid_iso_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _validate_type(value: str, field_type: str) -> list[str]:
    if _blank(value):
        return []

    if field_type == "date" and not _valid_iso_date(value):
        return ["date must be valid and normalized as YYYY-MM-DD"]

    if field_type == "period":
        parts = [part.strip() for part in value.split(" - ")]
        if len(parts) != 2 or not all(_valid_iso_date(part) for part in parts):
            return ["period must contain two valid dates"]

    if field_type == "time" and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        return ["time must be valid and normalized as HH:MM"]

    if field_type == "amount":
        try:
            amount = Decimal(value)
        except InvalidOperation:
            return ["amount must be numeric"]
        if amount < 0:
            return ["amount must not be negative"]

    if field_type == "email" and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
        return ["email format is invalid"]

    if field_type == "phone":
        digits = re.sub(r"\D", "", value)
        if not 6 <= len(digits) <= 15:
            return ["phone number must contain 6 to 15 digits"]

    if field_type in {"policy_number", "claim_reference", "reference"}:
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9/_-]{2,59}", value):
            return ["identifier format is invalid"]

    if field_type == "nrc" and not re.fullmatch(r"\d{1,2}/.+\(.+\)\d{5,6}", value):
        return ["NRC format is invalid"]

    if field_type == "currency" and not re.fullmatch(r"[A-Z]{3}", value):
        return ["currency must be a three-letter code"]

    return []


def validate_field(value: str, rule: FieldRule, confidence: float | None) -> tuple[bool, bool, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if rule.required and _blank(value):
        errors.append("required field is missing")

    if not _blank(value):
        errors.extend(_validate_type(value, rule.field_type))

    if rule.pattern and not _blank(value) and not re.fullmatch(rule.pattern, value):
        errors.append("value does not match the configured pattern")

    if rule.allowed_values and not _blank(value):
        allowed = {item.lower() for item in rule.allowed_values}
        if value.lower() not in allowed:
            errors.append("value is not in the configured allowed values")

    if confidence is None:
        warnings.append("confidence score is missing")
    elif confidence < rule.min_confidence:
        warnings.append(f"low confidence: {confidence:.2f} below {rule.min_confidence:.2f}")

    is_valid = not errors
    requires_review = bool(errors or warnings)
    return is_valid, requires_review, errors, warnings
