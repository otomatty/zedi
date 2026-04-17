/**
 * /api/wiki-schema — Wiki schema ("constitution") page CRUD.
 *
 * Each user has at most one schema page (`pages.is_schema = true`).
 * The schema content is stored as plain text in `page_contents.content_text`
 * so it can be injected into LLM prompts without Y.Doc deserialization.
 *
 * Wiki スキーマ（「憲法」）ページの取得・作成・更新。
 * ユーザーごとに最大 1 ページ（`pages.is_schema = true`）。
 * プロンプト注入用にプレーンテキストを `page_contents.content_text` に保存する。
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import { pages } from "../schema/pages.js";
import { pageContents } from "../schema/pageContents.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

/**
 * GET /api/wiki-schema — Fetch the current user's schema page text.
 * 現ユーザーのスキーマページテキストを取得する。
 *
 * @returns 200 `{ pageId, title, content }` or 404 if none exists.
 */
app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const [row] = await db
    .select({
      id: pages.id,
      title: pages.title,
      contentText: pageContents.contentText,
    })
    .from(pages)
    .leftJoin(pageContents, eq(pageContents.pageId, pages.id))
    .where(and(eq(pages.ownerId, userId), eq(pages.isSchema, true), eq(pages.isDeleted, false)))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "No wiki schema page found" });
  }

  return c.json({
    pageId: row.id,
    title: row.title ?? "",
    content: row.contentText ?? "",
  });
});

/**
 * Request body for PUT /api/wiki-schema.
 * PUT リクエストボディ。
 */
interface WikiSchemaUpsertBody {
  title?: string;
  content: string;
}

/**
 * PUT /api/wiki-schema — Create or update the user's schema page (upsert).
 * スキーマページの作成または更新（upsert）。
 *
 * @returns 200 `{ pageId, title, content }`.
 */
app.put("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  let body: WikiSchemaUpsertBody;
  try {
    body = await c.req.json<WikiSchemaUpsertBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  if (typeof body.content !== "string") {
    throw new HTTPException(400, { message: "content is required" });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "Wiki Schema";
  const content = body.content;
  const now = new Date();

  // Check for existing schema page
  const [existing] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.ownerId, userId), eq(pages.isSchema, true), eq(pages.isDeleted, false)))
    .limit(1);

  let pageId: string;

  if (existing) {
    pageId = existing.id;
    await db.update(pages).set({ title, updatedAt: now }).where(eq(pages.id, pageId));
  } else {
    const [newPage] = await db
      .insert(pages)
      .values({
        ownerId: userId,
        title,
        isSchema: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: pages.id });

    if (!newPage) {
      throw new HTTPException(500, { message: "Failed to create schema page" });
    }
    pageId = newPage.id;
  }

  // Upsert page_contents in a single round-trip.
  // page_contents を 1 回の往復で upsert する。
  await db
    .insert(pageContents)
    .values({
      pageId,
      ydocState: Buffer.alloc(0),
      contentText: content,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pageContents.pageId,
      set: { contentText: content, updatedAt: now },
    });

  return c.json({ pageId, title, content });
});

export default app;
