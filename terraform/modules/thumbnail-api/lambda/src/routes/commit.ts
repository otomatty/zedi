/**
 * POST /api/thumbnail/commit
 */

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { commitImage } from "../services/commitService.js";
import type { EnvConfig } from "../types/index.js";

export async function handleCommit(
  event: APIGatewayProxyEventV2,
  env: EnvConfig
): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
  let body: { sourceUrl?: string; title?: string; fallbackUrl?: string } | null = null;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    body = null;
  }

  if (!body?.sourceUrl?.trim()) {
    return jsonResponse(400, { error: "sourceUrl is required" }, env);
  }

  const userId = (event as unknown as { _userId?: string })._userId;
  if (!userId) {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, env);
  }

  const { imageUrl } = await commitImage(
    userId,
    body.sourceUrl.trim(),
    body.fallbackUrl?.trim(),
    env
  );

  return jsonResponse(200, { imageUrl, provider: "s3" as const }, env);
}

function jsonResponse(
  statusCode: number,
  body: unknown,
  env: EnvConfig
): { statusCode: number; body: string; headers: Record<string, string> } {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  };
}

export { jsonResponse };
