export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const agentId = process.env.OPENCLAW_AGENT_ID || "main";
const sessionKey = process.env.OPENCLAW_SESSION_KEY || "agent:main:main";

const adminUrl = process.env.ADMIN_API_URL || "";
const adminToken = process.env.ADMIN_API_TOKEN || "";
const cfAccessId = process.env.CF_ACCESS_CLIENT_ID;
const cfAccessSecret = process.env.CF_ACCESS_CLIENT_SECRET;

async function callAdmin(path, payload) {
  const headers = {
    "Authorization": `Bearer ${adminToken}`,
    "Content-Type": "application/json"
  };
  if (cfAccessId && cfAccessSecret) {
    headers["CF-Access-Client-Id"] = cfAccessId;
    headers["CF-Access-Client-Secret"] = cfAccessSecret;
  }
  const res = await fetch(`${adminUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload || {})
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, text, json };
}

function extractPatch(text) {
  // Try to find a diff block; otherwise return full text
  const match = text.match(/diff --git[\s\S]*/m);
  return match ? match[0].trim() : text.trim();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const instruction = body?.instruction?.trim();
    if (!instruction) {
      return new Response(JSON.stringify({ error: "instruction required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (!gatewayToken || !adminUrl || !adminToken) {
      return new Response(JSON.stringify({ error: "Missing gateway/admin env" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const system = `You are generating a git patch for a Next.js project.\n- Output ONLY a valid unified diff (no markdown, no commentary).\n- Only modify files under: frontend/, README.md, .gitignore.\n- Keep changes minimal.\n- Do not include \\ No newline at end of file markers.`;

    const prompt = `Task: ${instruction}\nReturn a unified diff patch.`;

    const gatewayHeaders = {
      "Authorization": `Bearer ${gatewayToken}`,
      "Content-Type": "application/json",
      "x-openclaw-agent-id": agentId,
      "x-openclaw-session-key": sessionKey
    };
    if (cfAccessId && cfAccessSecret) {
      gatewayHeaders["CF-Access-Client-Id"] = cfAccessId;
      gatewayHeaders["CF-Access-Client-Secret"] = cfAccessSecret;
    }

    const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: gatewayHeaders,
      body: JSON.stringify({
        model: "openclaw",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });

    const raw = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: raw || "Gateway error" }), { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    let data;
    try { data = JSON.parse(raw); } catch {
      return new Response(JSON.stringify({ error: "Gateway returned non-JSON" }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
    const content = data?.choices?.[0]?.message?.content || "";
    const patch = extractPatch(content);

    const propose = await callAdmin("/propose", { patch });
    if (!propose.ok) {
      return new Response(JSON.stringify({ error: propose.text || "Propose failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const apply = await callAdmin("/apply", { id: propose.json?.id, hash: propose.json?.hash });
    if (!apply.ok) {
      return new Response(JSON.stringify({ error: apply.text || "Apply failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const commit = await callAdmin("/commit", { message: instruction.slice(0, 72) || "Update" });
    if (!commit.ok) {
      return new Response(JSON.stringify({ error: commit.text || "Commit failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const push = await callAdmin("/push", {});
    if (!push.ok) {
      return new Response(JSON.stringify({ error: push.text || "Push failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, patch }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
