# FormFlow OCR Frontend API Contract

This document separates the API used by the current prototype from the target API expected by the production UI.

## Current Prototype Compatibility

The frontend currently works with the FastAPI service in `backend/api/app.py`:

- `GET /api/templates`
- `GET /api/template-registrations`
- `POST /api/template-registrations`
- `PATCH /api/template-registrations/{id}/fields`
- `POST /api/template-registrations/{id}/approve`
- `GET /api/documents`
- `POST /api/documents?template_id={id}`
- `PATCH /api/documents/{id}/fields`
- `POST /api/documents/{id}/status`
- `DELETE /api/documents/{id}`
- `GET /api/audit-events`
- `GET /api/export/{json|csv|excel}`

The compatibility layer is isolated in `frontend/src/api.js`.

Template bounding boxes are temporarily cached in browser storage. The current backend stores field keys but does not store regions. Document uploads are matched in the frontend before calling the current endpoint because it still requires a `template_id`.

## Shared Coordinate Format

All template and document regions should use normalized page coordinates:

```json
{
  "x": 0.112,
  "y": 0.294,
  "width": 0.781,
  "height": 0.047
}
```

Values are relative to the page and remain between `0` and `1`. Each region must also include a `page` number.

## Target Template Registration Contract

### Create registration job

`POST /api/v1/template-registrations`

Multipart fields:

- `file`
- `name`
- `form_type_id`
- `language`
- `version_note` (optional)

Response:

```json
{
  "id": "REG-00125",
  "status": "analyzing",
  "progress": {
    "stage": "detect_regions",
    "percent": 48
  }
}
```

### Read registration draft

`GET /api/v1/template-registrations/{id}`

The response should include:

- Registration and template metadata
- Processing status and failure details
- Rendered page image URLs
- Page dimensions
- Detected regions
- Detection, label, and semantic-mapping confidence
- Model provenance

Region shape:

```json
{
  "id": "region-12",
  "page": 1,
  "key": "policyNumber",
  "label": "Policy Number",
  "data_type": "identifier",
  "language": "my-en",
  "extraction_mode": "printed",
  "required": true,
  "confidence": 0.94,
  "bbox": {
    "x": 0.57,
    "y": 0.125,
    "width": 0.32,
    "height": 0.045
  }
}
```

### Save template draft

`PUT /api/v1/template-registrations/{id}/draft`

The request should replace the complete editable region set and include a draft revision. The API should reject stale revisions with `409 Conflict`.

### Validate and approve

- `POST /api/v1/template-registrations/{id}/validate`
- `POST /api/v1/template-registrations/{id}/approve`

Approval should create an immutable template version. Editing an approved template should create a new draft version.

## Target Document Processing Contract

### Upload completed forms

`POST /api/v1/document-jobs`

The production endpoint should not require a template ID. It should accept one or more files and return asynchronous job IDs.

### Processing result

`GET /api/v1/documents/{id}`

The response should include:

- Quality-check result
- Template-match candidates and scores
- Selected template ID and immutable version
- Page image URLs and alignment transforms
- Extraction status and pipeline stage
- Extracted fields linked to source regions
- Raw and normalized values
- Field confidence
- Validation errors and warnings
- Review and synchronization status

### Override match and reprocess

- `POST /api/v1/documents/{id}/template-match`
- `POST /api/v1/documents/{id}/reprocess`

The override request should include the selected template version and an optional reason. Reprocessing should create an auditable new extraction attempt.

### Save corrections

`PUT /api/v1/documents/{id}/review`

Each corrected field should preserve:

- Original OCR value
- Corrected value
- Field and source-region IDs
- Template version
- OCR confidence
- Reviewer
- Timestamp
- Optional correction reason

### Approve and synchronize

- `POST /api/v1/documents/{id}/approve`
- `POST /api/v1/documents/{id}/sync`

Approval must fail when blocking validation errors or an unconfirmed low-confidence template match remain.

## Asynchronous Updates

Template analysis and document extraction should expose progress through either:

- Server-Sent Events, or
- WebSocket events, with polling as a fallback.

Events should contain `job_id`, `stage`, `percent`, `status`, and a user-safe failure message.

## Audit Requirements

Audit events should be immutable and include:

- Event ID
- Actor ID and display name
- Action
- Target type and ID
- Before/after summaries where applicable
- Template version or extraction attempt
- UTC timestamp

The UI expects audit events in newest-first order or with a stable sortable timestamp.

