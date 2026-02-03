import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    // Create ephemeral token for WebRTC realtime session
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        modalities: ["text", "audio"],
        voice: "coral",
        instructions: `You are Topanga, a helpful AI assistant that can send messages, run commands, and search the web.
You have access to tools to interact with the user's computer and messaging apps.
Be conversational and helpful. When using tools, confirm actions with the user before executing when appropriate.
Keep responses concise since this is a voice interface.`,
        tools: [
          {
            type: "function",
            name: "send_message",
            description: "Send a message to someone via iMessage, Signal, Telegram, or other messaging apps",
            parameters: {
              type: "object",
              properties: {
                to: {
                  type: "string",
                  description: "Phone number, email, or contact name of the recipient"
                },
                message: {
                  type: "string",
                  description: "The message content to send"
                },
                channel: {
                  type: "string",
                  description: "Messaging channel: imessage, signal, telegram, whatsapp. Defaults to imessage if not specified."
                }
              },
              required: ["to", "message"]
            }
          },
          {
            type: "function",
            name: "run_command",
            description: "Execute a shell command on the user's computer",
            parameters: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "The shell command to execute"
                }
              },
              required: ["command"]
            }
          },
          {
            type: "function",
            name: "search_web",
            description: "Search the web for information",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query"
                }
              },
              required: ["query"]
            }
          },
          {
            type: "function",
            name: "write_file",
            description: "Write content to a file on the user's computer. Creates the file if it doesn't exist, overwrites if it does.",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the file to write (relative or absolute)"
                },
                content: {
                  type: "string",
                  description: "Content to write to the file"
                }
              },
              required: ["path", "content"]
            }
          },
          {
            type: "function",
            name: "read_file",
            description: "Read the contents of a file on the user's computer",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the file to read (relative or absolute)"
                }
              },
              required: ["path"]
            }
          }
        ],
        input_audio_transcription: {
          model: "whisper-1"
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      return NextResponse.json(
        { error: "Failed to create session", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return the ephemeral client secret
    return NextResponse.json({
      value: data.client_secret?.value || data.client_secret,
      expires_at: data.expires_at
    });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
