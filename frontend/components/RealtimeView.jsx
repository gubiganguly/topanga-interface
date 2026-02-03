"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Mic, MicOff, Phone, PhoneOff, Loader2 } from "lucide-react";

// Status states
const STATUS = {
  IDLE: "idle",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  SPEAKING: "speaking",
  LISTENING: "listening",
  ERROR: "error"
};

// Animated floating orb for teal theme
function TealOrb({ delay, duration, size, distance, isActive, intensity }) {
  return (
    <motion.div
      className="teal-floating-orb"
      style={{ width: size, height: size }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: isActive ? 0.6 + intensity * 0.4 : 0.3,
        scale: isActive ? 1 + intensity * 0.3 : 1,
        rotate: 360,
      }}
      transition={{
        opacity: { duration: 0.3 },
        scale: { duration: 0.15 },
        rotate: { duration: isActive ? duration * 0.7 : duration, repeat: Infinity, ease: "linear", delay }
      }}
    >
      <motion.div
        className="teal-orb-inner"
        style={{ transform: `translateY(-${distance}px)` }}
      />
    </motion.div>
  );
}

export default function RealtimeView({ setActiveView }) {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [intensity, setIntensity] = useState(0);

  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Audio level monitoring
  useEffect(() => {
    if (!analyserRef.current || status === STATUS.IDLE || status === STATUS.CONNECTING) {
      setIntensity(0);
      return;
    }

    const dataArray = new Uint8Array(64);
    const updateLevel = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      setIntensity(prev => prev * 0.3 + (avg / 255) * 0.7);
      animationRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [status]);

  // Handle tool calls from OpenAI
  const handleToolCall = useCallback(async (toolCall) => {
    const { name, call_id, arguments: argsStr } = toolCall;
    let args;
    try {
      args = JSON.parse(argsStr);
    } catch {
      args = {};
    }

    let result;
    let action;

    switch (name) {
      case "send_message":
        action = "message.send";
        break;
      case "run_command":
        action = "command.run";
        break;
      case "search_web":
        action = "search.web";
        break;
      case "write_file":
        action = "file.write";
        break;
      case "read_file":
        action = "file.read";
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }

    if (action) {
      try {
        const response = await fetch("/api/realtime/gateway", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...args })
        });
        result = await response.json();
      } catch (err) {
        result = { error: err.message };
      }
    }

    // Send tool result back
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id,
          output: JSON.stringify(result)
        }
      }));
      // Trigger response generation
      dataChannelRef.current.send(JSON.stringify({
        type: "response.create"
      }));
    }
  }, []);

  // Connect to OpenAI Realtime API
  const connect = useCallback(async () => {
    if (status === STATUS.CONNECTING || status === STATUS.CONNECTED) return;

    setStatus(STATUS.CONNECTING);
    setError(null);

    try {
      // Get ephemeral token
      console.log("[Realtime] Fetching ephemeral token...");
      const tokenRes = await fetch("/api/realtime/token", { method: "POST" });
      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || "Failed to get token");
      }
      const tokenData = await tokenRes.json();
      const ephemeralKey = tokenData.value;
      console.log("[Realtime] Got ephemeral token, expires:", tokenData.expires_at);

      if (!ephemeralKey) {
        throw new Error("No ephemeral key in response");
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      // Setup audio analysis
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Create peer connection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Add audio track
      const audioTrack = stream.getAudioTracks()[0];
      pc.addTrack(audioTrack, stream);

      // Handle incoming audio - create persistent audio element
      // IMPORTANT: Audio element must be created and configured BEFORE WebRTC connection
      const audioEl = document.createElement("audio");
      audioEl.id = "realtime-remote-audio";
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.controls = false; // Hidden but functional
      audioEl.volume = 1.0;
      // Some browsers need the element in DOM for autoplay
      document.body.appendChild(audioEl);
      remoteAudioRef.current = audioEl;
      console.log("[Realtime] Audio element created and attached to DOM");

      pc.ontrack = (e) => {
        console.log("[Realtime] Received remote audio track", e.streams[0]);
        console.log("[Realtime] Track info:", e.track.kind, e.track.readyState, e.track.enabled);
        audioEl.srcObject = e.streams[0];

        // Log stream activity
        e.streams[0].getTracks().forEach(track => {
          console.log("[Realtime] Stream track:", track.kind, track.readyState, track.enabled);
          track.onunmute = () => console.log("[Realtime] Track unmuted - audio should play");
          track.onmute = () => console.log("[Realtime] Track muted");
        });

        // Ensure playback starts (handles autoplay policy)
        audioEl.play().then(() => {
          console.log("[Realtime] Audio playback started successfully");
        }).catch(err => {
          console.warn("[Realtime] Audio autoplay blocked:", err);
          // Try playing on next user interaction
        });
      };

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        console.log("[Realtime] Connection state:", pc.connectionState);
        if (pc.connectionState === "failed") {
          setStatus(STATUS.ERROR);
          setError("Connection failed");
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[Realtime] ICE connection state:", pc.iceConnectionState);
      };

      // Create data channel for events
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log("[Realtime] Data channel opened");
        setStatus(STATUS.CONNECTED);
        // Session is configured server-side via ephemeral token
        // DO NOT send session.update with modalities - it causes audio output to break
        // See: https://community.openai.com/t/realtime-api-with-webrtc-issue-when-the-modality-is-updated-to-text-audio-the-audio-output-is-missing/1254337
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          // Log all events for debugging
          if (event.type !== "response.audio.delta") {
            // Don't log audio delta events (too noisy)
            console.log("[Realtime] Event:", event.type, event);
          }
          handleServerEvent(event);
        } catch (err) {
          console.error("[Realtime] Failed to parse event:", err, e.data);
        }
      };

      dc.onerror = () => {
        setStatus(STATUS.ERROR);
        setError("Data channel error");
      };

      // Create offer
      console.log("[Realtime] Creating SDP offer...");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("[Realtime] Local description set");

      // Send offer to OpenAI
      console.log("[Realtime] Sending offer to OpenAI...");
      const sdpResponse = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp"
          },
          body: offer.sdp
        }
      );

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        console.error("[Realtime] SDP response error:", sdpResponse.status, errText);
        throw new Error(`Failed to establish WebRTC connection: ${sdpResponse.status}`);
      }

      const answerSdp = await sdpResponse.text();
      console.log("[Realtime] Got SDP answer, setting remote description...");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      console.log("[Realtime] Remote description set - WebRTC connection established");

    } catch (err) {
      setStatus(STATUS.ERROR);
      setError(err.message);
      cleanup();
    }
  }, [status, cleanup, handleToolCall]);

  // Handle server events
  const handleServerEvent = useCallback((event) => {
    switch (event.type) {
      case "session.created":
        console.log("[Realtime] Session created:", event.session?.id);
        break;

      case "session.updated":
        console.log("[Realtime] Session updated:", event.session?.modalities);
        break;

      case "input_audio_buffer.speech_started":
        console.log("[Realtime] User started speaking");
        setStatus(STATUS.LISTENING);
        break;

      case "input_audio_buffer.speech_stopped":
        console.log("[Realtime] User stopped speaking");
        setStatus(STATUS.CONNECTED);
        break;

      case "response.created":
        console.log("[Realtime] Response created:", event.response?.id);
        break;

      case "response.output_item.added":
        console.log("[Realtime] Output item added:", event.item?.type);
        break;

      case "response.audio.delta":
        // Audio data is being streamed - this means AI is speaking
        // WebRTC handles playback automatically, we just track state
        if (status !== STATUS.SPEAKING) {
          setStatus(STATUS.SPEAKING);
        }
        break;

      case "response.audio.done":
        console.log("[Realtime] Audio response complete");
        setStatus(STATUS.CONNECTED);
        break;

      case "response.audio_transcript.delta":
        // Transcript being generated
        setStatus(STATUS.SPEAKING);
        break;

      case "response.done":
        console.log("[Realtime] Response done:", event.response?.status);
        setStatus(STATUS.CONNECTED);
        break;

      case "conversation.item.input_audio_transcription.completed":
        console.log("[Realtime] User transcript:", event.transcript);
        if (event.transcript) {
          setTranscript(prev => [...prev, { role: "user", text: event.transcript }]);
        }
        break;

      case "response.audio_transcript.done":
        console.log("[Realtime] AI transcript:", event.transcript);
        if (event.transcript) {
          setTranscript(prev => [...prev, { role: "assistant", text: event.transcript }]);
        }
        break;

      case "response.function_call_arguments.done":
        console.log("[Realtime] Tool call:", event.name);
        handleToolCall({
          name: event.name,
          call_id: event.call_id,
          arguments: event.arguments
        });
        break;

      case "error":
        console.error("[Realtime] Error event:", event.error);
        setError(event.error?.message || "Unknown error");
        break;

      case "rate_limits.updated":
        // Ignore rate limit updates
        break;

      default:
        // Log any unhandled events
        if (!event.type.includes(".delta")) {
          console.log("[Realtime] Unhandled event:", event.type);
        }
    }
  }, [handleToolCall, status]);

  // Disconnect
  const disconnect = useCallback(() => {
    cleanup();
    setStatus(STATUS.IDLE);
    setTranscript([]);
  }, [cleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  const isActive = status === STATUS.CONNECTED || status === STATUS.SPEAKING || status === STATUS.LISTENING;
  const isSpeaking = status === STATUS.SPEAKING;
  const isListening = status === STATUS.LISTENING;

  const glowIntensity = isActive ? 30 + intensity * 50 : 10;

  const getStatusText = () => {
    switch (status) {
      case STATUS.IDLE: return "Tap to connect";
      case STATUS.CONNECTING: return "Connecting...";
      case STATUS.CONNECTED: return "Connected";
      case STATUS.SPEAKING: return "Speaking...";
      case STATUS.LISTENING: return "Listening...";
      case STATUS.ERROR: return error || "Error";
      default: return "";
    }
  };

  return (
    <div className="realtime-view-container">
      {/* Background gradient */}
      <div className="teal-bg-gradient" />

      <div className="realtime-controls">
        {/* Outer rotating gradient ring */}
        <motion.div
          className={`teal-ring-outer ${isSpeaking ? 'ring-speaking' : ''}`}
          animate={{
            rotate: 360,
            opacity: isActive ? 0.8 : 0.3,
          }}
          transition={{
            rotate: { duration: isActive ? 5 : 8, repeat: Infinity, ease: "linear" },
            opacity: { duration: 0.3 }
          }}
        />

        {/* Inner rotating gradient ring */}
        <motion.div
          className={`teal-ring-inner ${isSpeaking ? 'ring-speaking' : ''}`}
          animate={{
            rotate: -360,
            opacity: isActive ? 0.6 : 0.2,
          }}
          transition={{
            rotate: { duration: isActive ? 4 : 6, repeat: Infinity, ease: "linear" },
            opacity: { duration: 0.3 }
          }}
        />

        {/* Floating orbs */}
        <div className="teal-orbs-container">
          <TealOrb delay={0} duration={4} size={80} distance={45} isActive={isActive} intensity={intensity} />
          <TealOrb delay={1.3} duration={5} size={80} distance={45} isActive={isActive} intensity={intensity} />
          <TealOrb delay={2.6} duration={4.5} size={80} distance={45} isActive={isActive} intensity={intensity} />
        </div>

        {/* Pulsing rings when active */}
        <AnimatePresence>
          {isActive && (
            <>
              {[0, 0.5, 1].map((delay, i) => (
                <motion.div
                  key={i}
                  className={`teal-pulse-ring ${isSpeaking ? 'pulse-speaking' : ''}`}
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
          onClick={isActive ? disconnect : connect}
          className={`realtime-toggle-btn ${isActive ? "active" : ""} ${status === STATUS.ERROR ? "error" : ""}`}
          disabled={status === STATUS.CONNECTING}
          animate={{
            scale: isActive ? 1 + intensity * 0.15 : 1,
            boxShadow: `0 0 ${glowIntensity}px ${glowIntensity * 0.3}px rgba(20, 184, 166, ${isActive ? 0.6 : 0.2}),
                        0 0 ${glowIntensity * 2}px ${glowIntensity * 0.5}px rgba(6, 182, 212, ${isActive ? 0.4 : 0.1})`,
          }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
        >
          <motion.div className="realtime-btn-bg" />
          <div className="realtime-icon-container">
            <AnimatePresence mode="wait">
              {status === STATUS.CONNECTING ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1, rotate: 360 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ rotate: { duration: 1, repeat: Infinity, ease: "linear" } }}
                >
                  <Loader2 size={28} />
                </motion.div>
              ) : isActive ? (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <PhoneOff size={28} />
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <Phone size={28} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.button>

        {/* Status text */}
        <motion.div
          className={`realtime-status-text ${status === STATUS.ERROR ? 'error' : ''}`}
          animate={{ opacity: isActive || status === STATUS.CONNECTING ? 1 : 0.6 }}
        >
          {getStatusText()}
        </motion.div>

        {/* Mute button (only when connected) */}
        <AnimatePresence>
          {isActive && (
            <motion.button
              className={`mute-btn ${isMuted ? "muted" : ""}`}
              onClick={toggleMute}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Transcript */}
      <AnimatePresence>
        {transcript.length > 0 && (
          <motion.div
            className="realtime-transcript"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            {transcript.slice(-5).map((item, i) => (
              <div key={i} className={`transcript-item ${item.role}`}>
                <span className="transcript-role">{item.role === "user" ? "You" : "Topanga"}</span>
                <span className="transcript-text">{item.text}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat toggle button */}
      <motion.button
        className="chat-toggle-btn-realtime"
        onClick={() => setActiveView("chat")}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <MessageSquare size={20} />
      </motion.button>

      <style jsx>{`
        .realtime-view-container {
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

        .teal-bg-gradient {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, rgba(20, 184, 166, 0.15) 0%, transparent 70%);
          pointer-events: none;
        }

        .realtime-controls {
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

        @media (max-width: 1024px) {
          .realtime-controls {
            bottom: 80px;
            gap: 12px;
          }
        }

        @media (max-width: 600px) {
          .realtime-controls {
            bottom: 60px;
          }
        }
      `}</style>

      <style jsx global>{`
        .teal-ring-outer {
          position: absolute;
          width: 110px;
          height: 110px;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            rgba(20, 184, 166, 0.8),
            rgba(6, 182, 212, 0.6),
            rgba(20, 184, 166, 0.2),
            rgba(6, 182, 212, 0.6),
            rgba(20, 184, 166, 0.8)
          );
          mask: radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px));
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px));
          pointer-events: none;
        }

        .teal-ring-inner {
          position: absolute;
          width: 95px;
          height: 95px;
          border-radius: 50%;
          background: conic-gradient(
            from 180deg,
            rgba(6, 182, 212, 0.6),
            rgba(20, 184, 166, 0.4),
            transparent,
            rgba(20, 184, 166, 0.4),
            rgba(6, 182, 212, 0.6)
          );
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px));
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px));
          pointer-events: none;
        }

        .ring-speaking.teal-ring-outer {
          background: conic-gradient(
            from 0deg,
            rgba(34, 211, 238, 0.9),
            rgba(6, 182, 212, 0.7),
            rgba(34, 211, 238, 0.3),
            rgba(6, 182, 212, 0.7),
            rgba(34, 211, 238, 0.9)
          );
        }

        .ring-speaking.teal-ring-inner {
          background: conic-gradient(
            from 180deg,
            rgba(6, 182, 212, 0.7),
            rgba(34, 211, 238, 0.5),
            transparent,
            rgba(34, 211, 238, 0.5),
            rgba(6, 182, 212, 0.7)
          );
        }

        .teal-orbs-container {
          position: absolute;
          width: 100px;
          height: 100px;
          pointer-events: none;
        }

        .teal-floating-orb {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .teal-orb-inner {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(20, 184, 166, 1), rgba(6, 182, 212, 0.8));
          box-shadow: 0 0 10px 3px rgba(20, 184, 166, 0.6),
                      0 0 20px 6px rgba(6, 182, 212, 0.3);
        }

        .teal-pulse-ring {
          position: absolute;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 2px solid rgba(20, 184, 166, 0.5);
          pointer-events: none;
        }

        .pulse-speaking {
          border-color: rgba(34, 211, 238, 0.6);
        }

        .realtime-toggle-btn {
          position: relative;
          width: 80px;
          height: 80px;
          background: rgba(15, 15, 25, 0.8);
          border: none;
          border-radius: 50%;
          color: rgba(20, 184, 166, 0.9);
          cursor: pointer;
          backdrop-filter: blur(20px);
          z-index: 1;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.3s;
        }

        .realtime-toggle-btn:disabled {
          cursor: wait;
        }

        .realtime-toggle-btn.active {
          color: rgba(239, 68, 68, 0.9);
        }

        .realtime-toggle-btn.error {
          color: rgba(239, 68, 68, 0.9);
        }

        .realtime-btn-bg {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 50%, rgba(20, 184, 166, 0.2), transparent);
          pointer-events: none;
        }

        .realtime-icon-container {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .realtime-status-text {
          font-size: 13px;
          font-weight: 400;
          color: rgba(20, 184, 166, 0.9);
          letter-spacing: 1px;
          text-transform: uppercase;
          text-shadow: 0 0 20px rgba(20, 184, 166, 0.5);
        }

        .realtime-status-text.error {
          color: rgba(239, 68, 68, 0.9);
          text-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
        }

        .mute-btn {
          position: absolute;
          bottom: -60px;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(15, 15, 25, 0.8);
          border: 1px solid rgba(20, 184, 166, 0.3);
          color: rgba(20, 184, 166, 0.9);
          cursor: pointer;
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .mute-btn.muted {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.5);
          color: rgba(239, 68, 68, 0.9);
        }

        .mute-btn:hover {
          transform: scale(1.1);
        }

        .realtime-transcript {
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 500px;
          max-height: 200px;
          overflow-y: auto;
          background: rgba(15, 15, 25, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(20, 184, 166, 0.2);
          border-radius: 16px;
          padding: 16px;
          z-index: 10;
        }

        .transcript-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .transcript-item:last-child {
          border-bottom: none;
        }

        .transcript-item.user .transcript-role {
          color: rgba(20, 184, 166, 0.8);
        }

        .transcript-item.assistant .transcript-role {
          color: rgba(139, 92, 246, 0.8);
        }

        .transcript-role {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .transcript-text {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
          line-height: 1.4;
        }

        .chat-toggle-btn-realtime {
          position: fixed;
          bottom: 30px;
          right: 30px;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(15, 15, 25, 0.8);
          border: 1px solid rgba(20, 184, 166, 0.2);
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          backdrop-filter: blur(20px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 40;
          transition: all 0.2s;
        }

        .chat-toggle-btn-realtime:hover {
          color: white;
          border-color: rgba(20, 184, 166, 0.5);
          box-shadow: 0 0 20px rgba(20, 184, 166, 0.3);
        }

        /* Mobile responsive */
        @media (max-width: 1024px) {
          .teal-ring-outer {
            width: 90px;
            height: 90px;
          }

          .teal-ring-inner {
            width: 78px;
            height: 78px;
          }

          .teal-orbs-container {
            width: 80px;
            height: 80px;
          }

          .teal-orb-inner {
            width: 6px;
            height: 6px;
          }

          .realtime-toggle-btn {
            width: 65px;
            height: 65px;
          }

          .teal-pulse-ring {
            width: 65px;
            height: 65px;
          }

          .realtime-status-text {
            font-size: 11px;
          }

          .mute-btn {
            width: 38px;
            height: 38px;
            bottom: -50px;
          }

          .realtime-transcript {
            top: 60px;
            max-height: 150px;
            padding: 12px;
          }

          .transcript-text {
            font-size: 13px;
          }

          .chat-toggle-btn-realtime {
            bottom: 20px;
            right: 20px;
            width: 44px;
            height: 44px;
          }
        }

        @media (max-width: 480px) {
          .teal-ring-outer {
            width: 80px;
            height: 80px;
          }

          .teal-ring-inner {
            width: 68px;
            height: 68px;
          }

          .realtime-toggle-btn {
            width: 55px;
            height: 55px;
          }

          .teal-pulse-ring {
            width: 55px;
            height: 55px;
          }

          .realtime-transcript {
            width: 95%;
            top: 50px;
            max-height: 120px;
            padding: 10px;
          }
        }
      `}</style>
    </div>
  );
}
