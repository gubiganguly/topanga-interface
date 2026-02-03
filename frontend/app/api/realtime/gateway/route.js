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

    // Map Realtime tool actions to OpenClaw tools
    let tool;
    let args;

    switch (action) {
      case "message.send":
        tool = "message";
        args = {
          action: "send",
          to: params.to,
          message: params.message,
          channel: params.channel || "imessage"
        };
        break;

      case "command.run":
        tool = "exec";
        args = {
          command: params.command
        };
        break;

      case "search.web":
        tool = "web_search";
        args = {
          query: params.query
        };
        break;

      case "file.write":
        tool = "write";
        args = {
          path: params.path,
          content: params.content
        };
        break;

      case "file.read":
        tool = "read";
        args = {
          path: params.path
        };
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    // Call OpenClaw Gateway /tools/invoke endpoint
    const response = await fetch(`${GATEWAY_URL}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        tool,
        args,
        sessionKey: "main"
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

    return NextResponse.json({
      success: true,
      result: data.result || data
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
