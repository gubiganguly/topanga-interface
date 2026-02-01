export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { message } = await req.json();

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  const agentId = process.env.OPENCLAW_AGENT_ID || "main";
  const sessionKey = process.env.OPENCLAW_SESSION_KEY || "agent:main:main";
  const cfAccessId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!token) {
    return Response.json({ error: "OPENCLAW_GATEWAY_TOKEN not set" }, { status: 500 });
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
        messages: [{ role: "user", content: message }]
      })
    });
  } catch (err) {
    const msg = err?.message || "Gateway fetch failed";
    console.error("Gateway fetch failed", err);
    return Response.json({ error: msg }, { status: 500 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json({ error: text || `Gateway error (${res.status})` }, { status: res.status });
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content || "(no reply)";
  return Response.json({ reply });
}
