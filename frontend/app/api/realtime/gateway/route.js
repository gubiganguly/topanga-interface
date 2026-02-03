import { NextResponse } from "next/server";

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_LOCAL_URL || "http://127.0.0.1:18789";
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing action parameter" },
        { status: 400 }
      );
    }

    // Build a message for Topanga to execute
    let message;

    switch (action) {
      case "message.send":
        message = `Send a message to ${params.to}: "${params.message}"${params.channel ? ` via ${params.channel}` : ""}`;
        break;

      case "command.run":
        message = `Run this shell command and tell me the result: ${params.command}`;
        break;

      case "search.web":
        message = `Search the web for: ${params.query}`;
        break;

      case "file.write":
        message = `Write this content to the file ${params.path}:\n\n${params.content}`;
        break;

      case "file.read":
        message = `Read and show me the contents of the file: ${params.path}`;
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    // Send to Topanga via chat completions
    const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku",
        messages: [
          {
            role: "system",
            content: "You are executing a command from the Realtime voice interface. Execute the request and provide a brief response. Be concise."
          },
          {
            role: "user", 
            content: message
          }
        ],
        stream: false
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Gateway error:", response.status, data);
      return NextResponse.json(
        {
          success: false,
          error: data.error?.message || data.error || "Gateway request failed",
          status: response.status
        },
        { status: response.status }
      );
    }

    // Extract the assistant's response
    const assistantMessage = data.choices?.[0]?.message?.content || "Request completed";

    return NextResponse.json({
      success: true,
      result: assistantMessage
    });
  } catch (error) {
    console.error("Gateway proxy error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to connect to gateway",
        details: error.message
      },
      { status: 500 }
    );
  }
}
