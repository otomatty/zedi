/**
 * Rate limiter — same DynamoDB table as ai-api
 */

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import type { EnvConfig } from "../types/index.js";

const client = new DynamoDBClient({});
const WINDOW_SECONDS = 3600;
const MAX_REQUESTS = 120;

function getWindowKey(): string {
  return String(Math.floor(Math.floor(Date.now() / 1000) / WINDOW_SECONDS));
}

export async function checkRateLimit(userId: string, env: EnvConfig): Promise<void> {
  const windowKey = getWindowKey();
  const pk = `user:${userId}:${windowKey}`;
  const ttl = Math.floor(Date.now() / 1000) + WINDOW_SECONDS + 60;

  try {
    const result = await client.send(
      new UpdateItemCommand({
        TableName: env.RATE_LIMIT_TABLE,
        Key: { pk: { S: pk } },
        UpdateExpression: "SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl",
        ExpressionAttributeNames: { "#count": "count", "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":zero": { N: "0" },
          ":one": { N: "1" },
          ":ttl": { N: String(ttl) },
        },
        ReturnValues: "UPDATED_NEW",
      })
    );
    const count = Number(result.Attributes?.count?.N ?? 0);
    if (count > MAX_REQUESTS) throw new Error("RATE_LIMIT_EXCEEDED");
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "RATE_LIMIT_EXCEEDED") throw err;
    console.error("Rate limit check failed:", err);
  }
}
