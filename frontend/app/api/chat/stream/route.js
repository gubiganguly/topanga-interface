export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { message, session_id, image } = await req.json();
  const targetSession = session_id || "agent:main:main";

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  const agentId = process.env.OPENCLAW_AGENT_ID || "main";
  
  // Pass Cf-Access headers if present (for tunnels)
  const cfAccessId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!token) {
    return new Response("OPENCLAW_GATEWAY_TOKEN not set", { status: 500 });
  }

  try {
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-openclaw-agent-id": agentId,
      "x-openclaw-session-key": targetSession
    };
    if (cfAccessId && cfAccessSecret) {
      headers["CF-Access-Client-Id"] = cfAccessId;
      headers["CF-Access-Client-Secret"] = cfAccessSecret;
    }

    // Construct content: Text only OR Multimodal array
    let contentPayload;
    if (image) {
      contentPayload = [
        { type: "text", text: message || " " }, // Ensure some text
        { type: "image_url", image_url: { url: image } }
      ];
    } else {
      contentPayload = message;
    }

    const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openclaw",
        stream: true,
        messages: [{ role: "user", content: contentPayload }]
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(text || `Gateway error (${res.status})`, { status: res.status });
    }

    // Proxy the stream directly to the client
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (err) {
    console.error("Gateway Connection Error:", err);
    return new Response(JSON.stringify({ error: "Gateway Connection Failed: " + err.message }), { status: 500 });
  }
}
