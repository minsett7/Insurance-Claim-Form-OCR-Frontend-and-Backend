from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import Body, FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.postprocessing import process_ocr_result

from .mock_ocr import mock_ocr_result
from .repository import (
    FORM_TYPES,
    add_audit,
    create_document,
    create_registration,
    find_by_id,
    load_store,
    save_store,
    utc_now,
)


app = FastAPI(title="Insurance OCR API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}


def _extension(file_name: str) -> str:
    dot = file_name.rfind(".")
    return file_name[dot:].lower() if dot >= 0 else ""


def _validate_file(file: UploadFile) -> None:
    if _extension(file.filename or "") not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"unsupported file type: {file.filename}")


def _form_type_to_postprocessing_key(form_type_id: str) -> str:
    return f"{form_type_id}_claim"


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "Insurance OCR API", "status": "running"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/form-types")
def list_form_types() -> list[dict[str, str]]:
    return FORM_TYPES


@app.get("/api/templates")
def list_templates() -> list[dict[str, Any]]:
    return load_store()["templates"]


@app.get("/api/templates/{template_id}")
def get_template(template_id: str) -> dict[str, Any]:
    template = find_by_id(load_store()["templates"], template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="template not found")
    return template


@app.get("/api/template-registrations")
def list_template_registrations() -> list[dict[str, Any]]:
    return load_store()["registrations"]


@app.post("/api/template-registrations")
async def register_templates(
    form_type_id: str = Query(..., pattern="^(health|life|motor|fire)$"),
    files: list[UploadFile] = File(...),
    actor: str = Query("system"),
) -> dict[str, Any]:
    store = load_store()
    created = []
    for file in files:
        _validate_file(file)
        created.append(create_registration(store, file_name=file.filename or "uploaded-template", form_type_id=form_type_id, actor=actor))
    save_store(store)
    return {"items": created}


@app.post("/api/template-registrations/{registration_id}/approve")
def approve_template_registration(registration_id: str, actor: str = Query("system")) -> dict[str, Any]:
    store = load_store()
    registration = find_by_id(store["registrations"], registration_id)
    if registration is None:
        raise HTTPException(status_code=404, detail="registration not found")

    template = find_by_id(store["templates"], registration["template_id"])
    if template is None:
        raise HTTPException(status_code=404, detail="template not found")

    now = utc_now()
    registration["status"] = "registered"
    registration["approved_at"] = now
    template["status"] = "active"
    template["updated_at"] = now
    template["fields"] = registration.get("fields", template.get("fields", []))
    add_audit(store, actor=actor, action="approved template", target_type="template", target_id=template["id"])
    save_store(store)
    return {"registration": registration, "template": template}


@app.patch("/api/template-registrations/{registration_id}/fields")
def update_template_registration_fields(
    registration_id: str,
    payload: dict[str, Any] = Body(...),
    actor: str = Query("reviewer"),
) -> dict[str, Any]:
    if not isinstance(payload.get("fields"), list):
        raise HTTPException(status_code=400, detail="payload.fields must be a list")

    store = load_store()
    registration = find_by_id(store["registrations"], registration_id)
    if registration is None:
        raise HTTPException(status_code=404, detail="registration not found")

    template = find_by_id(store["templates"], registration["template_id"])
    fields = [str(field) for field in payload["fields"]]
    registration["fields"] = fields
    if template is not None:
        template["fields"] = fields
        template["updated_at"] = utc_now()
    add_audit(store, actor=actor, action="updated template field map", target_type="template", target_id=registration["template_id"])
    save_store(store)
    return registration


@app.get("/api/documents")
def list_documents() -> list[dict[str, Any]]:
    return load_store()["documents"]


@app.get("/api/documents/{document_id}")
def get_document(document_id: str) -> dict[str, Any]:
    document = find_by_id(load_store()["documents"], document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="document not found")
    return document


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str, actor: str = Query("reviewer")) -> dict[str, str]:
    store = load_store()
    original_count = len(store["documents"])
    store["documents"] = [document for document in store["documents"] if document.get("id") != document_id]
    if len(store["documents"]) == original_count:
        raise HTTPException(status_code=404, detail="document not found")
    add_audit(store, actor=actor, action="deleted document", target_type="document", target_id=document_id)
    save_store(store)
    return {"status": "deleted", "id": document_id}


@app.post("/api/documents")
async def upload_documents(
    template_id: str = Query(...),
    files: list[UploadFile] = File(...),
    actor: str = Query("system"),
    process_immediately: bool = Query(True),
) -> dict[str, Any]:
    store = load_store()
    created = []
    for file in files:
        _validate_file(file)
        try:
            document = create_document(store, file_name=file.filename or "uploaded-document", template_id=template_id, actor=actor)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        if process_immediately:
            _process_document_in_store(store, document)
        created.append(document)

    save_store(store)
    return {"items": created}


@app.post("/api/documents/{document_id}/process")
def process_document(
    document_id: str,
    raw_ocr: dict[str, Any] | None = Body(default=None),
    actor: str = Query("system"),
) -> dict[str, Any]:
    store = load_store()
    document = find_by_id(store["documents"], document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="document not found")

    _process_document_in_store(store, document, raw_ocr=raw_ocr, actor=actor)
    save_store(store)
    return document


