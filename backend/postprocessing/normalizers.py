from __future__ import annotations

import re
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation


MYANMAR_DIGITS = "၀၁၂၃၄၅၆၇၈၉"
ASCII_DIGITS = "0123456789"
ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
EXTENDED_ARABIC_INDIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹"

_DIGIT_TRANSLATION = str.maketrans(
    MYANMAR_DIGITS + ARABIC_INDIC_DIGITS + EXTENDED_ARABIC_INDIC_DIGITS,
    ASCII_DIGITS * 3,
)

_DASH_TRANSLATION = str.maketrans({
    "‐": "-",
    "‑": "-",
    "‒": "-",
    "–": "-",
    "—": "-",
    "−": "-",
})

_ZERO_WIDTH = re.compile(r"[\u200b\u200c\u200d\ufeff]")
_WHITESPACE = re.compile(r"\s+")


def normalize_text(value: object) -> str:
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFC", text)
    text = text.translate(_DASH_TRANSLATION)
    text = text.replace("\u00a0", " ")
    text = _ZERO_WIDTH.sub("", text)
    return _WHITESPACE.sub(" ", text).strip()


def normalize_digits(value: object) -> str:
    return normalize_text(value).translate(_DIGIT_TRANSLATION)


def _fix_numeric_ocr_chars(value: str) -> str:
    return value.translate(str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "|": "1"}))


def normalize_identifier(value: object) -> str:
    text = normalize_digits(value).upper()
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"-{2,}", "-", text)
    return text.strip("-")


def normalize_policy_number(value: object) -> str:
    return normalize_identifier(value)


def normalize_reference(value: object) -> str:
    return normalize_identifier(value)


def normalize_name(value: object) -> str:
    return normalize_text(value)


def normalize_address(value: object) -> str:
    return normalize_text(value)


def normalize_phone(value: object) -> str:
    text = _fix_numeric_ocr_chars(normalize_digits(value))
    prefix = "+" if text.strip().startswith("+") else ""
    digits = re.sub(r"\D", "", text)
    return f"{prefix}{digits}" if digits else normalize_text(value)


def normalize_email(value: object) -> str:
    return re.sub(r"\s+", "", normalize_text(value)).lower()


def normalize_nrc(value: object) -> str:
    text = normalize_digits(value)
    text = re.sub(r"\s+", "", text)
    text = text.replace("[", "(").replace("]", ")")
    text = text.replace("{", "(").replace("}", ")")
    return text


def normalize_amount(value: object) -> str:
    text = _fix_numeric_ocr_chars(normalize_digits(value))
    text = re.sub(r"(?i)\b(mmk|kyat|ks|usd|dollar|eur)\b", "", text)
    text = text.replace(",", "")
    text = re.sub(r"[^\d.\-]", "", text)

    if text.count(".") > 1:
        first, rest = text.split(".", 1)
        text = first + "." + rest.replace(".", "")

    if text in {"", "-", ".", "-."}:
        return normalize_text(value)

    try:
        amount = Decimal(text)
    except InvalidOperation:
        return normalize_text(value)

    if amount == amount.to_integral_value():
        return str(int(amount))
    return format(amount.normalize(), "f")


def normalize_currency(value: object) -> str:
    text = normalize_text(value).upper()
    if text in {"K", "KS", "KYAT", "MMK."}:
        return "MMK"
    return re.sub(r"[^A-Z]", "", text)


def _two_digit_year(year: int) -> int:
    return 2000 + year if year < 50 else 1900 + year


def normalize_date(value: object) -> str:
    text = _fix_numeric_ocr_chars(normalize_digits(value))
    numbers = re.findall(r"\d{1,4}", text)
    if len(numbers) < 3:
        return normalize_text(value)

    if len(numbers[0]) == 4:
        year, month, day = int(numbers[0]), int(numbers[1]), int(numbers[2])
    else:
        day, month, year = int(numbers[0]), int(numbers[1]), int(numbers[2])
        if year < 100:
            year = _two_digit_year(year)

    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return normalize_text(value)


def normalize_period(value: object) -> str:
    text = normalize_text(value)
    parts = re.split(r"\s+(?:-|to|until|through)\s+", text, maxsplit=1, flags=re.IGNORECASE)
    if len(parts) != 2:
        return text
    start = normalize_date(parts[0])
    end = normalize_date(parts[1])
    return f"{start} - {end}"


def normalize_time(value: object) -> str:
    text = _fix_numeric_ocr_chars(normalize_digits(value))
    ampm_match = re.search(r"(?i)\b(am|pm)\b", text)
    match = re.search(r"(\d{1,2})\s*[:.]\s*(\d{1,2})", text)
    if not match:
        return normalize_text(value)

    hour = int(match.group(1))
    minute = int(match.group(2))
    if minute > 59:
        return normalize_text(value)

    if ampm_match:
        marker = ampm_match.group(1).lower()
        if marker == "pm" and hour < 12:
            hour += 12
        if marker == "am" and hour == 12:
            hour = 0

    if hour > 23:
        return normalize_text(value)
    return f"{hour:02d}:{minute:02d}"


def normalize_by_type(value: object, field_type: str) -> str:
    normalizers = {
        "text": normalize_text,
        "name": normalize_name,
        "address": normalize_address,
        "policy_number": normalize_policy_number,
        "claim_reference": normalize_reference,
        "reference": normalize_reference,
        "phone": normalize_phone,
        "email": normalize_email,
        "nrc": normalize_nrc,
        "date": normalize_date,
        "period": normalize_period,
        "time": normalize_time,
        "amount": normalize_amount,
        "currency": normalize_currency,
        "category": normalize_text,
    }
    return normalizers.get(field_type, normalize_text)(value)
