export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { text } = await req.json();
  
  if (!text || text.trim().length === 0) {
    return new Response(JSON.stringify({ error: "No text provided" }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // ElevenLabs voice ID (Rachel - warm, conversational)
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text: text.substring(0, 5000), // Limit text length
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("ElevenLabs error:", response.status, errorText);
      return new Response(JSON.stringify({ error: `TTS failed: ${response.status}` }), { 
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Return audio as binary
    const audioBuffer = await response.arrayBuffer();
    
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache"
      }
    });

  } catch (err) {
    console.error("TTS Error:", err);
    return new Response(JSON.stringify({ error: "TTS generation failed: " + err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
