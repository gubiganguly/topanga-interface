"use client";

import { useEffect, useRef, useState } from "react";

const BACKEND_URL = "";

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
  const endRef = useRef(null);

  // admin panel removed

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const ids = [sessionId, "agent:main:main"];
        const results = await Promise.all(
          ids.map(id => fetch(`/api/chat/history?session_id=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null))
        );

        const combined = [];
        for (const data of results) {
          if (Array.isArray(data?.messages)) {
            for (const m of data.messages) {
              combined.push({ role: m.role, text: m.content, created_at: m.created_at });
            }
          }
        }

        if (combined.length) {
          combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          setMessages(combined.map(m => ({ role: m.role, text: m.text })));
        }
      } catch {}
    })();
  }, [sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg = { role: "user", text: input.trim() };
    setMessages((m) => [...m, userMsg, { role: "assistant", text: "" }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text, session_id: sessionId })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Request failed (${res.status})`);
      }

      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.replace(/^data:\s?/, "");

          if (data === "[DONE]") {
            setSending(false);
            return;
          }

          try {
            const payload = JSON.parse(data);
            const delta = payload.choices?.[0]?.delta?.content || "";
            if (delta) {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = {
                  role: "assistant",
                  text: (copy[copy.length - 1].text || "") + delta
                };
                return copy;
              });
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (err) {
      setMessages((m) => {
        const copy = [...m];
        const msg = err?.message || "Error talking to backend.";
        copy[copy.length - 1] = { role: "assistant", text: msg };
        return copy;
      });
    } finally {
      setSending(false);
    }
  }

  // admin panel helpers removed
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.title}>Topanga</div>
            <div style={styles.subtitle}>Your snarky but warm AI</div>
          </div>
          <div style={styles.statusDot} title={sending ? "Thinking" : "Online"} />
        </header>

        <main style={styles.chat}>
          {messages.map((m, i) => (
            <div key={i} style={m.role === "user" ? styles.rowUser : styles.rowBot}>
              <div style={m.role === "user" ? styles.bubbleUser : styles.bubbleBot}>
                {m.text || (m.role === "assistant" && sending && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </main>

        <form onSubmit={sendMessage} style={styles.inputRow}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            style={styles.input}
          />
          <button type="submit" disabled={sending} style={styles.button}>
            {sending ? "Sending..." : "Send"}
          </button>
        </form>

        {/* admin panel removed */}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(1200px 600px at 10% 10%, #ffe3e3, #f5f6ff 40%, #eaf7ff 70%)",
    padding: 24
  },
  shell: {
    width: "min(900px, 95vw)",
    height: "min(80vh, 820px)",
    background: "rgba(255,255,255,0.85)",
    border: "1px solid #e6e6e6",
    borderRadius: 20,
    boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backdropFilter: "blur(8px)"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 22px",
    borderBottom: "1px solid #eee",
    background: "linear-gradient(90deg, #ffffff, #f3f6ff)"
  },
  title: { fontSize: 22, fontWeight: 700 },
  subtitle: { fontSize: 12, color: "#666" },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#19c37d",
    boxShadow: "0 0 0 4px rgba(25,195,125,0.15)"
  },
  chat: {
    flex: 1,
    overflowY: "auto",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  rowUser: { display: "flex", justifyContent: "flex-end" },
  rowBot: { display: "flex", justifyContent: "flex-start" },
  bubbleUser: {
    maxWidth: "75%",
    padding: "12px 14px",
    borderRadius: "16px 16px 4px 16px",
    background: "#111827",
    color: "#fff",
    fontSize: 15,
    lineHeight: 1.4
  },
  bubbleBot: {
    maxWidth: "75%",
    padding: "12px 14px",
    borderRadius: "16px 16px 16px 4px",
    background: "#f3f4f6",
    color: "#111827",
    fontSize: 15,
    lineHeight: 1.4
  },
  inputRow: {
    display: "flex",
    gap: 10,
    padding: 16,
    borderTop: "1px solid #eee",
    background: "#fff"
  },
  input: {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 15
  },
  button: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer"
  },
  // admin styles removed
};
