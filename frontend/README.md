# Insurance OCR Frontend

React/Vite operations workspace for template-driven Burmese and English insurance OCR. It lets reviewers register claim-form templates, edit detected bounding boxes, process completed forms, verify automatic template matches, correct OCR output, inspect audit history, and export reviewed data.

In the umbrella deployment this frontend works with the unified orchestrator. The local FastAPI service in `../backend` remains available only for standalone prototype testing.

## What This Frontend Includes

- Task-focused OCR work queue.
- Template registry with visual bounding-box editing and version approval.
- Automatic-match document intake and exception states.
- Split-screen source document and extracted-field review.
- Confidence, validation, and source-region linking.
- Searchable records and backend audit history.
- Batch selection, keyboard review shortcuts, and selected-record export.
- JSON, CSV, Excel, API payload, and correction export buttons.
- Light/dark mode.
- Backend API integration through `src/api.js`.

## What This Frontend Does Not Include

- OCR/layout model inference.
- Backend database.
- Authentication/login.
- User roles and permissions.
- Production file storage.

Those belong to backend/model/infrastructure work.

## Folder Structure

```text
frontend/
  src/
    App.jsx                  Main application shell and pages
    TemplateWorkspace.jsx    Multi-page template review/editor workflow
    templateEditorModel.js   Backend/editor region conversion and validation
    api.js                   Backend API client and response adapters
    styles.css               Application styling
    main.jsx                 React entry point
  index.html
  package.json
  package-lock.json
  vite.config.js
  .env.example
  .gitignore
  README.md
```

## Requirements

- Node.js 18 or newer
- npm
- Backend running at `http://127.0.0.1:8000`

Check Node/npm:

```powershell
node -v
npm -v
```

## Environment Setup

The frontend reads the backend URL from `VITE_API_BASE_URL`.

Create `.env` from `.env.example`:

```powershell
cd insurance-ocr-project/frontend
Copy-Item .env.example .env
```

Default value:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

If the backend runs on another host/port, update `.env`.

After changing `.env`, restart the frontend dev server.

## Install

From the frontend folder:

```powershell
cd insurance-ocr-project/frontend
npm install
```

## Run Development Server

Start backend first, then run:

```powershell
cd insurance-ocr-project/frontend
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

## Build For Production

```powershell
cd insurance-ocr-project/frontend
npm run build
```

Build output is generated in:

```text
frontend/dist/
```

`dist/` is ignored by Git because it can be rebuilt.

## Preview Production Build

```powershell
cd insurance-ocr-project/frontend
npm run preview
```

Open the URL printed by Vite, usually:

```text
http://127.0.0.1:4173
```

## How To Test With Backend

1. Run backend:

```powershell
cd insurance-ocr-project
python -m uvicorn backend.api.app:app --reload --host 127.0.0.1 --port 8000
```

2. Run frontend:

```powershell
cd insurance-ocr-project/frontend
npm run dev
```

3. Open:

```text
http://127.0.0.1:5173
```

4. Test workflow:

- Open `Templates`.
- Enter a form name, optional description, and category, then upload one blank claim form PDF/image.
- Use `Manage categories` to create or rename categories. A category that still contains forms
  cannot be removed.
- Watch preprocessing, layout, OCR, and VLM progress.
- For a multi-page PDF, use the `Page 1`, `Page 2`, ... buttons to review each canonical page
  and its page-specific PP-DocLayoutV3 overlays.
- Edit regions on more than one page, save, switch pages, and confirm all edits remain present.
- Resolve model review flags, save the revisioned draft, validate, and approve it.
- Use the form-details row to rename, describe, recategorize, or remove either a draft or an
  approved form. Removal archives the backend records rather than erasing audit/history data.
- Open `Process Documents`.
- Upload a completed claim form.
- Review/edit extracted fields.
- Mark ready or sync.
- Open `Records` to inspect audit history or `Reports & Export` to download JSON/CSV/Excel.

## Review Shortcuts

- `J` / `K`: next or previous document in the current queue
- `[` / `]`: previous or next validation issue
- `Ctrl+S`: save review corrections
- `Ctrl+Enter`: approve and open the next document

## API Migration

The current compatibility endpoints and the target production API are documented in `../docs/FRONTEND_API_CONTRACT.md`.

## How multi-page template editing works

The editor keeps page navigation separate from form data. `api.js` reads `draft.pages` and builds
one URL for each canonical page image. `TemplateWorkspace.jsx` stores every draft region in one
array, then derives `visibleRegions` by comparing `region.page` with `selectedPageNumber`. Page
buttons change only that selected number.

Dragging or editing a visible box updates the corresponding item in the complete array by region
ID. Save converts every region back to the API shape and sends the entire array with the current
revision. Server validation therefore sees all pages together and can enforce globally unique
field IDs/keys. The page's `width` and `height` stay server-owned; normalized editor geometry is
converted to integer pixels by the orchestrator only during approval.

## Backend API Used By Frontend

The frontend expects these endpoints from backend:

```text
GET    /api/form-types
GET    /api/v1/form-categories
POST   /api/v1/form-categories
PATCH  /api/v1/form-categories/{id}
DELETE /api/v1/form-categories/{id}
GET    /api/templates
GET    /api/template-registrations
POST   /api/template-registrations
PATCH  /api/v1/template-registrations/{id}
DELETE /api/v1/template-registrations/{id}
PATCH  /api/template-registrations/{id}/fields
GET    /api/v1/template-registrations/{id}
GET    /api/v1/template-registrations/{id}/pages/{page_number}
PUT    /api/v1/template-registrations/{id}/draft
POST   /api/v1/template-registrations/{id}/validate
POST   /api/v1/template-registrations/{id}/approve
GET    /api/documents
POST   /api/documents
PATCH  /api/documents/{id}/fields
POST   /api/documents/{id}/status
DELETE /api/documents/{id}
GET    /api/export/json
GET    /api/export/csv
GET    /api/export/excel
```

## Important GitHub Notes

Commit these:

```text
frontend/src/
frontend/index.html
frontend/package.json
frontend/package-lock.json
frontend/vite.config.js
frontend/.env.example
frontend/.gitignore
frontend/README.md
```

Do not commit these:

```text
frontend/node_modules/
frontend/dist/
frontend/.env
```

## Troubleshooting

If uploads or records do not load:

- Make sure backend is running on `http://127.0.0.1:8000`.
- Check `frontend/.env`.
- Restart `npm run dev` after changing `.env`.
- Open backend docs at `http://127.0.0.1:8000/docs`.

If port `5173` is busy:

```powershell
npm run dev -- --port 5174
```

Then open:

```text
http://127.0.0.1:5174
```
