/**
 * Rate limiter using DynamoDB with TTL.
 * Uses a simple fixed-window counter approach.
 *
 * DynamoDB table schema:
 *   PK: pk (String)  — e.g. "user:<userId>:<windowKey>"
 *   count (Number)    — request count
 *   ttl (Number)      — Unix epoch seconds for DynamoDB TTL
 */

import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { EnvConfig } from "../types/index.js";

const client = new DynamoDBClient({});

const WINDOW_SECONDS = 3600; // 1 hour window
const MAX_REQUESTS = 120;    // 120 requests per hour

function getWindowKey(): string {
  const now = Math.floor(Date.now() / 1000);
  return String(Math.floor(now / WINDOW_SECONDS));
}

export async function checkRateLimit(
  userId: string,
  env: EnvConfig
): Promise<void> {
  const windowKey = getWindowKey();
  const pk = `user:${userId}:${windowKey}`;
  const ttl = Math.floor(Date.now() / 1000) + WINDOW_SECONDS + 60; // extra 60s buffer

  try {
    const command = new UpdateItemCommand({
      TableName: env.RATE_LIMIT_TABLE,
      Key: {
        pk: { S: pk },
      },
      UpdateExpression: "SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl",
      ExpressionAttributeNames: {
        "#count": "count",
        "#ttl": "ttl",
      },
      ExpressionAttributeValues: {
        ":zero": { N: "0" },
        ":one": { N: "1" },
        ":ttl": { N: String(ttl) },
      },
      ReturnValues: "UPDATED_NEW",
    });

    const result = await client.send(command);
    const count = Number(result.Attributes?.count?.N ?? 0);

    if (count > MAX_REQUESTS) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "RATE_LIMIT_EXCEEDED") throw err;
    // If DynamoDB is down, allow the request (fail open)
    console.error("Rate limit check failed:", err);
  }
}