@app.patch("/api/documents/{document_id}/fields")
def update_document_fields(
    document_id: str,
    payload: dict[str, Any] = Body(...),
    actor: str = Query("reviewer"),
) -> dict[str, Any]:
    store = load_store()
    document = find_by_id(store["documents"], document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="document not found")
    if not isinstance(payload.get("fields"), dict):
        raise HTTPException(status_code=400, detail="payload.fields must be an object")

    processed = document.setdefault("processed", {"fields": {}, "summary": {}})
    fields = processed.setdefault("fields", {})
    for key, value in payload["fields"].items():
        current = fields.setdefault(
            key,
            {
                "raw_value": "",
                "value": "",
                "confidence": None,
                "source": "human",
                "field_type": "text",
                "is_valid": True,
                "requires_review": False,
                "errors": [],
                "warnings": [],
                "input_field": key,
                "label": key.replace("_", " ").title(),
            },
        )
        current["value"] = str(value)
        current["source"] = "human_correction"
        current["requires_review"] = False
        current["errors"] = []

    document["status"] = "needs_review"
    document["updated_at"] = utc_now()
    add_audit(store, actor=actor, action="saved human corrections", target_type="document", target_id=document_id)
    save_store(store)
    return document


@app.post("/api/documents/{document_id}/status")
def update_document_status(
    document_id: str,
    payload: dict[str, str] = Body(...),
    actor: str = Query("reviewer"),
) -> dict[str, Any]:
    status = payload.get("status")
    if status not in {"uploaded", "processing", "needs_review", "ready_to_sync", "synced", "failed"}:
        raise HTTPException(status_code=400, detail="invalid status")

    store = load_store()
    document = find_by_id(store["documents"], document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="document not found")

    document["status"] = status
    document["updated_at"] = utc_now()
    if status == "synced":
        document["sync_status"] = "synced"
    add_audit(store, actor=actor, action=f"changed status to {status}", target_type="document", target_id=document_id)
    save_store(store)
    return document


@app.get("/api/audit-events")
def list_audit_events() -> list[dict[str, Any]]:
    return load_store().get("audit_events", [])


@app.get("/api/export/json")
def export_json() -> dict[str, Any]:
    store = load_store()
    return {
        "exported_at": utc_now(),
        "templates": store["templates"],
        "registrations": store["registrations"],
        "documents": store["documents"],
    }


@app.get("/api/export/csv")
def export_csv() -> Response:
    store = load_store()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["document_id", "file_name", "form_type", "status", "sync_status", "policy_number", "claim_reference", "claimant_name", "amount_claimed"])
    for document in store["documents"]:
        fields = (document.get("processed") or {}).get("fields", {})
        writer.writerow(
            [
                document.get("id"),
                document.get("file_name"),
                document.get("form_type_id"),
                document.get("status"),
                document.get("sync_status"),
                fields.get("policy_number", {}).get("value", ""),
                fields.get("claim_reference", {}).get("value", ""),
                fields.get("claimant_name", {}).get("value", ""),
                fields.get("amount_claimed", {}).get("value", ""),
            ]
        )
    return Response(
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=insurance-ocr-records.csv"},
    )


@app.get("/api/export/excel")
def export_excel() -> Response:
    store = load_store()
    rows = []
    for document in store["documents"]:
        fields = (document.get("processed") or {}).get("fields", {})
        rows.append(
            "<tr>"
            f"<td>{document.get('id', '')}</td>"
            f"<td>{document.get('file_name', '')}</td>"
            f"<td>{document.get('form_type_id', '')}</td>"
            f"<td>{document.get('status', '')}</td>"
            f"<td>{fields.get('policy_number', {}).get('value', '')}</td>"
            f"<td>{fields.get('claimant_name', {}).get('value', '')}</td>"
            f"<td>{fields.get('amount_claimed', {}).get('value', '')}</td>"
            f"<td>{fields.get('currency', {}).get('value', '')}</td>"
            "</tr>"
        )

    html = (
        "<html><head><meta charset=\"utf-8\" /></head><body><table>"
        "<thead><tr><th>Document ID</th><th>File</th><th>Form Type</th><th>Status</th>"
        "<th>Policy</th><th>Claimant</th><th>Amount</th><th>Currency</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table></body></html>"
    )
    return Response(
        content=html,
        media_type="application/vnd.ms-excel; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=insurance-ocr-records.xls"},
    )


def _process_document_in_store(
    store: dict[str, Any],
    document: dict[str, Any],
    *,
    raw_ocr: dict[str, Any] | None = None,
    actor: str = "system",
) -> None:
    form_type_id = document["form_type_id"]
    document["status"] = "processing"
    document["raw_ocr"] = raw_ocr or mock_ocr_result(document["file_name"], form_type_id)
    document["processed"] = process_ocr_result(
        document["raw_ocr"],
        form_type=_form_type_to_postprocessing_key(form_type_id),
    )
    document["status"] = "needs_review" if document["processed"]["requires_review"] else "ready_to_sync"
    document["updated_at"] = utc_now()
    add_audit(store, actor=actor, action="processed OCR result", target_type="document", target_id=document["id"])
