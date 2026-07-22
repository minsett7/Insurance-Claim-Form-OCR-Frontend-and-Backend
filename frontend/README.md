# Insurance OCR Frontend

React/Vite frontend for the Insurance OCR project. This dashboard lets reviewers register claim-form templates, upload completed claim forms, review extracted fields, correct OCR output, search records, and export reviewed data.

This frontend is designed to work with the local FastAPI backend in `../backend`.

## What This Frontend Includes

- Dashboard / command center for OCR operations.
- Form type registry for Health, Life, Motor, and Fire claim forms.
- Blank form template registration screen.
- Completed form upload and review workspace.
- Extracted field editor with validation warnings and confidence badges.
- Records table with search.
- JSON, CSV, Excel, API payload, and correction export buttons.
- Light/dark mode.
- Backend API integration through `src/api.js`.

## What This Frontend Does Not Include

- OCR model inference.
- Backend database.
- Authentication/login.
- User roles and permissions.
- Production file storage.

Those belong to backend/model/infrastructure work.

## Folder Structure

```text
frontend/
  src/
    App.jsx       Main application UI and pages
    api.js        Backend API client
    styles.css    Application styling
    main.jsx      React entry point
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

- Open `Template Registration`.
- Upload a blank claim form PDF/image.
- Approve the generated template.
- Open `Completed Forms`.
- Upload a completed claim form.
- Review/edit extracted fields.
- Mark ready or sync.
- Open `Export Hub` and download JSON/CSV/Excel.

## Backend API Used By Frontend

The frontend expects these endpoints from backend:

```text
GET    /api/form-types
GET    /api/templates
GET    /api/template-registrations
POST   /api/template-registrations
PATCH  /api/template-registrations/{id}/fields
POST   /api/template-registrations/{id}/approve
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
