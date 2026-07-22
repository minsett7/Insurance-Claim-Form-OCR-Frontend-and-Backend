from __future__ import annotations

import re

from .normalizers import normalize_text
from .schemas import FieldRule


def key_slug(value: str) -> str:
    text = normalize_text(value).lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


GENERIC_INSURANCE_FIELDS: dict[str, FieldRule] = {
    "policy_number": FieldRule(
        name="policy_number",
        label="Policy number",
        field_type="policy_number",
        required=True,
        min_confidence=0.85,
        aliases=("policy", "policy_no", "policy no", "policy number"),
    ),
    "claim_reference": FieldRule(
        name="claim_reference",
        label="Claim/reference number",
        field_type="claim_reference",
        required=True,
        min_confidence=0.85,
        aliases=("claim_number", "claim no", "claim_id", "reference_no", "report_no", "reference number"),
    ),
    "form_type": FieldRule(
        name="form_type",
        label="Form type",
        field_type="category",
        required=False,
        min_confidence=0.75,
        aliases=("document_type", "template_type", "claim_type"),
    ),
    "claimant_name": FieldRule(
        name="claimant_name",
        label="Claimant name",
        field_type="name",
        required=True,
        min_confidence=0.75,
        aliases=("full_name", "policyholder_name", "customer_name", "claimant"),
    ),
    "insured_name": FieldRule(
        name="insured_name",
        label="Insured name",
        field_type="name",
        required=False,
        min_confidence=0.75,
        aliases=("insured_member_name", "insured", "member_name"),
    ),
    "nrc": FieldRule(
        name="nrc",
        label="NRC",
        field_type="nrc",
        required=False,
        min_confidence=0.8,
        aliases=("national_id", "registration_no", "id_number"),
    ),
    "phone": FieldRule(
        name="phone",
        label="Phone",
        field_type="phone",
        required=False,
        min_confidence=0.8,
        aliases=("mobile", "phone_number", "contact_number", "telephone"),
    ),
    "email": FieldRule(
        name="email",
        label="Email",
        field_type="email",
        required=False,
        min_confidence=0.8,
        aliases=("email_address", "e_mail"),
    ),
    "address": FieldRule(
        name="address",
        label="Address",
        field_type="address",
        required=False,
        min_confidence=0.7,
        aliases=("claimant_address", "mailing_address", "insured_address"),
    ),
    "loss_date": FieldRule(
        name="loss_date",
        label="Loss date",
        field_type="date",
        required=False,
        min_confidence=0.8,
        aliases=("date_of_occurrence", "incident_date", "claim_date", "loss_date"),
    ),
    "reported_date": FieldRule(
        name="reported_date",
        label="Reported date",
        field_type="date",
        required=False,
        min_confidence=0.8,
        aliases=("report_date", "notification_date", "submitted_date"),
    ),
    "loss_time": FieldRule(
        name="loss_time",
        label="Loss time",
        field_type="time",
        required=False,
        min_confidence=0.75,
        aliases=("time_of_loss", "incident_time", "occurrence_time"),
    ),
    "period_of_insurance": FieldRule(
        name="period_of_insurance",
        label="Period of insurance",
        field_type="period",
        required=False,
        min_confidence=0.8,
        aliases=("period", "insurance_period", "policy_period"),
    ),
    "claim_category": FieldRule(
        name="claim_category",
        label="Claim category",
        field_type="category",
        required=False,
        min_confidence=0.75,
        aliases=("category", "cause", "cause_of_loss", "loss_type"),
    ),
    "description": FieldRule(
        name="description",
        label="Description",
        field_type="text",
        required=False,
        min_confidence=0.65,
        aliases=("claim_description", "detailed_narrative", "narrative", "remarks", "notes"),
    ),
    "amount_claimed": FieldRule(
        name="amount_claimed",
        label="Amount claimed",
        field_type="amount",
        required=False,
        min_confidence=0.8,
        aliases=("amount", "claim_amount", "total_claim", "total_net_claim", "net_claim"),
    ),
    "currency": FieldRule(
        name="currency",
        label="Currency",
        field_type="currency",
        required=False,
        min_confidence=0.8,
        aliases=("currency_code",),
    ),
    "payment_method": FieldRule(
        name="payment_method",
        label="Payment method",
        field_type="text",
        required=False,
        min_confidence=0.75,
        aliases=("settlement_method", "pay_method"),
    ),
    "bank_reference": FieldRule(
        name="bank_reference",
        label="Bank/reference number",
        field_type="reference",
        required=False,
        min_confidence=0.75,
        aliases=("bank_ref", "payment_reference", "account_reference"),
    ),
}

FORM_CONFIGS: dict[str, dict[str, FieldRule]] = {
    "generic": GENERIC_INSURANCE_FIELDS,
    "property_claim": GENERIC_INSURANCE_FIELDS,
    "motor_claim": GENERIC_INSURANCE_FIELDS,
    "health_claim": GENERIC_INSURANCE_FIELDS,
    "life_claim": GENERIC_INSURANCE_FIELDS,
    "marine_cargo_claim": GENERIC_INSURANCE_FIELDS,
    "travel_claim": GENERIC_INSURANCE_FIELDS,
}


def get_field_rules(form_type: str = "generic") -> dict[str, FieldRule]:
    key = key_slug(form_type) or "generic"
    return dict(FORM_CONFIGS.get(key, GENERIC_INSURANCE_FIELDS))


def get_registered_form_types() -> list[str]:
    return sorted(FORM_CONFIGS)


def resolve_field_name(field_name: str, rules: dict[str, FieldRule]) -> str | None:
    slug = key_slug(field_name)
    if slug in rules:
        return slug

    for canonical_name, rule in rules.items():
        aliases = {key_slug(alias) for alias in rule.aliases}
        aliases.add(key_slug(rule.label))
        if slug in aliases:
            return canonical_name

    return None
