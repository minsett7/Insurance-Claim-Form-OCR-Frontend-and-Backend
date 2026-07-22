from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "runtime_data"
STORE_PATH = DATA_DIR / "store.json"


FORM_TYPES: list[dict[str, str]] = [
    {"id": "health", "name": "Health", "label": "Health Claim"},
    {"id": "life", "name": "Life", "label": "Life Claim"},
    {"id": "motor", "name": "Motor", "label": "Motor Claim"},
    {"id": "fire", "name": "Fire", "label": "Fire Claim"},
]

DEFAULT_FIELD_KEYS = [
    "policy_number",
    "claim_reference",
    "form_type",
    "claimant_name",
    "insured_name",
    "nrc",
    "phone",
    "email",
    "address",
    "loss_date",
    "reported_date",
    "claim_category",
    "description",
    "amount_claimed",
    "currency",
    "payment_method",
    "bank_reference",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _default_store() -> dict[str, Any]:
    now = utc_now()
    return {
        "form_types": copy.deepcopy(FORM_TYPES),
        "templates": [
            _template("TPL-HEALTH-001", "Health Claim Template", "health", "1.0", "active", now),
            _template("TPL-LIFE-001", "Life Claim Template", "life", "1.0", "active", now),
            _template("TPL-MOTOR-001", "Motor Claim Template", "motor", "1.0", "active", now),
            _template("TPL-FIRE-001", "Fire Claim Template", "fire", "0.1", "draft", now),
        ],
        "registrations": [
            {
                "id": "REG-FIRE-001",
                "template_id": "TPL-FIRE-001",
                "form_type_id": "fire",
                "file_name": "fire-claim-blank-template.pdf",
                "status": "needs_approval",
                "fields": DEFAULT_FIELD_KEYS,
                "created_at": now,
                "approved_at": None,
            }
        ],
        "documents": [],
        "audit_events": [],
    }


def _template(
    template_id: str,
    name: str,
    form_type_id: str,
    version: str,
    status: str,
    now: str,
) -> dict[str, Any]:
    return {
        "id": template_id,
        "name": name,
        "form_type_id": form_type_id,
        "version": version,
        "status": status,
        "fields": DEFAULT_FIELD_KEYS,
        "created_at": now,
        "updated_at": now,
    }


def load_store() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STORE_PATH.exists():
        store = _default_store()
        save_store(store)
        return store

    try:
        return json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        store = _default_store()
        save_store(store)
        return store


def save_store(store: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")


def next_id(prefix: str, items: list[dict[str, Any]]) -> str:
    return f"{prefix}-{len(items) + 1:05d}"


def find_by_id(items: list[dict[str, Any]], item_id: str) -> dict[str, Any] | None:
    return next((item for item in items if item.get("id") == item_id), None)


def add_audit(store: dict[str, Any], *, actor: str, action: str, target_type: str, target_id: str) -> None:
    store.setdefault("audit_events", []).append(
        {
            "id": next_id("AUD", store.setdefault("audit_events", [])),
            "actor": actor,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "created_at": utc_now(),
        }
    )


def create_registration(store: dict[str, Any], *, file_name: str, form_type_id: str, actor: str) -> dict[str, Any]:
    template_id = next_id(f"TPL-{form_type_id.upper()}", store["templates"])
    now = utc_now()
    template = _template(
        template_id,
        f"{form_type_id.title()} Claim Template Draft",
        form_type_id,
        "0.1",
        "draft",
        now,
    )
    registration = {
        "id": next_id("REG", store["registrations"]),
        "template_id": template_id,
        "form_type_id": form_type_id,
        "file_name": file_name,
        "status": "needs_approval",
        "fields": DEFAULT_FIELD_KEYS,
        "created_at": now,
        "approved_at": None,
    }
    store["templates"].insert(0, template)
    store["registrations"].insert(0, registration)
    add_audit(store, actor=actor, action="created template draft", target_type="template", target_id=template_id)
    return registration


def create_document(store: dict[str, Any], *, file_name: str, template_id: str, actor: str) -> dict[str, Any]:
    template = find_by_id(store["templates"], template_id)
    if template is None:
        raise KeyError("template not found")
    if template.get("status") != "active":
        raise ValueError("template is not active")

    document = {
        "id": next_id("DOC", store["documents"]),
        "file_name": file_name,
        "template_id": template_id,
        "form_type_id": template["form_type_id"],
        "status": "uploaded",
        "sync_status": "not_synced",
        "raw_ocr": None,
        "processed": None,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    store["documents"].insert(0, document)
    add_audit(store, actor=actor, action="uploaded completed form", target_type="document", target_id=document["id"])
    return document

