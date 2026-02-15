/**
 * POST /api/thumbnail/image-generate
 */

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getAISecrets, getRequired } from "../lib/secrets.js";
import { generateImageWithGemini } from "../services/gemini.js";
import type { EnvConfig } from "../types/index.js";
import type { ImageGenerateResponse } from "../types/index.js";

export async function handleImageGenerate(
  event: APIGatewayProxyEventV2,
  env: EnvConfig
): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
  let body: { prompt?: string; aspectRatio?: string } | null = null;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    body = null;
  }

  if (!body?.prompt?.trim()) {
    return jsonResponse(400, { error: "prompt is required" }, env);
  }

  const secrets = await getAISecrets(env.AI_SECRETS_ARN);
  const apiKey = getRequired(secrets, "GOOGLE_AI_API_KEY");

  const result = await generateImageWithGemini(body.prompt.trim(), apiKey, {
    aspectRatio: body.aspectRatio || "16:9",
  });

  const response: ImageGenerateResponse = {
    imageUrl: result.imageUrl,
    mimeType: result.mimeType,
  };

  return jsonResponse(200, response, env);
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
