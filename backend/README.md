# Insurance OCR Backend

FastAPI backend scaffold for the Insurance OCR project. It supports template registration, completed-form upload, OCR post-processing, human review, audit history, and export handoff.

Important: this backend does **not** contain the real OCR model. The real OCR/layout model is expected to be developed separately by the model team. For now, the backend uses `backend/api/mock_ocr.py` so the frontend and post-processing workflow can be tested.

## What This Backend Includes

- FastAPI application.
- Form type API for Health, Life, Motor, and Fire claim forms.
- Template registration endpoints.
- Completed form upload endpoints.
- Temporary mock OCR adapter.
- Post-processing integration.
- Human correction/save endpoint.
- Document status flow.
- Audit event storage.
- JSON, CSV, and Excel export endpoints.
- Simple local JSON store for development.

## What This Backend Does Not Include Yet

- Real OCR model inference.
- Real layout detection.
- Label Studio integration.
- PostgreSQL or production database.
- Authentication/login.
- User roles and permissions.
- Background job queue.
- Production file storage.
- Antivirus/file scanning.
- Production deployment config.

## Folder Structure

```text
backend/
  api/
    app.py          Main FastAPI app and API routes
    repository.py   Local JSON data store helpers
    mock_ocr.py     Temporary OCR adapter for testing
    __init__.py
  postprocessing/
    pipeline.py     Normalize and validate OCR output
    field_config.py Field aliases and validation rules
    normalizers.py  Text/date/amount/phone normalization
    validators.py   Field validation logic
    schemas.py      Data structures
    README.md
  runtime_data/
    store.json      Local development data, auto-created
  requirements.txt
  .gitignore
  README.md
```

## Requirements

- Python 3.10 or newer
- pip

Check Python:

```powershell
python --version
```

## Install

From the project root:

```powershell
cd insurance-ocr-project
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

If you do not want to create a virtual environment, you can install directly:

```powershell
cd insurance-ocr-project
pip install -r backend\requirements.txt
```

## Run API Server

From the project root:

```powershell
cd insurance-ocr-project
python -m uvicorn backend.api.app:app --reload --host 127.0.0.1 --port 8000
```

Open API docs:

```text
http://127.0.0.1:8000/docs
```

Health check:

```text
http://127.0.0.1:8000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## How Frontend Connects

Frontend should use:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

The backend allows CORS from:

```text
http://127.0.0.1:5173
http://localhost:5173
```

## Main API Endpoints

### General

```text
GET /health
GET /api/form-types
```

### Templates

```text
GET   /api/templates
GET   /api/templates/{template_id}
GET   /api/template-registrations
POST  /api/template-registrations
PATCH /api/template-registrations/{registration_id}/fields
POST  /api/template-registrations/{registration_id}/approve
```

### Documents

```text
GET    /api/documents
GET    /api/documents/{document_id}
POST   /api/documents
POST   /api/documents/{document_id}/process
PATCH  /api/documents/{document_id}/fields
POST   /api/documents/{document_id}/status
DELETE /api/documents/{document_id}
```

### Audit And Export

```text
GET /api/audit-events
GET /api/export/json
GET /api/export/csv
GET /api/export/excel
```

## Supported Upload File Types

The current API accepts:

```text
.pdf
.png
.jpg
.jpeg
.tif
.tiff
```

## Current Data Store

The backend currently stores data in:

```text
backend/runtime_data/store.json
```

This file is for local development only. It is ignored by Git.

The store contains:

- form types
- templates
- template registration jobs
- uploaded documents
- processed OCR output
- audit events

To reset local backend data, stop the server and delete:

```text
backend/runtime_data/store.json
```

The backend will recreate default data on next start.

## Current OCR Flow

Current testing flow:

```text
uploaded document
-> backend/api/mock_ocr.py
-> backend/postprocessing/process_ocr_result()
-> normalized fields
-> validation/review flags
-> backend/runtime_data/store.json
-> frontend displays result
```

`mock_ocr.py` is temporary. It returns OCR-like sample fields so frontend/backend can be tested before the real model is ready.

## Real OCR Integration Later

When the OCR/layout model is ready, replace the mock OCR part with the real model output.

Main place to connect:

```text
backend/api/mock_ocr.py
```

or the processing function in:

```text
backend/api/app.py
```

Function:

```python
_process_document_in_store()
```

Expected OCR output shape:

```json
{
  "form_type": "fire_claim",
  "source_file": "example.pdf",
  "fields": {
    "policy_number": {
      "text": "FP-2026-00124",
      "confidence": 0.96,
      "source": "team_model"
    },
    "claimant_name": {
      "text": "ဦးမင်းအောင်",
      "confidence": 0.91,
      "source": "team_model"
    }
  }
}
```

Post-processing will then:

- normalize values
- validate field formats
- detect required missing fields
- flag low confidence fields
- return structured fields to frontend

## Document Status Flow

Documents can use these statuses:

```text
uploaded
processing
needs_review
ready_to_sync
synced
failed
```

Typical flow:

```text
uploaded -> processing -> needs_review -> ready_to_sync -> synced
```

If post-processing finds missing/invalid/low-confidence fields, the document becomes:

```text
needs_review
```

If all fields pass validation, it can become:

```text
ready_to_sync
```

## Quick Manual Test

1. Run backend:

```powershell
python -m uvicorn backend.api.app:app --reload --host 127.0.0.1 --port 8000
```

2. Open:

```text
http://127.0.0.1:8000/docs
```

3. Test:

```text
GET /health
GET /api/templates
GET /api/documents
```

4. Start frontend and test upload/review/export from the UI.

## Test Post-processing Directly

From project root:

```powershell
python -m backend.postprocessing.pipeline --demo
```

This prints normalized and validated OCR output.

## GitHub Notes

Commit these:

```text
backend/api/
backend/postprocessing/
backend/requirements.txt
backend/.gitignore
backend/README.md
backend/__init__.py
```

Do not commit these:

```text
backend/runtime_data/
backend/__pycache__/
*.pyc
backend/.env
```

## Troubleshooting

If backend does not start:

- Make sure dependencies are installed:

```powershell
pip install -r backend\requirements.txt
```

- Make sure you run from project root:

```powershell
cd insurance-ocr-project
```

If frontend cannot connect:

- Confirm backend is running:

```text
http://127.0.0.1:8000/health
```

- Confirm frontend `.env` has:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```
