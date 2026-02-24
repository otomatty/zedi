/**
 * Auth ミドルウェア — API Gateway JWT Authorizer
 *
 * API GW の JWT Authorizer が事前に検証したトークンの claims を読み取り、
 * cognitoSub → users.id を Drizzle ORM で解決して Context にセットする。
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { users } from "../schema";
import type { AppEnv } from "../types";

/**
 * 認証必須ミドルウェア
 * API GW JWT Authorizer の claims.sub を読み取り users.id を解決する。
 */
export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  const event = c.env?.event;
  const rawSub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
  const sub = typeof rawSub === "string" ? rawSub : undefined;

  if (!sub) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  const db = c.get("db");
  const result = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.cognitoSub, sub))
    .limit(1);

  const user = result[0];
  if (!user) throw new HTTPException(401, { message: "User not found" });

  c.set("cognitoSub", sub);
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
});

/**
 * 認証オプショナルミドルウェア
 * トークンがあればユーザー情報を設定するが、なくてもリクエストを通す。
 */
export const authOptional = createMiddleware<AppEnv>(async (c, next) => {
  const event = c.env?.event;
  const rawSub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
  const sub = typeof rawSub === "string" ? rawSub : undefined;

  if (sub) {
    const db = c.get("db");
    const result = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.cognitoSub, sub))
      .limit(1);

    const user = result[0];
    if (user) {
      c.set("cognitoSub", sub);
      c.set("userId", user.id);
      c.set("userEmail", user.email);
    }
  }

  await next();
});
