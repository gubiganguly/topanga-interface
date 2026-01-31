"use client";

import { useEffect, useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

function getSessionId() {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem("topanga_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("topanga_session_id", id);
  }
  return id;
}

export default function Home() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Topanga online. Ask me anything." }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg = { role: "user", text: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text, session_id: sessionId })
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.reply || "(no reply)" }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: "Error talking to backend." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: 16, borderBottom: "1px solid #ddd" }}>
        <strong>Topanga Interface</strong>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#666" }}>{m.role}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
          </div>
        ))}
      </main>

      <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, padding: 16, borderTop: "1px solid #ddd" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1, padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
        />
        <button type="submit" disabled={sending} style={{ padding: "10px 16px" }}>
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
