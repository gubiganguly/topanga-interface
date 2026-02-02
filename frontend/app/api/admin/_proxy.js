export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function proxyAdmin(req, path) {
  const adminUrl = process.env.ADMIN_API_URL || "";
  const adminToken = process.env.ADMIN_API_TOKEN || "";
  const cfAccessId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!adminUrl || !adminToken) {
    return new Response("ADMIN_API_URL or ADMIN_API_TOKEN not set", { status: 500 });
  }

  const body = await req.text();

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
    body
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" }
  });
}
