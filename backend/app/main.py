import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

load_dotenv()

GATEWAY_URL = os.getenv("OPENCLAW_GATEWAY_URL", "http://127.0.0.1:18789")
GATEWAY_TOKEN = os.getenv("OPENCLAW_GATEWAY_TOKEN")
AGENT_ID = os.getenv("OPENCLAW_AGENT_ID", "main")

app = FastAPI(title="Topanga Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


@app.post("/chat")
async def chat(req: ChatRequest):
    if not GATEWAY_TOKEN:
        raise HTTPException(status_code=500, detail="OPENCLAW_GATEWAY_TOKEN is not set")

    payload = {
        "model": "openclaw",
        "messages": [{"role": "user", "content": req.message}],
    }
    if req.session_id:
        payload["user"] = req.session_id

    headers = {
        "Authorization": f"Bearer {GATEWAY_TOKEN}",
        "Content-Type": "application/json",
        "x-openclaw-agent-id": AGENT_ID,
    }

    url = f"{GATEWAY_URL}/v1/chat/completions"

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            res = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Gateway error: {e}")

    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail=res.text)

    data = res.json()
    try:
        reply = data["choices"][0]["message"]["content"]
    except Exception:
        reply = "(no reply)"

    return {"reply": reply}
