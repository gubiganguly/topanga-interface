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
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");

    const supabase = getSupabase();
    let query = supabase
      .from("chat_messages")
      .select("id, role, content, created_at, session_id")
      .order("created_at", { ascending: false })
      .limit(500);

    if (sessionId) {
      query = query.eq("session_id", sessionId);
    }

    const { data, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const debug = searchParams.get("debug") === "1";
    let sessions = [];
    let supabaseHost = undefined;
    let keyRole = "unknown";
    
    // Decode JWT (hacky but works for Supabase keys) to check role
    try {
      const token = process.env.SUPABASE_SECRET_KEY || "";
      const payload = JSON.parse(atob(token.split('.')[1]));
      keyRole = payload.role;
    } catch {}

    // Check DB time and latest message for diagnostics
    let dbTime = null;
    let latestMsg = null;
    if (debug) {
      try {
        const { data: timeData } = await supabase.rpc('get_time_check').select().catch(() => ({ data: null })); // RPC might not exist, fallback
        // Or just select now() via raw query if supported, but Supabase JS doesn't do raw sql easily without rpc
        // Workaround: insert a temp probe or just trust created_at
      } catch {}
      
      const { data: last } = await supabase.from("chat_messages").select("id, created_at, session_id").order("created_at", { ascending: false }).limit(1);
      latestMsg = last?.[0];
    }

    return new Response(JSON.stringify({ 
      session_id: sessionId, 
      count: (data || []).length, 
      messages: data || [], 
      sessions, 
      supabase_host: supabaseHost,
      key_role: keyRole,
      latest_db_msg: latestMsg
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
