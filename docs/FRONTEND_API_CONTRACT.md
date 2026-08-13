# FormFlow OCR Frontend API Contract

This document separates the optional standalone prototype API from the canonical orchestrator API used by the umbrella production UI.

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

The standalone prototype retains its compatibility behavior. In the umbrella stack, template regions are persisted by the orchestrator and browser storage is not authoritative.

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

## Canonical Template Registration Contract

### Manage form categories

- `GET /api/v1/form-categories`
- `POST /api/v1/form-categories` with `name` and optional `description`
- `PATCH /api/v1/form-categories/{id}` to rename or update its description
- `DELETE /api/v1/form-categories/{id}` to archive an unused category

The API returns `409 Conflict` when a category is still referenced by an active draft or approved
template. Category IDs remain stable across renames.

### Create registration job

`POST /api/v1/template-registrations`

Multipart fields:

- `file`
- `name` (required, maximum 160 characters)
- `description` (optional, maximum 2,000 characters)
- `form_type_id`
- `language`
- `version_note` (optional)
- `preprocessing_policy`: `auto`, `force`, or `none` (optional)

Response:

```json
{
  "id": "REG-00125",
  "status": "validating",
  "progress": {
    "stage": "upload_validation",
    "percent": 5
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

For multi-page drafts, page metadata and regions are related by the one-based `page_number` / `page`
pair:

```json
{
  "draft": {
    "pages": [
      {
        "page_id": "page_001",
        "page_number": 1,
        "width": 1200,
        "height": 1600,
        "image_url": "/api/v1/template-registrations/REG-00125/pages/1"
      },
      {
        "page_id": "page_002",
        "page_number": 2,
        "width": 1200,
        "height": 1600,
        "image_url": "/api/v1/template-registrations/REG-00125/pages/2"
      }
    ],
    "regions": [
      {"id": "region_page_001_0012", "page": 1, "bbox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.04}},
      {"id": "region_page_002_0008", "page": 2, "bbox": {"x": 0.2, "y": 0.4, "width": 0.35, "height": 0.05}}
    ]
  }
}
```

The page image endpoint is `GET /api/v1/template-registrations/{id}/pages/{page_number}`.
It returns the stored canonical PNG for that page and returns 404 for an unknown page.

Region shape:

```json
{
  "id": "region_page_001_region_0012",
  "field_id": "field_vehicle_type_truck",
  "page": 1,
  "key": "vehicle_type_truck",
  "label": "Policy Number",
  "data_type": "multiple_choice",
  "language": "my-en",
  "extraction_mode": "checkbox",
  "required": true,
  "confidence": 0.94,
  "bbox": {
    "x": 0.438,
    "y": 0.588,
    "width": 0.024,
    "height": 0.020
  },
  "source_region_ids": ["region_page_001_region_0012"],
  "review_flags": [],
  "enabled": true,
  "geometry_source": "PP-DocLayoutV3"
}
```

### Save template draft

`PUT /api/v1/template-registrations/{id}/draft`

The request should replace the complete editable region set and include a draft revision. The API should reject stale revisions with `409 Conflict`.

The complete authoritative region-ID set must remain present. Reviewers may disable a non-actionable region or explicitly correct its geometry, but the UI must not invent, duplicate, or silently delete detector regions.

Selecting a page is a frontend view operation, not a draft mutation. The save request must contain
regions from every page, including pages that are not currently visible. Field IDs and keys must
be unique across the whole template, not merely within one page.

## How the multi-page editor is constructed

1. `src/api.js` adapts `draft.pages` to ordered page metadata and absolute `pageUrls` while
   retaining the complete backend draft.
2. `TemplateWorkspace.jsx` keeps one `regions` state array for the entire form and a separate
   `selectedPageNumber` for navigation.
3. `visibleRegions` filters that full array for display on the selected canonical image.
4. A page-local drag/edit is merged back into the full array by stable region ID.
5. `templateEditorModel.js` converts normalized backend regions to editor objects and back without
   changing their page ownership or authoritative detector metadata.
6. Save serializes the complete array with the current `draft_revision`; validate and approve run
   only after that save succeeds.

This split prevents a common multi-page data-loss bug: replacing the server draft with only the
regions visible on the currently selected page.

### Validate and approve

- `POST /api/v1/template-registrations/{id}/validate`
- `POST /api/v1/template-registrations/{id}/approve`

Approval should create an immutable template version. Editing an approved template should create a new draft version.

### Manage draft and approved form metadata

- `PATCH /api/v1/template-registrations/{id}` accepts `name`, `description`, and/or
  `form_type_id`. For an approved registration it also updates the current template catalog entry.
- `DELETE /api/v1/template-registrations/{id}` archives the draft and its linked approved template.
- `PATCH /api/v1/templates/{id}` updates an approved catalog entry and its linked registration.
- `DELETE /api/v1/templates/{id}` archives the approved entry and its linked registration.

Metadata changes do not mutate the immutable approved extraction definition. Delete is a soft
archive and returns `204 No Content`; retained audit/version/document history remains available
to backend governance processes but is omitted from normal UI lists.

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
