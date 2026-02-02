export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req) {
  try {
    const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;
    const sessionKey = "agent:main:main"; 

    if (!token) return new Response("Missing Gateway Token", { status: 500 });

    // 1. Fetch Gateway History
    const gwRes = await fetch(`${gatewayUrl}/v1/sessions/${sessionKey}/history?limit=50`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!gwRes.ok) {
      return new Response(`Gateway Sync Failed: ${gwRes.status}`, { status: 500 });
    }
    
    const gwData = await gwRes.json();
    const gwMessages = gwData.messages || [];

    // 2. Fetch Supabase History (Last 50)
    const supabase = getSupabase();
    const { data: dbMessages, error } = await supabase
      .from("chat_messages")
      .select("content, created_at, role")
      .eq("session_id", sessionKey)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return new Response(`DB Read Failed: ${error.message}`, { status: 500 });

    // 3. Find Missing Messages
    // Simple dedup by content (since IDs differ)
    const missing = [];
    const dbSet = new Set(dbMessages.map(m => m.content.trim()));

    for (const msg of gwMessages) {
      // Skip system messages or empty ones
      if (msg.role === "system" || !msg.content) continue;
      
      const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      if (!text.trim()) continue;

      if (!dbSet.has(text.trim())) {
        missing.push({
          session_id: sessionKey,
          role: msg.role,
          content: text,
          created_at: new Date(msg.timestamp || Date.now()).toISOString()
        });
      }
    }

    // 4. Insert Missing
    if (missing.length > 0) {
      const { error: insertError } = await supabase.from("chat_messages").insert(missing);
      if (insertError) return new Response(`Sync Insert Failed: ${insertError.message}`, { status: 500 });
    }

    return new Response(JSON.stringify({ 
      status: "ok", 
      synced: missing.length, 
      gateway_count: gwMessages.length 
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
