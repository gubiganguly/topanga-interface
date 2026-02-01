export async function POST(req) {
  const { message } = await req.json();

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  const agentId = process.env.OPENCLAW_AGENT_ID || "main";
  const sessionKey = process.env.OPENCLAW_SESSION_KEY || "agent:main:main";

  if (!token) {
    return new Response("OPENCLAW_GATEWAY_TOKEN not set", { status: 500 });
  }

  let res;
  try {
    res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-openclaw-agent-id": agentId,
        "x-openclaw-session-key": sessionKey
      },
      body: JSON.stringify({
        model: "openclaw",
        stream: true,
        messages: [{ role: "user", content: message }]
      })
    });
  } catch (err) {
    const msg = err?.message || "Gateway fetch failed";
    return new Response(msg, { status: 500 });
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return new Response(text || `Gateway error (${res.status || 500})`, { status: res.status || 500 });
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
