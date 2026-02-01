# Topanga Interface

Repo with:
- `frontend/` — Next.js web UI + API routes (Vercel)

## Frontend (Next.js)
```bash
cd frontend
npm install
cp .env.example .env.local
# edit .env.local and set:
# OPENCLAW_GATEWAY_URL=https://gateway.topangabot.com
# OPENCLAW_GATEWAY_TOKEN=your_gateway_token_here
npm run dev
```

Open http://localhost:3000 and chat.

## Vercel env vars (Server-side)
Set these in Vercel project settings:
- `OPENCLAW_GATEWAY_URL` (use `https://gateway.topangabot.com`)
- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_AGENT_ID` (default: main)
- `OPENCLAW_SESSION_KEY` (default: agent:main:main)

## Notes
- Frontend API routes call OpenClaw Gateway `/v1/chat/completions`.
- Streaming replies via `/api/chat/stream`.
