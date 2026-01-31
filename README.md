# Topanga Interface

Monorepo with:
- `frontend/` — Next.js web UI
- `backend/` — Python API (FastAPI)

## Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

## Backend (FastAPI)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Env (later)
We'll add env vars for OpenClaw gateway URL + token once we wire the relay.
