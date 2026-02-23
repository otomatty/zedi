/**
 * レートリミッター — DynamoDB 固定ウィンドウカウンタ
 *
 * AI API / Thumbnail API など高コスト操作のレート制限に使用。
 * DynamoDB テーブルスキーマ:
 *   PK: pk (String) — "user:<userId>:<windowKey>"
 *   count (Number)  — リクエストカウント
 *   ttl (Number)    — DynamoDB TTL (Unix 秒)
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { getEnvConfig } from "../env";
import type { AppEnv } from "../types";

const client = new DynamoDBClient({});

const WINDOW_SECONDS = 3600; // 1 時間ウィンドウ
const MAX_REQUESTS = 120; // 120 リクエスト/時

function getWindowKey(): string {
  return String(Math.floor(Math.floor(Date.now() / 1000) / WINDOW_SECONDS));
}

/**
 * Hono ミドルウェアとして使用するレートリミッター
 * userId は auth ミドルウェアで先にセットされている前提
 */
export const rateLimiter = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  if (!userId) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  const env = getEnvConfig();
  if (!env.RATE_LIMIT_TABLE) {
    // テーブル未設定: fail-open
    await next();
    return;
  }

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
      }),
    );

    const count = Number(result.Attributes?.count?.N ?? 0);
    if (count > MAX_REQUESTS) {
      throw new HTTPException(429, { message: "RATE_LIMIT_EXCEEDED" });
    }
  } catch (err: unknown) {
    if (err instanceof HTTPException) throw err;
    // DynamoDB 障害時: fail-open
    console.error("Rate limit check failed:", err);
  }

  await next();
});
