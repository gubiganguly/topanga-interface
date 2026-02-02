"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { Send, RefreshCw, Terminal, Sparkles } from "lucide-react";
import "./globals.css";

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
        const sorted = data.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setMessages(sorted);
      }
    } catch (err) {
      console.error("Refresh failed", err);
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    refreshHistory();
    const interval = setInterval(refreshHistory, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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
      setTimeout(refreshHistory, 1000);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}`, created_at: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) sendMessage(e);
    }
  };

  const handleInput = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
    setInput(e.target.value);
  };

  return (
    <div className="page-container">
      <div className="glass-shell">
        
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <div className="avatar-glow">
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <h1 className="title">Topanga</h1>
              <div className="subtitle">Online • v2.6</div>
            </div>
          </div>
          <div className="header-right">
            <button 
              onClick={refreshHistory} 
              disabled={isRefreshing}
              className={`icon-button ${isRefreshing ? 'spin' : ''}`}
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="chat-area">
          <AnimatePresence>
            {messages.map((m, i) => {
              if (m.role === "assistant" && !m.content) return null;
              
              const isStreaming = m.role === "assistant" && sending && i === messages.length - 1;
              
              return (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className={`message-row ${m.role === "user" ? "user-row" : "bot-row"}`}
              >
                <div className={`message-bubble ${m.role === "user" ? "user-bubble" : "bot-bubble"} ${isStreaming ? "pulsating-active" : ""}`}>
                  <div className="message-content prose">
                    {m.role === "assistant" ? (
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.content && (
                    <div className="timestamp">
                      {new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  )}
                </div>
              </motion.div>
            );
            })}
          </AnimatePresence>
          
          {sending && (!messages.length || messages[messages.length-1]?.content === "") && (
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }}
               className="message-row bot-row"
             >
               <div className="message-bubble bot-bubble thinking-bubble">
                 <div className="thinking-dot"></div>
                 <div className="thinking-dot"></div>
                 <div className="thinking-dot"></div>
               </div>
             </motion.div>
          )}
          <div ref={endRef} style={{ height: 1 }} />
        </div>

        {/* Input Area */}
        <form onSubmit={sendMessage} className="input-area">
          <div className="input-wrapper">
            <textarea
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={sending ? "Type your next message..." : "Message Topanga..."}
              className="chat-input"
              rows={1}
            />
            <button type="submit" disabled={sending || !input.trim()} className="send-button">
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .page-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .glass-shell {
          width: 100%;
          max-width: 900px;
          height: 85vh;
          max-height: 900px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          background: rgba(255, 255, 255, 0.03);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .avatar-glow {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6366f1, #a855f7, #ec4899);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px rgba(168, 85, 247, 0.4);
        }
        .title {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          margin: 0;
          line-height: 1.2;
        }
        .subtitle {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }
        .icon-button {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .icon-button:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        .chat-area {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .message-row {
          display: flex;
          width: 100%;
        }
        .user-row { justify-content: flex-end; }
        .bot-row { justify-content: flex-start; }
        
        .message-bubble {
          max-width: 80%;
          padding: 14px 18px;
          position: relative;
        }
        .user-bubble {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border-radius: 20px 20px 4px 20px;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
        }
        .bot-bubble {
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          border-radius: 20px 20px 20px 4px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .thinking-bubble {
          display: flex;
          gap: 4px;
          padding: 16px 20px;
          align-items: center;
        }
        .timestamp {
          font-size: 10px;
          opacity: 0.5;
          margin-top: 6px;
          text-align: right;
        }

        .input-area {
          padding: 20px;
          background: rgba(255, 255, 255, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .input-wrapper {
          position: relative;
          display: flex;
          align-items: flex-end;
        }
        .chat-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 14px 50px 14px 20px;
          color: #fff;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
          resize: none;
          min-height: 52px;
          max-height: 150px;
          font-family: inherit;
          line-height: 1.5;
        }
        .chat-input:focus {
          border-color: rgba(139, 92, 246, 0.5);
          background: rgba(0, 0, 0, 0.3);
        }
        .chat-input.disabled {
          opacity: 0.6;
          cursor: not-allowed;
          background: rgba(0, 0, 0, 0.1);
        }
        .send-button {
          position: absolute;
          right: 8px;
          bottom: 8px;
          background: #8b5cf6;
          border: none;
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.1s, background 0.2s;
        }
        .send-button:hover:not(:disabled) {
          background: #7c3aed;
          transform: scale(1.05);
        }
        .send-button:disabled {
          background: rgba(255, 255, 255, 0.1);
          cursor: not-allowed;
          opacity: 0.5;
        }

        @media (max-width: 640px) {
          .page-container { 
            padding: 0; 
            align-items: flex-start; /* Align top on mobile */
          }
          .glass-shell { 
            width: 100%;
            height: 100dvh; /* Dynamic viewport height for mobile browsers */
            max-height: none; 
            border-radius: 0; 
            border: none;
            background: rgba(15, 23, 42, 0.95); /* Darker/Solid background */
          }
          .message-bubble { max-width: 85%; }
          
          .input-area {
            /* Stick to bottom and respect iPhone Home Bar */
            position: sticky;
            bottom: 0;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(20px);
            padding-bottom: max(20px, env(safe-area-inset-bottom));
          }
          
          .header {
             padding-top: max(20px, env(safe-area-inset-top));
          }
        }
      `}</style>
    </div>
  );
}
