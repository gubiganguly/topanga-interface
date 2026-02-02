export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function proxyAdmin(req, path, methodOverride) {
  const adminUrl = process.env.ADMIN_API_URL || "";
  const adminToken = process.env.ADMIN_API_TOKEN || "";
  const cfAccessId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!adminUrl || !adminToken) {
    return new Response(JSON.stringify({ error: "ADMIN_API_URL or ADMIN_API_TOKEN not set" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const method = methodOverride || req.method || "POST";
  let body = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.text();
  }

  const headers = {
    "Authorization": `Bearer ${adminToken}`,
    "Content-Type": "application/json"
  };
  if (cfAccessId && cfAccessSecret) {
    headers["CF-Access-Client-Id"] = cfAccessId;
    headers["CF-Access-Client-Secret"] = cfAccessSecret;
  }

  let res;
  try {
    res = await fetch(`${adminUrl}${path}`, {
      method,
      headers,
      body
    });
  } catch (err) {
    const msg = err?.message || "Admin fetch failed";
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { "Content-Type": "application/json" } });
  }

  const text = await res.text().catch(() => "");
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" }
  });
}
