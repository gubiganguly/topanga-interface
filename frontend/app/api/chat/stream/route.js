export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req) {
  const { message, session_id } = await req.json();

  // 1. Insert User Message Immediately (Blocking)
  // This ensures the user message is in DB before the stream even starts.
  if (session_id) {
    try {
      const supabase = getSupabase();
      await supabase.from("chat_messages").insert([
        { session_id, role: "user", content: message }
      ]);
    } catch (err) {
      console.error("Failed to save user message", err);
    }
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  const agentId = process.env.OPENCLAW_AGENT_ID || "main";
  const sessionKey = process.env.OPENCLAW_SESSION_KEY || "agent:main:main";
  const cfAccessId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!token) {
    return new Response("OPENCLAW_GATEWAY_TOKEN not set", { status: 500 });
  }

  let res;
  try {
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-openclaw-agent-id": agentId,
      "x-openclaw-session-key": sessionKey
    };
    if (cfAccessId && cfAccessSecret) {
      headers["CF-Access-Client-Id"] = cfAccessId;
      headers["CF-Access-Client-Secret"] = cfAccessSecret;
    }

    res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openclaw",
        stream: true,
        messages: [{ role: "user", content: message }]
      })
    });
  } catch (err) {
    return new Response(err?.message || "Gateway fetch failed", { status: 500 });
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return new Response(text || `Gateway error (${res.status})`, { status: res.status || 500 });
  }

  // 2. Custom Stream Proxy
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullAssistantResponse = "";
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Forward chunk to client immediately
          controller.enqueue(value);

          // Accumulate for DB
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
              if (delta) fullAssistantResponse += delta;
            } catch {}
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
        controller.error(err);
      } finally {
        // 3. Save Assistant Message BEFORE closing the client stream
        // This blocks the 'end' of the response until DB write is confirmed.
        if (session_id) {
          try {
            const supabase = getSupabase();
            await supabase.from("chat_messages").insert([
              { session_id, role: "assistant", content: fullAssistantResponse || "(no reply)" }
            ]);
          } catch (err) {
            console.error("Failed to save assistant message", err);
          }
        }
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
