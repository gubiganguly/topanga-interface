from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Topanga Backend")


class ChatRequest(BaseModel):
    message: str


@app.post("/chat")
def chat(req: ChatRequest):
    # Placeholder: later forward to OpenClaw gateway
    return {"reply": f"You said: {req.message}"}
