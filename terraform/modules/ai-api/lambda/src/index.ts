/**
 * Zedi AI API - Lambda Handler
 *
 * Supports two event sources:
 * 1. HTTP API Gateway   → GET /api/ai/models, GET /api/ai/usage, POST /api/ai/chat
 * 2. WebSocket API Gateway → streaming chat via $connect / chat / $disconnect
 *
 * The handler auto-detects the event type based on requestContext.connectionId.
 */

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { verifyToken, verifyTokenString } from "./middleware/auth.js";
import { checkRateLimit } from "./middleware/rateLimiter.js";
import { handleChat, handleChatStreaming } from "./routes/chat.js";
import { handleGetModels } from "./routes/models.js";
import { handleGetSubscription } from "./routes/subscription.js";
import { handleGetUsage } from "./routes/usage.js";
import { getEnvConfig } from "./lib/env.js";
import { writeSSE } from "./utils/sse.js";
import type { EnvConfig, SSEPayload } from "./types/index.js";

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function getCorsHeaders(env: EnvConfig): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function jsonResponse(
  body: unknown,
  statusCode: number,
  env: EnvConfig
): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    statusCode,
    headers: { ...getCorsHeaders(env), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Non-streaming handler (HTTP API Gateway + WebSocket API Gateway)
// ---------------------------------------------------------------------------

export async function handler(event: APIGatewayProxyEventV2) {
  // WebSocket API Gateway events have connectionId in requestContext
  if ("connectionId" in event.requestContext) {
    return handleWebSocketEvent(event as unknown as WebSocketEvent);
  }

  // HTTP API Gateway event
  return handleHttpEvent(event);
}

// ---------------------------------------------------------------------------
// HTTP API Gateway handler
// ---------------------------------------------------------------------------

async function handleHttpEvent(event: APIGatewayProxyEventV2) {
  const env = getEnvConfig();
  const method = event.requestContext?.http?.method ?? "GET";
  const rawPath = event.rawPath ?? "/";
  const path = rawPath.replace(/^\/api\/ai\/?/, "").replace(/\/$/, "") || "";

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: getCorsHeaders(env), body: "" };
  }

  try {
    // ----- GET /api/ai/models (no auth required for model list) -----
    if (method === "GET" && path === "models") {
      // Optional auth — provides tier-filtered results if authenticated
      let userId: string | undefined;
      try {
        userId = await verifyToken(event, env);
      } catch {
        // Anonymous access returns free-tier models only
      }
      const result = await handleGetModels(userId, env);
      return jsonResponse(result, 200, env);
    }

    // ----- Auth required for all other endpoints -----
    const userId = await verifyToken(event, env);

    // ----- Rate limit -----
    await checkRateLimit(userId, env);

    // ----- GET /api/ai/usage -----
    if (method === "GET" && path === "usage") {
      const result = await handleGetUsage(userId, env);
      return jsonResponse(result, 200, env);
    }

    // ----- GET /api/ai/subscription -----
    if (method === "GET" && path === "subscription") {
      const result = await handleGetSubscription(userId, env);
      return jsonResponse(result, 200, env);
    }

    // ----- POST /api/ai/chat (non-streaming) -----
    if (method === "POST" && path === "chat") {
      const body = event.body ? JSON.parse(event.body) : null;
      if (!body) {
        return jsonResponse({ error: "Invalid JSON body" }, 400, env);
      }

      // If stream requested, this code path won't be used —
      // the streaming handler is separate. But as fallback:
      if (body.options?.stream) {
        // Streaming is handled by the streamHandler export.
        // If we somehow end up here, fall back to non-streaming.
        body.options.stream = false;
      }

      const result = await handleChat(userId, body, env);
      return jsonResponse(result, 200, env);
    }

    return jsonResponse({ error: "Not found" }, 404, env);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const statusCode =
      message === "UNAUTHORIZED" || message === "AUTH_REQUIRED"
        ? 401
        : message === "RATE_LIMIT_EXCEEDED"
          ? 429
          : message === "USAGE_LIMIT_EXCEEDED"
            ? 402
            : message === "MODEL_ACCESS_DENIED"
              ? 403
              : 500;
    console.error(`[handleHttpEvent] ${method} ${rawPath} → ${statusCode}`, err);
    return jsonResponse({ error: message }, statusCode, env);
  }
}

// ---------------------------------------------------------------------------
// Streaming handler — Lambda Function URL RESPONSE_STREAM mode (deprecated)
// Kept for backward compatibility; new deployments use WebSocket API Gateway.
// ---------------------------------------------------------------------------

