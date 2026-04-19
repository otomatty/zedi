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
import { eq, and, sql } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import { pages } from "../schema/pages.js";
import { pageContents } from "../schema/pageContents.js";
import { recordActivity } from "../services/activityLogService.js";
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

  // 同一ユーザーの並行 PUT を直列化するため、トランザクション内で advisory lock を
  // 取得する。`SELECT ... FOR UPDATE` は対象行が無い初回作成時には何もロックできず、
  // 2 つのトランザクションが両方 INSERT に進んで `idx_pages_unique_schema_per_owner`
  // で衝突 → 片方が 500 になる窓があった。advisory_xact_lock は (owner_id) 空間で
  // セマンティックに排他化するため、初回作成も後続更新もこの 1 つのロックで安全に
  // 直列化できる。ロックはトランザクション終了で自動解放。
  // pg_advisory_xact_lock serialises concurrent schema upserts per owner, closing
  // the create-time race that `FOR UPDATE` cannot cover (no row to lock yet).
  const pageId = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`wiki_schema:${userId}`}))`);

    const [existing] = await tx
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.ownerId, userId), eq(pages.isSchema, true), eq(pages.isDeleted, false)))
      .limit(1);

    let resolvedPageId: string;
    if (existing) {
      await tx.update(pages).set({ title, updatedAt: now }).where(eq(pages.id, existing.id));
      resolvedPageId = existing.id;
    } else {
      const [newPage] = await tx
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
      resolvedPageId = newPage.id;
    }

    await tx
      .insert(pageContents)
      .values({
        pageId: resolvedPageId,
        ydocState: Buffer.alloc(0),
        contentText: content,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pageContents.pageId,
        set: { contentText: content, updatedAt: now },
      });

    return resolvedPageId;
  });

  // recordActivity の失敗で 500 を返すと、スキーマは既にコミット済みなのに
  // クライアントには「失敗」と見えるパーシャル状態になる。activity ログは
  // ベストエフォートで処理し、失敗はログだけ残してレスポンスは 200 を維持する。
  // Activity logging is non-fatal: the schema commit already succeeded; surface
  // failures via console.error only so callers don't see a misleading 500.
  try {
    await recordActivity(db, {
      ownerId: userId,
      kind: "wiki_schema_update",
      actor: "user",
      targetPageIds: [pageId],
      detail: { title, contentLength: content.length },
    });
  } catch (err) {
    console.error("[wikiSchema] recordActivity failed (non-fatal):", err);
  }

  return c.json({ pageId, title, content });
});

export default app;
