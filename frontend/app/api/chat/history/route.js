export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id") || "agent:main:main";

    const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;
    
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Gateway Token" }), { status: 500 });
    }

    // Fetch history directly from Agent's memory
    const res = await fetch(`${gatewayUrl}/v1/sessions/${sessionId}/history?limit=100`, {
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Gateway Error: ${res.status}` }), { status: 500 });
    }

    const data = await res.json();
    
    // Transform Gateway format to Frontend format
    // Gateway: { messages: [{ role, content, timestamp }] }
    // Frontend expects: { messages: [{ role, content, created_at, session_id }] }
    
    const messages = (data.messages || []).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      created_at: new Date(m.timestamp || Date.now()).toISOString(),
      session_id: sessionId
    })).filter(m => m.role !== 'system'); // Hide system prompts if desired

    return new Response(JSON.stringify({ 
      session_id: sessionId, 
      count: messages.length, 
      messages: messages
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } 
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
