"use client";

import { useEffect, useRef, useState } from "react";

function getSessionId() {
  if (typeof window === "undefined") return null;
  return "agent:main:main";
}

export default function Home() {
  // State now tracks "confirmed" messages and "pending" messages separately effectively via the merge logic
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionFilter, setSessionFilter] = useState("agent:main:main");
  const [sessions, setSessions] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [debugInfo, setDebugInfo] = useState({});
  const endRef = useRef(null);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  async function refreshHistory() {
    setIsRefreshing(true);
    const sid = sessionId || "agent:main:main";
    try {
      const res = await fetch(`/api/chat/history`, { cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      
      const serverMessages = [];
      const sessionSet = new Set();
      if (Array.isArray(data?.messages)) {
        for (const m of data.messages) {
          serverMessages.push({ 
            id: m.id, 
            role: m.role, 
            text: m.content, 
            created_at: m.created_at, 
            session_id: m.session_id,
            pending: false 
          });
          if (m.session_id) sessionSet.add(m.session_id);
        }
      }
      
      // Sort server messages by time
      serverMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setMessages(prev => {
        // Keep any pending messages from local state that aren't in server list yet
        const localPending = prev.filter(m => m.pending);
        
        // Deduplicate: If a pending message is now in serverMessages (by content/role), drop it
        // UNLESS it is very new (< 5 seconds), in which case keep it to prevent flicker
        const uniquePending = localPending.filter(p => {
          const isFresh = (Date.now() - (p.createdAt || 0)) < 5000;
          if (isFresh) return true; // Force keep new messages

          const matched = serverMessages.some(s => 
            s.role === p.role && 
            s.text.trim() === p.text.trim() && 
            (new Date().getTime() - new Date(s.created_at).getTime() < 120000)
          );
          return !matched;
        });

        return [...serverMessages, ...uniquePending];
      });

      if (sessionSet.size) setSessions(Array.from(sessionSet).sort());
      
      setDebugInfo({
        status: res.status,
        count: serverMessages.length,
        pendingCount: prev => prev.filter(m => m.pending).length,
        lastFetch: new Date().toLocaleTimeString(),
        sessionId: sid,
        keyRole: data?.key_role || "unknown"
      });

    } catch (err) {
      console.error("Refresh history failed", err);
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    refreshHistory();
    const interval = setInterval(refreshHistory, 10_000);
    return () => clearInterval(interval);
  }, [sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const visibleMessages = sessionFilter === "all"
    ? messages
    : messages.filter(m => m.session_id === sessionFilter || m.pending); // Always show pending

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const currentSessionId = sessionId || "agent:main:main";
    const tempId = Date.now();
    
    // Add optimistic messages
    const userMsg = { role: "user", text: input.trim(), session_id: currentSessionId, pending: true, tempId: `u-${tempId}`, createdAt: Date.now() };
    const botMsg = { role: "assistant", text: "", session_id: currentSessionId, pending: true, tempId: `b-${tempId}`, createdAt: Date.now() };
    
    setMessages((m) => [...m, userMsg, botMsg]);
    setInput("");
    setSending(true);

    try {
      // 1. Explicitly Save User Message
      const saveRes = await fetch("/api/chat/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text, session_id: currentSessionId, role: "user" })
      });
      if (!saveRes.ok) {
        throw new Error("Failed to save user message: " + (await saveRes.text()));
      }

      // 2. Start Stream (skip duplicate save)
      const res = await fetch(`/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text, session_id: currentSessionId, skip_save_user: true })
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

          if (data === "[DONE]") continue;

          try {
            const payload = JSON.parse(data);
            const delta = payload.choices?.[0]?.delta?.content || "";
            if (delta) {
              setMessages((m) => {
                // Update the pending assistant message
                return m.map(msg => {
                  if (msg.tempId === botMsg.tempId) {
                    return { ...msg, text: msg.text + delta };
                  }
                  return msg;
                });
              });
            }
          } catch {
            // ignore
          }
        }
      }
      
      // Delay refresh to allow Supabase replication
      setTimeout(refreshHistory, 1500);
      
    } catch (err) {
      setMessages((m) => {
        return m.map(msg => {
          if (msg.tempId === botMsg.tempId) {
            return { ...msg, text: `Error: ${err.message}` };
          }
          return msg;
        });
      });
    } finally {
      setSending(false);
    }
  }

  async function testDb() {
    try {
      const res = await fetch("/api/test-db", { method: "POST" });
      const data = await res.json();
      alert(JSON.stringify(data, null, 2));
    } catch (err) {
      alert("Test failed: " + err.message);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.title}>Topanga</div>
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
            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              style={styles.select}
              title="Filter by session"
            >
              <option value="all">All sessions</option>
              {sessions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div style={styles.statusDot} title={sending ? "Thinking" : "Online"} />
          </div>
        </header>

        <main style={styles.chat}>
          {visibleMessages.map((m, i) => (
            <div key={i} style={m.role === "user" ? styles.rowUser : styles.rowBot}>
              <div style={m.role === "user" ? styles.bubbleUser : styles.bubbleBot}>
                <div style={styles.metaRow}>
                  <span style={styles.badge}>
                    {m.session_id || "unknown"}
                    {m.pending && " • sending..."}
                  </span>
                </div>
                {m.text || (m.role === "assistant" && sending && m.pending ? "…" : "")}
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

        <div style={styles.debug}>
          <details>
            <summary>Debug Info</summary>
            <div style={{ marginBottom: 10 }}>
              <button onClick={testDb} style={{...styles.button, fontSize: 10, padding: "4px 8px"}}>
                Test Database Connection
              </button>
            </div>
            <pre>{JSON.stringify({ ...debugInfo, stateCount: messages.length }, null, 2)}</pre>
          </details>
        </div>
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
  select: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: "#fff",
    fontSize: 12
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
  metaRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: 6
  },
  badge: {
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 999,
    background: "#e5e7eb",
    color: "#111827"
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
  debug: {
    padding: 10,
    fontSize: 10,
    background: "#eee",
    borderTop: "1px solid #ddd",
    maxHeight: 100,
    overflow: "auto"
  }
};
