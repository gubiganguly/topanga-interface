# Topanga Interface

Monorepo with:
- `frontend/` — Next.js web UI
- `backend/` — Python API (FastAPI)

## Backend (FastAPI)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# fill in OPENCLAW_GATEWAY_TOKEN
uvicorn app.main:app --reload --port 8000
```

## Frontend (Next.js)
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 and chat.

## Notes
- Backend calls OpenClaw Gateway `/v1/chat/completions`.
- Streaming replies are enabled via `/chat/stream` (SSE).
- Uses `OPENCLAW_GATEWAY_TOKEN` from `~/.openclaw/openclaw.json`.
