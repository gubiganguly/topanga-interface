"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageSquare } from "lucide-react";
import dynamic from "next/dynamic";

// Dynamically import the 3D scene to avoid SSR issues with Three.js
const Scene3D = dynamic(() => import("./Scene3D"), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.3)'
    }}>
      Loading...
    </div>
  )
});

// Floating orb component
function FloatingOrb({ delay, duration, size, distance, isListening, audioLevel }) {
  return (
    <motion.div
      className="floating-orb"
      style={{
        width: size,
        height: size,
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: isListening ? 0.6 + audioLevel * 0.4 : 0.3,
        scale: isListening ? 1 + audioLevel * 0.5 : 1,
        rotate: 360,
      }}
      transition={{
        opacity: { duration: 0.3 },
        scale: { duration: 0.1 },
        rotate: { duration: duration, repeat: Infinity, ease: "linear", delay: delay }
      }}
    >
      <motion.div
        className="orb-inner"
        style={{
          transform: `translateY(-${distance}px)`,
        }}
      />
    </motion.div>
  );
}

export default function VoiceView({
  isListening,
  toggleListening,
  onToggleSidebar,
  isSidebarOpen,
  input,
  setInput,
  sendMessage,
  sending
}) {
  const [audioContext, setAudioContext] = useState(null);
  const [analyser, setAnalyser] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const animationRef = useRef(null);
  const dataArrayRef = useRef(new Uint8Array(64));

  // Setup Audio Context when listening starts
  useEffect(() => {
    if (isListening && !audioContext) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioContext();
          const source = ctx.createMediaStreamSource(stream);
          const analyzer = ctx.createAnalyser();
          analyzer.fftSize = 64;

          source.connect(analyzer);

          setAudioContext(ctx);
          setAnalyser(analyzer);
        })
        .catch(err => console.error("Error accessing microphone:", err));
    }
  }, [isListening, audioContext]);

  // Audio level monitoring for button animation
  useEffect(() => {
    if (!analyser || !isListening) {
      setAudioLevel(0);
      return;
    }

    const updateAudioLevel = () => {
      analyser.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i];
      }
      const avg = sum / dataArrayRef.current.length;
      setAudioLevel(prev => prev * 0.3 + (avg / 255) * 0.7);
      animationRef.current = requestAnimationFrame(updateAudioLevel);
    };

    updateAudioLevel();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isListening]);

  // Dynamic values
  const buttonScale = isListening ? 1 + audioLevel * 0.2 : 1;
  const glowIntensity = isListening ? 30 + audioLevel * 50 : 10;

  return (
    <div className="voice-view-container">
      <div className="canvas-container">
        <Scene3D analyser={analyser} isListening={isListening} />
      </div>

      <div className="voice-controls">
        {/* Outer rotating gradient ring */}
        <motion.div
          className="gradient-ring-outer"
          animate={{
            rotate: 360,
            opacity: isListening ? 0.8 : 0.3,
          }}
          transition={{
            rotate: { duration: 8, repeat: Infinity, ease: "linear" },
            opacity: { duration: 0.3 }
          }}
        />

        {/* Inner rotating gradient ring (opposite direction) */}
        <motion.div
          className="gradient-ring-inner"
          animate={{
            rotate: -360,
            opacity: isListening ? 0.6 : 0.2,
          }}
          transition={{
            rotate: { duration: 6, repeat: Infinity, ease: "linear" },
            opacity: { duration: 0.3 }
          }}
        />

        {/* Floating orbs */}
        <div className="orbs-container">
          <FloatingOrb delay={0} duration={4} size={80} distance={45} isListening={isListening} audioLevel={audioLevel} />
          <FloatingOrb delay={1.3} duration={5} size={80} distance={45} isListening={isListening} audioLevel={audioLevel} />
          <FloatingOrb delay={2.6} duration={4.5} size={80} distance={45} isListening={isListening} audioLevel={audioLevel} />
        </div>

        {/* Pulsing rings when active */}
        <AnimatePresence>
          {isListening && (
            <>
              {[0, 0.5, 1].map((delay, i) => (
                <motion.div
                  key={i}
                  className="pulse-ring"
                  initial={{ scale: 0.5, opacity: 0.6 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        {/* Main button */}
        <motion.button
          onClick={toggleListening}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`voice-toggle-btn ${isListening ? "active" : ""}`}
          initial={false}
          animate={{
            scale: buttonScale,
            boxShadow: `0 0 ${glowIntensity}px ${glowIntensity * 0.3}px rgba(139, 92, 246, ${isListening ? 0.6 : 0.2}),
                        0 0 ${glowIntensity * 2}px ${glowIntensity * 0.5}px rgba(59, 130, 246, ${isListening ? 0.4 : 0.1})`,
          }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          whileHover={{ scale: isListening ? buttonScale * 1.08 : 1.08 }}
          whileTap={{ scale: 0.92 }}
        >
          {/* Animated background gradient */}
          <motion.div
            className="btn-bg-gradient"
            animate={{
              opacity: isListening ? 1 : 0.5,
              background: isListening
                ? `radial-gradient(circle at ${50 + audioLevel * 20}% ${50 - audioLevel * 20}%, rgba(139, 92, 246, 0.4), rgba(59, 130, 246, 0.2), transparent)`
                : 'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.2), transparent)',
            }}
            transition={{ duration: 0.1 }}
          />

          {/* Icon container */}
          <div className="icon-container">
            <AnimatePresence mode="wait">
              {isListening ? (
                // Sound wave animation when listening
                <motion.div
                  key="waves"
                  className="sound-waves"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.2 }}
                >
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div
                      key={i}
                      className="wave-bar"
                      animate={{
                        scaleY: 0.3 + audioLevel * (0.5 + Math.random() * 0.5),
                        opacity: 0.6 + audioLevel * 0.4,
                      }}
                      transition={{
                        duration: 0.1,
                        delay: i * 0.02,
                      }}
                    />
                  ))}
                </motion.div>
              ) : (
                // Microphone icon when idle
                <motion.div
                  key="mic"
                  className="mic-icon"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{
                    opacity: 1,
                    scale: isHovered ? 1.1 : 1,
                  }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.2 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.button>

        {/* Status text below button */}
        <motion.div
          className="status-text"
          initial={false}
          animate={{
            opacity: isListening ? 1 : 0.6,
            y: isListening ? 0 : 5,
          }}
          transition={{ duration: 0.3 }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={isListening ? "listening" : "tap"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {isListening ? "Listening..." : "Tap to wake"}
            </motion.span>
          </AnimatePresence>
        </motion.div>

        {/* Transcript preview and send button */}
        <AnimatePresence>
          {input && input.trim() && !isListening && (
            <motion.div
              className="transcript-container"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className="transcript-text">{input}</div>
              <motion.button
                className="send-message-btn"
                onClick={sendMessage}
                disabled={sending}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Send size={18} />
                <span>{sending ? "Sending..." : "Send"}</span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat sidebar toggle button */}
      <motion.button
        className="chat-toggle-btn"
        onClick={onToggleSidebar}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{
          backgroundColor: isSidebarOpen ? "rgba(139, 92, 246, 0.3)" : "rgba(15, 15, 25, 0.8)",
        }}
      >
        <MessageSquare size={20} />
      </motion.button>

      <style jsx>{`
        .voice-view-container {
          width: 100%;
          height: 100%;
          min-height: 100vh;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .canvas-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }
        .voice-controls {
          position: absolute;
          bottom: 50px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        @media (max-width: 768px) {
          .voice-controls {
            bottom: 100px;
            gap: 12px;
          }
        }
      `}</style>

      <style jsx global>{`
        .gradient-ring-outer {
          position: absolute;
          width: 110px;
          height: 110px;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            rgba(139, 92, 246, 0.8),
            rgba(59, 130, 246, 0.6),
            rgba(139, 92, 246, 0.2),
            rgba(59, 130, 246, 0.6),
            rgba(139, 92, 246, 0.8)
          );
          mask: radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px));
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px));
          pointer-events: none;
        }

        .gradient-ring-inner {
          position: absolute;
          width: 95px;
          height: 95px;
          border-radius: 50%;
          background: conic-gradient(
            from 180deg,
            rgba(59, 130, 246, 0.6),
            rgba(139, 92, 246, 0.4),
            transparent,
            rgba(139, 92, 246, 0.4),
            rgba(59, 130, 246, 0.6)
          );
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px));
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px));
          pointer-events: none;
        }

        .orbs-container {
          position: absolute;
          width: 100px;
          height: 100px;
          pointer-events: none;
        }

        .floating-orb {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .orb-inner {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(139, 92, 246, 1), rgba(59, 130, 246, 0.8));
          box-shadow: 0 0 10px 3px rgba(139, 92, 246, 0.6),
                      0 0 20px 6px rgba(59, 130, 246, 0.3);
        }

        @media (max-width: 768px) {
          .orb-inner {
            width: 6px;
            height: 6px;
            box-shadow: 0 0 8px 2px rgba(139, 92, 246, 0.6),
                        0 0 15px 4px rgba(59, 130, 246, 0.3);
          }
        }

        .pulse-ring {
          position: absolute;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 2px solid rgba(139, 92, 246, 0.5);
          pointer-events: none;
        }

        .voice-toggle-btn {
          position: relative;
          width: 80px;
          height: 80px;
          background: rgba(15, 15, 25, 0.8);
          border: none;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          backdrop-filter: blur(20px);
          z-index: 1;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-bg-gradient {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          pointer-events: none;
        }

        .icon-container {
          position: relative;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }

        .mic-icon {
          width: 28px;
          height: 28px;
          color: rgba(255, 255, 255, 0.9);
        }

        .mic-icon svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.5));
        }

        .sound-waves {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          height: 32px;
        }

        .wave-bar {
          width: 4px;
          height: 100%;
          background: linear-gradient(180deg, rgba(139, 92, 246, 1), rgba(59, 130, 246, 0.8));
          border-radius: 2px;
          transform-origin: center;
          box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
        }

        .status-text {
          font-size: 13px;
          font-weight: 400;
          color: rgba(255, 255, 255, 0.7);
          letter-spacing: 1px;
          text-transform: uppercase;
          text-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
        }

        .voice-toggle-btn.active .mic-icon,
        .voice-toggle-btn.active .sound-waves {
          filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.8));
        }

        .transcript-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          max-width: 320px;
          margin-top: 8px;
        }

        .transcript-text {
          background: rgba(15, 15, 25, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 12px 18px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          line-height: 1.5;
          text-align: center;
          max-height: 100px;
          overflow-y: auto;
        }

        .send-message-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          color: white;
          padding: 12px 24px;
          border-radius: 25px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
          transition: all 0.2s;
        }

        .send-message-btn:hover:not(:disabled) {
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
        }

        .send-message-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .chat-toggle-btn {
          position: fixed;
          bottom: 30px;
          right: 30px;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(15, 15, 25, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          backdrop-filter: blur(20px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 40;
          transition: all 0.2s;
        }

        .chat-toggle-btn:hover {
          color: white;
          border-color: rgba(139, 92, 246, 0.5);
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
        }

        /* Mobile responsive styles */
        @media (max-width: 768px) {
          .gradient-ring-outer {
            width: 90px;
            height: 90px;
          }

          .gradient-ring-inner {
            width: 78px;
            height: 78px;
          }

          .orbs-container {
            width: 80px;
            height: 80px;
          }

          .voice-toggle-btn {
            width: 65px;
            height: 65px;
          }

          .icon-container {
            width: 32px;
            height: 32px;
          }

          .mic-icon {
            width: 22px;
            height: 22px;
          }

          .sound-waves {
            height: 26px;
            gap: 3px;
          }

          .wave-bar {
            width: 3px;
          }

          .pulse-ring {
            width: 65px;
            height: 65px;
          }

          .status-text {
            font-size: 11px;
          }

          .transcript-container {
            max-width: 280px;
            margin-top: 4px;
          }

          .transcript-text {
            padding: 10px 14px;
            font-size: 13px;
            max-height: 80px;
          }

          .send-message-btn {
            padding: 10px 20px;
            font-size: 13px;
          }

          .chat-toggle-btn {
            bottom: 20px;
            right: 20px;
            width: 44px;
            height: 44px;
          }
        }

        /* Very small screens */
        @media (max-width: 380px) {
          .gradient-ring-outer {
            width: 80px;
            height: 80px;
          }

          .gradient-ring-inner {
            width: 68px;
            height: 68px;
          }

          .voice-toggle-btn {
            width: 55px;
            height: 55px;
          }

          .pulse-ring {
            width: 55px;
            height: 55px;
          }

          .transcript-container {
            max-width: 240px;
          }
        }
      `}</style>
    </div>
  );
}
