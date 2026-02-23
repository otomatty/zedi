/**
 * /api/users — ユーザー CRUD
 *
 * POST /api/users/upsert  — Cognito ユーザー Upsert
 * GET  /api/users/:id      — ユーザー取得
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { users } from "../schema";
import { authRequired } from "../middleware/auth";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

// ── POST /users/upsert ─────────────────────────────────────────────────────
// NOTE: authRequired は使わない。初回サインイン時は DB にユーザーが
// 存在しないため authRequired が 401 を返してしまう（鶏と卵の問題）。
// JWT は API Gateway Authorizer で検証済みなので sub を直接読み取る。
app.post("/upsert", async (c) => {
  const event = c.env?.event;
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  const rawSub = claims?.sub;
  const jwtSub = typeof rawSub === "string" ? rawSub : undefined;
  const rawEmail = claims?.email;
  const jwtEmail = typeof rawEmail === "string" ? rawEmail : undefined;

  if (!jwtSub) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  const body = await c.req.json<{
    cognito_sub?: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
  }>();

  const cognitoSub = body.cognito_sub || jwtSub;
  const email = body.email || jwtEmail;

  if (!cognitoSub || !email) {
    throw new HTTPException(400, { message: "cognito_sub and email are required" });
  }

  const db = c.get("db");

  // 同じメールで別の cognito_sub の行が既にある場合（Google/GitHub 別アカウント同一メール）、
  // email のユニーク制約で失敗するため、先に既存行を確認して UPDATE or INSERT する。
  const existing = await db.select().from(users).where(eq(users.cognitoSub, cognitoSub)).limit(1);

  let result;
  if (existing.length > 0) {
    const existingRow = existing[0];
    result = await db
      .update(users)
      .set({
        email,
        displayName: body.display_name || (existingRow?.displayName ?? null),
        avatarUrl: body.avatar_url || (existingRow?.avatarUrl ?? null),
        updatedAt: new Date(),
      })
      .where(eq(users.cognitoSub, cognitoSub))
      .returning();
  } else {
    // 新規ユーザー: 同一メールの行が既にあればそちらの cognito_sub を更新
    const existingByEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existingByEmail.length > 0) {
      const existingRow = existingByEmail[0];
      result = await db
        .update(users)
        .set({
          cognitoSub,
          displayName: body.display_name || (existingRow?.displayName ?? null),
          avatarUrl: body.avatar_url || (existingRow?.avatarUrl ?? null),
          updatedAt: new Date(),
        })
        .where(eq(users.email, email))
        .returning();
    } else {
      // 完全新規 → INSERT
      result = await db
        .insert(users)
        .values({
          cognitoSub,
          email,
          displayName: body.display_name || null,
          avatarUrl: body.avatar_url || null,
        })
        .returning();
    }
  }

  return c.json({ user: result[0] }, 200);
});

// ── GET /users/:id ──────────────────────────────────────────────────────────
app.get("/:id", authRequired, async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!result.length) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json({ user: result[0] });
});

export default app;
