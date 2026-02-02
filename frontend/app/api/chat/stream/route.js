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
    const msg = err?.message || "Gateway fetch failed";
    console.error("Gateway fetch failed", err);
    return new Response(msg, { status: 500 });
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return new Response(text || `Gateway error (${res.status || 500})`, { status: res.status || 500 });
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const text = await res.text().catch(() => "");
    return new Response(text || "Gateway returned non-stream response", { status: 502 });
  }

  // tee stream to collect full assistant reply for persistence
  const [stream1, stream2] = res.body.tee();
  let full = "";
  (async () => {
    try {
      const reader = stream2.getReader();
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
          if (data === "[DONE]") break;
          try {
            const payload = JSON.parse(data);
            const delta = payload.choices?.[0]?.delta?.content || "";
            if (delta) full += delta;
          } catch {}
        }
      }
      if (session_id) {
        const supabase = getSupabase();
        await supabase.from("chat_messages").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: full || "(no reply)" }
        ]);
      }
    } catch {}
  })();

  return new Response(stream1, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
