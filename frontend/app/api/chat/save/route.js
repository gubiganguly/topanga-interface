export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { message, session_id, role } = body;
    
    if (!message || !session_id || !role) {
      return new Response("Missing fields", { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.from("chat_messages").insert([
      { 
        session_id: session_id.trim(), 
        role, 
        content: message, 
        created_at: new Date().toISOString() 
      }
    ]).select();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ status: "ok", id: data?.[0]?.id }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
