"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, ChevronDown } from "lucide-react";

// Hook to detect mobile viewport
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= breakpoint);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [breakpoint]);

  return isMobile;
}

export default function ChatSidebar({
  isOpen,
  onClose,
  messages,
  input,
  setInput,
  sendMessage,
  sending
}) {
  const endRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending && input.trim()) sendMessage(e);
    }
  };

  // Animation variants based on device type
  const sidebarVariants = isMobile
    ? {
        initial: { y: "100%", opacity: 0.8 },
        animate: { y: 0, opacity: 1 },
        exit: { y: "100%", opacity: 0.8 },
      }
    : {
        initial: { x: "100%", opacity: 0.8 },
        animate: { x: 0, opacity: 1 },
        exit: { x: "100%", opacity: 0.8 },
      };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="sidebar-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        onClick={onClose}
      />

      {/* Sidebar / Drawer */}
      <motion.div
        className={`chat-sidebar ${isMobile ? "mobile-drawer" : ""}`}
        initial={sidebarVariants.initial}
        animate={sidebarVariants.animate}
        exit={sidebarVariants.exit}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 35,
          opacity: { duration: 0.2 }
        }}
      >
        {/* Drag handle for mobile */}
        {isMobile && (
          <div className="drawer-handle" onClick={onClose}>
            <div className="handle-bar" />
          </div>
        )}

        {/* Header */}
        <div className="sidebar-header">
          <h2>Conversation</h2>
          <button onClick={onClose} className="close-btn">
            {isMobile ? <ChevronDown size={20} /> : <X size={20} />}
          </button>
        </div>

        {/* Messages */}
        <div className="messages-area">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>Start speaking to begin a conversation</p>
            </div>
          ) : (
            <AnimatePresence>
              {messages.map((m, i) => {
                if (m.role === "assistant" && !m.content) return null;

                const isStreaming = m.role === "assistant" && sending && i === messages.length - 1;

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`message-row ${m.role === "user" ? "user-row" : "bot-row"}`}
                  >
                    <div className={`message-bubble ${m.role === "user" ? "user-bubble" : "bot-bubble"} ${isStreaming ? "streaming" : ""}`}>
                      <div className="message-content">
                        {m.image && (
                          <div className="message-image-container">
                            <img src={m.image} alt="Uploaded" className="message-image" />
                          </div>
                        )}
                        {m.role === "assistant" ? (
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        ) : (
                          m.content
                        )}
                      </div>
                      {m.content && (
                        <div className="timestamp">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}

          {sending && (!messages.length || messages[messages.length - 1]?.content === "") && (
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

        {/* Input */}
        <form onSubmit={sendMessage} className="sidebar-input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="text-input"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="send-btn"
          >
            <Send size={18} />
          </button>
        </form>
      </motion.div>

      <style jsx>{`
        .sidebar-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
          z-index: 55;
        }

        .chat-sidebar {
          position: fixed;
          top: 0;
          right: 0;
          width: 380px;
          height: 100vh;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(20px);
          border-left: 1px solid rgba(255, 255, 255, 0.1);
          z-index: 60;
          display: flex;
          flex-direction: column;
        }

        /* Mobile drawer styles */
        .chat-sidebar.mobile-drawer {
          top: auto;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          height: 75vh;
          max-height: 75vh;
          border-left: none;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px 24px 0 0;
        }

        .drawer-handle {
          display: flex;
          justify-content: center;
          padding: 12px 0 4px;
          cursor: pointer;
        }

        .handle-bar {
          width: 40px;
          height: 4px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
        }

        @media (max-width: 480px) {
          .chat-sidebar:not(.mobile-drawer) {
            width: 100%;
          }
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .mobile-drawer .sidebar-header {
          padding-top: 8px;
        }

        .sidebar-header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #fff;
        }

        .close-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .empty-state {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.4);
          font-size: 14px;
          text-align: center;
          padding: 20px;
        }

        .message-row {
          display: flex;
          width: 100%;
        }

        .user-row {
          justify-content: flex-end;
        }

        .bot-row {
          justify-content: flex-start;
        }

        .message-bubble {
          max-width: 85%;
          padding: 10px 14px;
          font-size: 14px;
          line-height: 1.5;
        }

        .user-bubble {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border-radius: 16px 16px 4px 16px;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
        }

        .bot-bubble {
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          border-radius: 16px 16px 16px 4px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .bot-bubble.streaming {
          animation: pulse-glow 1.5s ease-in-out infinite;
        }

        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
          }
          50% {
            box-shadow: 0 0 15px 2px rgba(139, 92, 246, 0.3);
          }
        }

        .thinking-bubble {
          display: flex;
          gap: 4px;
          padding: 14px 18px;
          align-items: center;
        }

        .thinking-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.5);
          animation: thinking-bounce 1.4s ease-in-out infinite;
        }

        .thinking-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .thinking-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes thinking-bounce {
          0%, 80%, 100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          40% {
            transform: translateY(-6px);
            opacity: 1;
          }
        }

        .message-content {
          word-wrap: break-word;
        }

        .message-image-container {
          margin-bottom: 8px;
        }

        .message-image {
          max-width: 100%;
          max-height: 150px;
          border-radius: 8px;
        }

        .timestamp {
          font-size: 10px;
          opacity: 0.5;
          margin-top: 4px;
          text-align: right;
        }

        .sidebar-input {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.2);
        }

        .mobile-drawer .sidebar-input {
          padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
        }

        .text-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 10px 14px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .text-input:focus {
          border-color: rgba(139, 92, 246, 0.5);
        }

        .text-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .send-btn {
          background: #8b5cf6;
          border: none;
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .send-btn:hover:not(:disabled) {
          background: #7c3aed;
          transform: scale(1.05);
        }

        .send-btn:disabled {
          background: rgba(255, 255, 255, 0.1);
          cursor: not-allowed;
          opacity: 0.5;
        }
      `}</style>
    </>
  );
}
