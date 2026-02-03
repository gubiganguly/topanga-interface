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

    // Route action to appropriate gateway endpoint
    let endpoint;
    let gatewayBody;

    switch (action) {
      case "message.send":
        endpoint = "/v1/actions/message/send";
        gatewayBody = {
          to: params.to,
          message: params.message,
          channel: params.channel || "imessage"
        };
        break;

      case "command.run":
        endpoint = "/v1/actions/shell/run";
        gatewayBody = {
          command: params.command
        };
        break;

      case "search.web":
        endpoint = "/v1/actions/search/web";
        gatewayBody = {
          query: params.query
        };
        break;

      default:
        // Generic action passthrough
        endpoint = `/v1/actions/${action.replace(".", "/")}`;
        gatewayBody = params;
    }

    const response = await fetch(`${GATEWAY_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify(gatewayBody),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Gateway request failed",
          status: response.status
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      result: data
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
