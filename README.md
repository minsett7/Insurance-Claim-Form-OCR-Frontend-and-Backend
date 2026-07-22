# Insurance OCR Project

Insurance OCR prototype with a React frontend and FastAPI backend.

The project supports template registration, completed claim-form upload, extracted field review, human corrections, audit events, and export handoff.

The real OCR/layout model is not included in this repository yet. The backend currently uses a temporary mock OCR adapter so teammates can test the website workflow before the model service is ready.

## Project Folders

```text
frontend/   React + Vite dashboard
backend/    FastAPI API + post-processing scaffold
```

## Requirements

- Node.js 18 or newer
- npm
- Python 3.10 or newer
- pip

## Run Backend

From the project root:

```powershell
pip install -r backend\requirements.txt
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

## Run Frontend

In another terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

Default frontend API URL:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Test Workflow

1. Start backend.
2. Start frontend.
3. Open the frontend website.
4. Register or approve a template.
5. Upload a completed form.
6. Review extracted fields.
7. Save corrections or mark ready.
8. Export JSON/CSV/Excel.

## Important Notes

- Backend data is stored locally in `backend/runtime_data/store.json`.
- `backend/runtime_data/` is ignored by Git.
- `frontend/node_modules/` and `frontend/dist/` are ignored by Git.
- Real OCR model integration should replace `backend/api/mock_ocr.py`.

## More Documentation

- `frontend/README.md`
- `backend/README.md`
