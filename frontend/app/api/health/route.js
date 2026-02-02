export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check endpoint to verify gateway connectivity
 * Returns connection status and detailed error info if disconnected
 */
export async function GET() {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  const cfAccessId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  // Check if required env vars are set
  if (!token) {
    return new Response(JSON.stringify({
      connected: false,
      error: "Configuration Error",
      details: "OPENCLAW_GATEWAY_TOKEN environment variable is not set.",
      gatewayUrl: gatewayUrl
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  try {
    // Build headers
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };
    if (cfAccessId && cfAccessSecret) {
      headers["CF-Access-Client-Id"] = cfAccessId;
      headers["CF-Access-Client-Secret"] = cfAccessSecret;
    }

    // Try to hit a lightweight endpoint (models list is typically fast)
    const res = await fetch(`${gatewayUrl}/v1/models`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const contentType = res.headers.get("content-type") || "";
    
    // Check if we got HTML instead of JSON (common tunnel/proxy error)
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      
      // Detect common error pages
      let errorType = "Unknown HTML Response";
      if (text.includes("Cloudflare Access")) {
        errorType = "Cloudflare Access Authentication Required";
      } else if (text.includes("<!DOCTYPE") || text.includes("<!doctype")) {
        errorType = "Gateway returned HTML instead of JSON (possibly wrong URL or service down)";
      }

      return new Response(JSON.stringify({
        connected: false,
        error: errorType,
        details: `Expected JSON but received ${contentType || "unknown content type"}. Response preview: ${text.slice(0, 300)}`,
        gatewayUrl: gatewayUrl,
        hasCfCredentials: !!(cfAccessId && cfAccessSecret)
      }), { 
        status: 200, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      return new Response(JSON.stringify({
        connected: false,
        error: `Gateway Error (${res.status})`,
        details: errorText || `HTTP ${res.status} response from gateway`,
        gatewayUrl: gatewayUrl
      }), { 
        status: 200, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // Successfully connected!
    const data = await res.json();
    return new Response(JSON.stringify({
      connected: true,
      gatewayUrl: gatewayUrl,
      models: data.data?.map(m => m.id) || []
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });

  } catch (err) {
    // Network errors, timeouts, etc.
    let errorType = "Connection Failed";
    let details = err.message;

    if (err.name === "TimeoutError" || err.message.includes("timeout")) {
      errorType = "Connection Timeout";
      details = "Gateway did not respond within 10 seconds. The service may be down or unreachable.";
    } else if (err.message.includes("ECONNREFUSED")) {
      errorType = "Connection Refused";
      details = `Cannot connect to ${gatewayUrl}. The gateway service is not running or not accepting connections.`;
    } else if (err.message.includes("ENOTFOUND") || err.message.includes("getaddrinfo")) {
      errorType = "DNS Resolution Failed";
      details = `Cannot resolve hostname for ${gatewayUrl}. Check if the URL is correct.`;
    }

    return new Response(JSON.stringify({
      connected: false,
      error: errorType,
      details: details,
      gatewayUrl: gatewayUrl
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  }
}


