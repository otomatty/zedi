/**
 * Zedi Thumbnail API — Lambda Handler
 * GET /api/thumbnail/image-search, POST /api/thumbnail/image-generate, POST /api/thumbnail/commit
 */

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { verifyToken } from "./middleware/auth.js";
import { checkRateLimit } from "./middleware/rateLimiter.js";
import { getEnvConfig } from "./lib/env.js";
import { handleImageSearch } from "./routes/imageSearch.js";
import { handleImageGenerate } from "./routes/imageGenerate.js";
import { handleCommit } from "./routes/commit.js";

function corsHeaders(env: { CORS_ORIGIN: string }): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function errorResponse(
  statusCode: number,
  message: string,
  env: { CORS_ORIGIN: string }
) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(env),
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ error: message }),
  };
}

export async function handler(event: APIGatewayProxyEventV2) {
  const env = getEnvConfig();
  const method = event.requestContext?.http?.method ?? "GET";
  const rawPath = event.rawPath ?? "/";

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(env), body: "" };
  }

  const path = rawPath.replace(/^\/api\/thumbnail\/?/, "").replace(/\/$/, "") || "";

  try {
    const userId = await verifyToken(event, env);
    await checkRateLimit(userId, env);

    if (method === "GET" && path === "image-search") {
      return await handleImageSearch(event, env);
    }
    if (method === "POST" && path === "image-generate") {
      return await handleImageGenerate(event, env);
    }
    if (method === "POST" && path === "commit") {
      (event as unknown as { _userId: string })._userId = userId;
      return await handleCommit(event, env);
    }

    return errorResponse(404, "Not found", env);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const statusCode =
      message === "UNAUTHORIZED" ? 401
      : message === "RATE_LIMIT_EXCEEDED" ? 429
      : message === "STORAGE_QUOTA_EXCEEDED" ? 403
      : 500;
    console.error(`[thumbnail-api] ${method} ${rawPath} → ${statusCode}`, err);
    return errorResponse(statusCode, message, env);
  }
}
