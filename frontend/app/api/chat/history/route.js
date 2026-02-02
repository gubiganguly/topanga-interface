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
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "session_id required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const debug = searchParams.get("debug") === "1";
    let sessions = [];
    if (debug) {
      const { data: sdata } = await supabase
        .from("chat_messages")
        .select("session_id")
        .order("created_at", { ascending: false })
        .limit(20);
      sessions = (sdata || []).map(r => r.session_id);
    }

    return new Response(JSON.stringify({ session_id: sessionId, count: (data || []).length, messages: data || [], sessions }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
