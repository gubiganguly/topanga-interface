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
      .select("role, content, created_at, session_id")
      .order("created_at", { ascending: false })
      .limit(200);

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
    if (debug) {
      const { data: sdata } = await supabase
        .from("chat_messages")
        .select("session_id")
        .order("created_at", { ascending: false })
        .limit(20);
      sessions = (sdata || []).map(r => r.session_id);
      try {
        supabaseHost = new URL(process.env.SUPABASE_URL || "").host || undefined;
      } catch {}
    }

    return new Response(JSON.stringify({ session_id: sessionId, count: (data || []).length, messages: data || [], sessions, supabase_host: supabaseHost }), {
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
