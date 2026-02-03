"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, RefreshCw, Wifi, WifiOff, X } from "lucide-react";
import ChatView from "../components/ChatView";
import VoiceView from "../components/VoiceView";
import RealtimeView from "../components/RealtimeView";
import StocksView from "../components/StocksView";
import "./globals.css";

function getSessionId() {
  if (typeof window === "undefined") return null;
  return "agent:main:main";
}

export default function Home() {
  // View State
  const [activeView, setActiveView] = useState("voice");

  // Chat State
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Connection status state
  const [connectionStatus, setConnectionStatus] = useState({
    connected: null, // null = checking, true = connected, false = disconnected
    error: null,
    details: null,
    gatewayUrl: null,
    lastChecked: null
  });
  const [showErrorModal, setShowErrorModal] = useState(false);

  // TTS Audio state
  const [audioUrl, setAudioUrl] = useState(null);

  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  // Health check for gateway connection
  async function checkHealth() {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = await res.json();
      setConnectionStatus({
        connected: data.connected,
        error: data.error || null,
        details: data.details || null,
        gatewayUrl: data.gatewayUrl || null,
        hasCfCredentials: data.hasCfCredentials,
        lastChecked: new Date().toISOString()
      });
    } catch (err) {
      setConnectionStatus({
        connected: false,
        error: "Health Check Failed",
        details: err.message,
        gatewayUrl: null,
        lastChecked: new Date().toISOString()
      });
    }
  }

  useEffect(() => {
    // DISABLED: Gateway health check fails from Vercel (local gateway)
    // checkHealth();
    // const interval = setInterval(checkHealth, 30000);
    // return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          setInput((prev) => {
             return transcript;
          });
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Voice input not supported in this browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

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
    // DISABLED: Gateway is local and unreachable from Vercel
    // History polling will 500 in production
    // TODO: Re-enable when gateway is publicly accessible
    // if (!sessionId || connectionStatus.connected !== true) return;
    // refreshHistory();
    // const interval = setInterval(refreshHistory, 5000);
    // return () => clearInterval(interval);
  }, [sessionId, connectionStatus.connected]);

  async function sendMessage(e) {
    if (e) e.preventDefault();
    if ((!input.trim() && !selectedImage) || sending) return;

    const currentSessionId = sessionId || "agent:main:main";
    const userText = input.trim();
    const imagePayload = selectedImage;
    
    // Optimistic UI
    const tempUser = { 
      role: "user", 
      content: userText, 
      image: imagePayload, 
      created_at: new Date().toISOString(), 
      pending: true 
    };
    const tempBot = { role: "assistant", content: "", created_at: new Date().toISOString(), pending: true };
    
    setMessages(prev => [...prev, tempUser, tempBot]);
    setInput("");
    setSelectedImage(null); // Clear image immediately
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSending(true);

    try {
      const res = await fetch(`/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userText, 
          image: imagePayload,
          session_id: currentSessionId 
        })
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
              // Check for MEDIA: directive with audio URL
              const mediaMatch = delta.match(/MEDIA:\s*(https?:\/\/[^\s]+\.(?:mp3|wav|ogg|m4a|webm)[^\s]*)/i);
              if (mediaMatch) {
                setAudioUrl(mediaMatch[1]);
              }

              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last.role === "assistant") {
                  // Filter out MEDIA: lines from displayed content
                  let filteredDelta = delta.replace(/MEDIA:\s*https?:\/\/[^\s]+/gi, '');
                  if (filteredDelta) {
                    copy[copy.length - 1] = { ...last, content: last.content + filteredDelta };
                  }
                }
                return copy;
              });
            }
          } catch {}
        }
      }
      // Get the final bot response for TTS
      const finalMessages = await new Promise(resolve => {
        setMessages(prev => {
          resolve(prev);
          return prev;
        });
      });
      const lastMessage = finalMessages[finalMessages.length - 1];
      
      // Generate TTS audio for voice view
      if (activeView === "voice" && lastMessage?.role === "assistant" && lastMessage?.content) {
        try {
          const ttsRes = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: lastMessage.content })
          });
          
          if (ttsRes.ok) {
            const audioBlob = await ttsRes.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            setAudioUrl(audioUrl);
          }
        } catch (ttsErr) {
          console.error("TTS failed:", ttsErr);
        }
      }
      
      setTimeout(refreshHistory, 1000);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}`, created_at: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_SIZE = 1024;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setSelectedImage(dataUrl);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="app-container">
      <main className="main-content">
        {/* Version indicator */}
        <div className="version-indicator">v1.0.5</div>
        
        {/* Header Overlay for Status */}
        <div className="status-overlay">
           <button 
              onClick={() => {
                if (connectionStatus.connected === false) {
                  setShowErrorModal(true);
                } else {
                  checkHealth();
                }
              }}
              className={`status-indicator ${
                connectionStatus.connected === null ? 'checking' : 
                connectionStatus.connected ? 'connected' : 'disconnected'
              }`}
              title={connectionStatus.connected === false ? "Click for details" : "Gateway status"}
            >
              {connectionStatus.connected === null ? (
                <span className="status-dot checking-dot"></span>
              ) : connectionStatus.connected ? (
                <Wifi size={14} />
              ) : (
                <WifiOff size={14} />
              )}
            </button>
        </div>

        <AnimatePresence mode="wait">
          {activeView === "voice" && (
            <motion.div 
              key="voice"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4 }}
              className="view-wrapper"
            >
              <VoiceView
                isListening={isListening}
                toggleListening={toggleListening}
                setActiveView={setActiveView}
                input={input}
                setInput={setInput}
                sendMessage={sendMessage}
                sending={sending}
                audioUrl={audioUrl}
                setAudioUrl={setAudioUrl}
              />
            </motion.div>
          )}

          {activeView === "chat" && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="view-wrapper"
            >
              <ChatView
                messages={messages}
                input={input}
                setInput={setInput}
                sendMessage={sendMessage}
                sending={sending}
                selectedImage={selectedImage}
                setSelectedImage={setSelectedImage}
                fileInputRef={fileInputRef}
                handleFileSelect={handleFileSelect}
                removeImage={removeImage}
                setActiveView={setActiveView}
              />
            </motion.div>
          )}

          {activeView === "stocks" && (
            <motion.div
              key="stocks"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="view-wrapper"
            >
              <StocksView />
            </motion.div>
          )}

          {activeView === "realtime" && (
            <motion.div
              key="realtime"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4 }}
              className="view-wrapper"
            >
              <RealtimeView setActiveView={setActiveView} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Error Modal */}
      <AnimatePresence>
        {showErrorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowErrorModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <AlertCircle size={24} color="#ef4444" />
                <h2>Connection Error</h2>
                <button onClick={() => setShowErrorModal(false)} className="modal-close">
                  <X size={20} />
                </button>
              </div>
              
              <div className="modal-body">
                <div className="error-type">
                  <strong>{connectionStatus.error || "Unknown Error"}</strong>
                </div>
                
                {connectionStatus.details && (
                  <div className="error-details">
                    <p>{connectionStatus.details}</p>
                  </div>
                )}
                
                <div className="error-meta">
                  {connectionStatus.gatewayUrl && (
                    <div className="meta-row">
                      <span className="meta-label">Gateway URL:</span>
                      <code>{connectionStatus.gatewayUrl}</code>
                    </div>
                  )}
                  {connectionStatus.lastChecked && (
                    <div className="meta-row">
                      <span className="meta-label">Last Checked:</span>
                      <span>{new Date(connectionStatus.lastChecked).toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button onClick={() => { checkHealth(); }} className="retry-button">
                  <RefreshCw size={16} />
                  Retry Connection
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .app-container {
          display: flex;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          /* background: #0f172a; Removed to show global gradient */
        }
        .main-content {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.2);
        }
        .view-wrapper {
          width: 100%;
          height: 100%;
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .status-overlay {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 50;
        }
        
        /* Reusing some styles from previous implementation */
        .status-indicator {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(10px);
          color: white;
        }
        .status-indicator.connected {
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.3);
        }
        .status-indicator.disconnected {
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.3);
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }
        .checking-dot {
          animation: pulse-dot 1.5s infinite;
        }
        
        /* Modal Styles (Copied from previous) */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-content {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          width: 100%;
          max-width: 480px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .modal-header h2 {
          flex: 1;
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #fff;
        }
        .modal-close {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .modal-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .modal-body {
          padding: 20px;
        }
        .error-type {
          font-size: 16px;
          color: #f87171;
          margin-bottom: 12px;
        }
        .error-details {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
        }
        .error-details p {
          margin: 0;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
          line-height: 1.5;
          word-break: break-word;
        }
        .error-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }
        .meta-label {
          color: rgba(255, 255, 255, 0.5);
        }
        .meta-row code {
          background: rgba(0, 0, 0, 0.3);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          color: #a78bfa;
        }
        .modal-footer {
          padding: 16px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: flex-end;
        }
        .retry-button {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #6366f1;
          border: none;
          color: white;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .retry-button:hover {
          background: #4f46e5;
          transform: scale(1.02);
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
