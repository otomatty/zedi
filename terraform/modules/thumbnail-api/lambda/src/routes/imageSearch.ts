/**
 * GET /api/thumbnail/image-search
 */

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getThumbnailSecrets, getRequired } from "../lib/secrets.js";
import { searchImages } from "../services/search.js";
import type { EnvConfig } from "../types/index.js";
import type { ImageSearchResponse } from "../types/index.js";

export async function handleImageSearch(
  event: APIGatewayProxyEventV2,
  env: EnvConfig
): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
  const query = event.queryStringParameters?.query?.trim() || "";
  const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit || 10), 1), 30);
  const cursor = Math.max(Number(event.queryStringParameters?.cursor || 1), 1);

  if (!query) {
    return jsonResponse(200, { items: [], nextCursor: undefined }, env);
  }

  const secrets = await getThumbnailSecrets(env.THUMBNAIL_SECRETS_ARN);
  const apiKey = getRequired(secrets, "GOOGLE_CUSTOM_SEARCH_API_KEY");
  const engineId = getRequired(secrets, "GOOGLE_CUSTOM_SEARCH_ENGINE_ID");

  const items = await searchImages(query, apiKey, engineId, cursor, limit);

  const seen = new Set<string>();
  const unique: typeof items = [];
  for (const item of items) {
    if (seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  const nextCursor =
    unique.length === 0 || cursor * limit >= 100 ? undefined : String(cursor + 1);
  const response: ImageSearchResponse = { items: unique, nextCursor };

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
