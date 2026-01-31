import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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


def _gateway_headers():
    if not GATEWAY_TOKEN:
        raise HTTPException(status_code=500, detail="OPENCLAW_GATEWAY_TOKEN is not set")
    return {
        "Authorization": f"Bearer {GATEWAY_TOKEN}",
        "Content-Type": "application/json",
        "x-openclaw-agent-id": AGENT_ID,
    }


@app.post("/chat")
async def chat(req: ChatRequest):
    payload = {
        "model": "openclaw",
        "messages": [{"role": "user", "content": req.message}],
    }
    if req.session_id:
        payload["user"] = req.session_id

    url = f"{GATEWAY_URL}/v1/chat/completions"

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            res = await client.post(url, json=payload, headers=_gateway_headers())
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


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    payload = {
        "model": "openclaw",
        "stream": True,
        "messages": [{"role": "user", "content": req.message}],
    }
    if req.session_id:
        payload["user"] = req.session_id

    url = f"{GATEWAY_URL}/v1/chat/completions"

    async def event_generator():
        async with httpx.AsyncClient(timeout=None) as client:
            try:
                async with client.stream("POST", url, json=payload, headers=_gateway_headers()) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        yield f"data: {json.dumps({'error': body.decode('utf-8', 'ignore')})}\n\n"
                        return

                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            data = line[6:]
                        else:
                            data = line

                        if data.strip() == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return

                        # Pass through the JSON payload
                        yield f"data: {data}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
