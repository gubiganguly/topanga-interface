# Topanga Admin Server

Local-only admin API for safe self-editing.

## Env
- `ADMIN_TOKEN` (required)
- `REPO_PATH` (default: /Users/clawdbot/Projects/topanga-interface)
- `ALLOWED_PREFIXES` (default: frontend/,README.md,.gitignore)
- `ADMIN_PORT` (default: 18888)

## Endpoints
- `GET /health`
- `POST /propose` { patch }
- `POST /apply` { id, hash }
- `POST /commit` { message }
- `POST /push`

All requests require `Authorization: Bearer <ADMIN_TOKEN>`
