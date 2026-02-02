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
    const supabase = getSupabase();
    const token = process.env.SUPABASE_SECRET_KEY || "";
    let keyRole = "unknown";
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      keyRole = payload.role;
    } catch {}

    const testId = `test-${Date.now()}`;
    
    // 1. Try Insert
    const { data: insertData, error: insertError } = await supabase
      .from("chat_messages")
      .insert([{ 
        session_id: "test-diagnostic", 
        role: "system", 
        content: "diagnostic probe", 
        created_at: new Date().toISOString() 
      }])
      .select();

    if (insertError) {
      return new Response(JSON.stringify({ 
        status: "error", 
        stage: "insert", 
        error: insertError, 
        keyRole 
      }), { status: 500 });
    }

    // 2. Verify Read (RLS check)
    if (!insertData || insertData.length === 0) {
      return new Response(JSON.stringify({ 
        status: "error", 
        stage: "select", 
        error: "Insert succeeded but returned no data (RLS blocking read)", 
        keyRole 
      }), { status: 500 });
    }

    return new Response(JSON.stringify({ 
      status: "ok", 
      message: "Write and Read successful", 
      data: insertData,
      keyRole 
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ 
      status: "error", 
      stage: "init", 
      error: err.message 
    }), { status: 500 });
  }
}