declare const awslambda: {
  streamifyResponse: (
    handler: (
      event: APIGatewayProxyEventV2,
      responseStream: NodeJS.WritableStream,
      context: unknown
    ) => Promise<void>
  ) => unknown;
  HttpResponseStream: {
    from: (
      stream: NodeJS.WritableStream,
      metadata: { statusCode: number; headers: Record<string, string> }
    ) => NodeJS.WritableStream;
  };
};

export const streamHandler = awslambda.streamifyResponse(
  async (
    event: APIGatewayProxyEventV2,
    responseStream: NodeJS.WritableStream
  ) => {
    const env = getEnvConfig();
    const method = event.requestContext?.http?.method ?? "GET";
    const rawPath = event.rawPath ?? "/";
    const path = rawPath.replace(/^\/api\/ai\/?/, "").replace(/\/$/, "") || "";

    const corsHeaders = getCorsHeaders(env);

    // CORS preflight
    if (method === "OPTIONS") {
      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 204,
        headers: corsHeaders,
      });
      stream.end();
      return;
    }

    // Only POST /api/ai/chat supports streaming
    if (method !== "POST" || path !== "chat") {
      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      stream.write(JSON.stringify({ error: "Not found" }));
      stream.end();
      return;
    }

    try {
      const userId = await verifyToken(event, env);
      await checkRateLimit(userId, env);

      const body = event.body ? JSON.parse(event.body) : null;
      if (!body) {
        const stream = awslambda.HttpResponseStream.from(responseStream, {
          statusCode: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        stream.write(JSON.stringify({ error: "Invalid JSON body" }));
        stream.end();
        return;
      }

      // Set up SSE stream
      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });

      const sendFn = (payload: SSEPayload) => writeSSE(stream, payload);
      await handleChatStreaming(userId, body, env, sendFn, () => stream.end());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal server error";
      const statusCode =
        message === "UNAUTHORIZED" || message === "AUTH_REQUIRED"
          ? 401
          : message === "RATE_LIMIT_EXCEEDED"
            ? 429
            : message === "USAGE_LIMIT_EXCEEDED"
              ? 402
              : message === "MODEL_ACCESS_DENIED"
                ? 403
                : 500;

      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      stream.write(JSON.stringify({ error: message }));
      stream.end();
    }
  }
);

// ---------------------------------------------------------------------------
// WebSocket API Gateway types & handler
// ---------------------------------------------------------------------------

interface WebSocketEvent {
  requestContext: {
    routeKey: string;
    connectionId: string;
    domainName: string;
    stage: string;
    eventType: "CONNECT" | "MESSAGE" | "DISCONNECT";
  };
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

async function handleWebSocketEvent(
  event: WebSocketEvent
): Promise<{ statusCode: number; body: string }> {
  const env = getEnvConfig();
  const { routeKey, connectionId, domainName, stage } = event.requestContext;

  switch (routeKey) {
    // ----- $connect: Authenticate JWT from query string -----
    case "$connect": {
      const token = event.queryStringParameters?.token;
      if (!token) {
        return { statusCode: 401, body: "Missing token" };
      }
      try {
        await verifyTokenString(token, env);
        return { statusCode: 200, body: "Connected" };
      } catch {
        return { statusCode: 401, body: "Unauthorized" };
      }
    }

    // ----- $disconnect: No-op -----
    case "$disconnect":
      return { statusCode: 200, body: "Disconnected" };

    // ----- chat: Process streaming chat request -----
    case "chat": {
      const endpoint = `https://${domainName}/${stage}`;
      const apiGw = new ApiGatewayManagementApiClient({ endpoint });

      try {
        const body = JSON.parse(event.body || "{}");

        // Verify JWT from message body (userId needed for chat processing)
        const token = body.token;
        if (!token) {
          await sendToConnection(apiGw, connectionId, {
            error: "Missing auth token",
            done: true,
          });
          return { statusCode: 200, body: "" };
        }

        const userId = await verifyTokenString(token, env);
        await checkRateLimit(userId, env);

        // Build sendFn that posts each payload as a WebSocket message
        const sendFn = async (payload: SSEPayload) => {
          await sendToConnection(apiGw, connectionId, payload);
        };

        // Process chat streaming (payloads sent via WebSocket messages)
        await handleChatStreaming(userId, body, env, sendFn);

        return { statusCode: 200, body: "" };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Internal server error";
        try {
          await sendToConnection(apiGw, connectionId, {
            error: message,
            done: true,
          });
        } catch {
          // Connection may already be closed
        }
        return { statusCode: 200, body: "" };
      }
    }

    default:
      return { statusCode: 400, body: "Unknown route" };
  }
}

/**
 * Send a JSON payload to a WebSocket connection.
 */
async function sendToConnection(
  apiGw: ApiGatewayManagementApiClient,
  connectionId: string,
  payload: SSEPayload
): Promise<void> {
  await apiGw.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: new TextEncoder().encode(JSON.stringify(payload)),
    })
  );
}
