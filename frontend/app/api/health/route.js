export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check endpoint - simple ping to verify gateway is reachable
 */
export async function GET() {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;

  if (!token) {
    return Response.json({
      connected: false,
      error: "OPENCLAW_GATEWAY_TOKEN not configured"
    });
  }

  try {
    // Simple ping - just check if gateway responds at all
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(gatewayUrl, {
      method: "HEAD",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      signal: controller.signal,
      cache: "no-store"
    });

    clearTimeout(timeout);

    // Any response means the gateway is reachable
    return Response.json({
      connected: true,
      status: res.status
    });

  } catch (err) {
    // Only fail if we can't reach the gateway at all
    return Response.json({
      connected: false,
      error: err.name === "AbortError" ? "Timeout" : err.message
    });
  }
}
