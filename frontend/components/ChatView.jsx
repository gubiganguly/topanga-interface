import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Paperclip, X } from "lucide-react";

export default function ChatView({
  messages,
  input,
  setInput,
  sendMessage,
  sending,
  selectedImage,
  setSelectedImage,
  fileInputRef,
  handleFileSelect,
  removeImage,
  setActiveView
}) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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
    <div className="chat-view-container">
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

      <div className="input-area">
        <form onSubmit={sendMessage}>
        {selectedImage && (
          <div className="preview-container">
            <div className="preview-wrapper">
              <img src={selectedImage} alt="Preview" className="preview-image" />
              <button type="button" onClick={removeImage} className="remove-button">
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        <div className="input-wrapper">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }} 
          />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            className={`mic-button ${selectedImage ? "active" : ""}`}
            style={{ left: 8 }}
            title="Add Image"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            onClick={() => setActiveView("voice")}
            className="mic-button"
            style={{ left: 44 }}
            title="Voice Mode"
          >
            <Mic size={18} />
          </button>
          <textarea
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={sending ? "Type your next message..." : "Message Topanga..."}
            className="chat-input"
            rows={1}
            enterKeyHint="send"
          />
          <button type="submit" disabled={(sending || (!input.trim() && !selectedImage))} className="send-button" tabIndex="-1">
            <Send size={18} />
          </button>
        </div>
        </form>
      </div>

      <style jsx>{`
        .chat-view-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        .chat-area {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 100px;
          overflow-y: auto;
          padding: 24px;
          padding-bottom: 8px;
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
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 16px 20px;
          padding-bottom: max(16px, env(safe-area-inset-bottom));
          background: transparent;
          animation: slideUp 0.4s ease-out;
        }
        @keyframes slideUp {
          from {
            transform: translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
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
          padding: 14px 50px 14px 80px;
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
        .mic-button {
          position: absolute;
          bottom: 8px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mic-button.active { color: #8b5cf6; }
        .preview-container {
          padding: 0 0 10px 20px;
        }
        .preview-wrapper {
          position: relative;
          display: inline-block;
        }
        .preview-image {
          height: 60px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .remove-button {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .message-image-container {
          margin-bottom: 10px;
        }
        .message-image {
          max-width: 100%;
          max-height: 300px;
          border-radius: 12px;
        }
        .mic-button:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }
        .chat-input:focus {
          border-color: rgba(139, 92, 246, 0.5);
          background: rgba(0, 0, 0, 0.3);
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
      `}</style>
    </div>
  );
}

