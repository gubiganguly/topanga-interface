"use client";

import { useEffect, useRef, useState } from "react";

function getSessionId() {
  if (typeof window === "undefined") return null;
  return "agent:main:main";
}

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  async function refreshHistory() {
    setIsRefreshing(true);
    const sid = sessionId || "agent:main:main";
    try {
      const res = await fetch(`/api/chat/history?session_id=${encodeURIComponent(sid)}`, { cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      
      if (Array.isArray(data?.messages)) {
        // Simple replace - Gateway is truth
        const sorted = data.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setMessages(sorted);
      }
    } catch (err) {
      console.error("Refresh history failed", err);
    } finally {
      setIsRefreshing(false);
    }
  }

  // Auto-refresh periodically to catch terminal chats
  useEffect(() => {
    if (!sessionId) return;
    refreshHistory();
    const interval = setInterval(refreshHistory, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const currentSessionId = sessionId || "agent:main:main";
    const userText = input.trim();
    
    // Optimistic UI
    const tempUser = { role: "user", content: userText, created_at: new Date().toISOString(), pending: true };
    const tempBot = { role: "assistant", content: "", created_at: new Date().toISOString(), pending: true };
    
    setMessages(prev => [...prev, tempUser, tempBot]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, session_id: currentSessionId })
      });

      if (!res.ok) throw new Error("Request failed");
      if (!res.body) throw new Error("No stream");
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const parts = chunk.split("\n\n");
        
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.replace(/^data:\s?/, "");
          if (data === "[DONE]") continue;

          try {
            const payload = JSON.parse(data);
            const delta = payload.choices?.[0]?.delta?.content || "";
            if (delta) {
              // Update the last message (the pending bot message)
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: last.content + delta };
                }
                return copy;
              });
            }
          } catch {}
        }
      }
      
      // Refresh to confirm final state from Gateway
      setTimeout(refreshHistory, 1000);

    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}`, created_at: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.title}>Topanga <span style={{fontSize: 10, background: "#000", color: "#fff", padding: "2px 4px", borderRadius: 4, verticalAlign: "middle"}}>Direct</span></div>
            <div style={styles.subtitle}>Your snarky but warm AI</div>
          </div>
          <div style={styles.headerRight}>
            <button
              type="button"
              onClick={() => refreshHistory()}
              style={styles.refreshButton}
              title="Refresh chat history"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <div style={styles.statusDot} title={sending ? "Thinking" : "Online"} />
          </div>
        </header>

        <main style={styles.chat}>
          {messages.map((m, i) => (
            <div key={i} style={m.role === "user" ? styles.rowUser : styles.rowBot}>
              <div style={m.role === "user" ? styles.bubbleUser : styles.bubbleBot}>
                {m.content || (m.role === "assistant" && sending && i === messages.length - 1 ? "…" : "")}
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
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12
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
  refreshButton: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer"
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
  }
};
