/**
 * /api/pages — ページ CRUD + コンテンツ管理
 *
 * GET    /api/pages/:id/content — Y.Doc コンテンツ取得
 * PUT    /api/pages/:id/content — Y.Doc コンテンツ更新 (楽観的ロック)
 * POST   /api/pages             — 新規ページ作成
 * DELETE /api/pages/:id         — ページ論理削除
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq, and, sql } from 'drizzle-orm';
import { pages, pageContents } from '../schema';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

// ── GET /pages/:id/content ──────────────────────────────────────────────────
app.get('/:id/content', authRequired, async (c) => {
  const pageId = c.req.param('id');
  const userId = c.get('userId');
  const db = c.get('db');

  // ページ所有者確認
  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  if (!page.length) {
    throw new HTTPException(404, { message: 'Page not found' });
  }
  if (page[0]!.ownerId !== userId) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  // コンテンツ取得
  const content = await db
    .select()
    .from(pageContents)
    .where(eq(pageContents.pageId, pageId))
    .limit(1);

  if (!content.length) {
    return c.json({ content: null, version: 0 });
  }

  // ydoc_state を base64 で返す
  const row = content[0]!;
  const ydocBase64 =
    row.ydocState instanceof Buffer
      ? row.ydocState.toString('base64')
      : typeof row.ydocState === 'string'
        ? row.ydocState
        : Buffer.from(row.ydocState as unknown as ArrayBufferLike).toString('base64');

  return c.json({
    content: ydocBase64,
    version: row.version,
    content_text: row.contentText,
    updated_at: row.updatedAt?.toISOString(),
  });
});

// ── PUT /pages/:id/content ──────────────────────────────────────────────────
app.put('/:id/content', authRequired, async (c) => {
  const pageId = c.req.param('id');
  const userId = c.get('userId');
  const db = c.get('db');

  const body = await c.req.json<{
    content: string; // base64-encoded Y.Doc
    expected_version?: number;
    content_text?: string;
    title?: string;
  }>();

  if (!body.content) {
    throw new HTTPException(400, { message: 'content is required' });
  }

  // ページ所有者確認
  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  if (!page.length) {
    throw new HTTPException(404, { message: 'Page not found' });
  }
  if (page[0]!.ownerId !== userId) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  const ydocBuffer = Buffer.from(body.content, 'base64');

  // UPSERT page_contents with optimistic locking
  if (body.expected_version != null) {
    // 楽観的ロック: expected_version と一致する場合のみ更新
    const updated = await db
      .update(pageContents)
      .set({
        ydocState: ydocBuffer,
        version: sql`${pageContents.version} + 1`,
        contentText: body.content_text ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pageContents.pageId, pageId),
          eq(pageContents.version, body.expected_version),
        ),
      )
      .returning();

    if (!updated.length) {
      // バージョン不一致: 現在のバージョンを返す
      const current = await db
        .select({ version: pageContents.version })
        .from(pageContents)
        .where(eq(pageContents.pageId, pageId))
        .limit(1);

      throw new HTTPException(409, {
        message: `Version conflict. Current version: ${current[0]?.version ?? 0}`,
      });
    }

    // ページタイトルを更新
    if (body.title !== undefined) {
      await db
        .update(pages)
        .set({ title: body.title, updatedAt: new Date() })
        .where(eq(pages.id, pageId));
    }

    return c.json({ version: updated[0]!.version });
  }

  // No optimistic locking: UPSERT
  const result = await db
    .insert(pageContents)
    .values({
      pageId,
      ydocState: ydocBuffer,
      version: 1,
      contentText: body.content_text ?? null,
    })
    .onConflictDoUpdate({
      target: pageContents.pageId,
      set: {
        ydocState: ydocBuffer,
        version: sql`${pageContents.version} + 1`,
        contentText: body.content_text ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (body.title !== undefined) {
    await db
      .update(pages)
      .set({ title: body.title, updatedAt: new Date() })
      .where(eq(pages.id, pageId));
  }

  return c.json({ version: result[0]!.version });
});

// ── POST /pages ─────────────────────────────────────────────────────────────
app.post('/', authRequired, async (c) => {
  const userId = c.get('userId');
  const db = c.get('db');

  const body = await c.req.json<{
    title?: string;
    source_page_id?: string;
    source_url?: string;
  }>();

  const result = await db
    .insert(pages)
    .values({
      ownerId: userId,
      title: body.title ?? null,
      sourcePageId: body.source_page_id ?? null,
      sourceUrl: body.source_url ?? null,
    })
    .returning();

  const row = result[0]!;
  return c.json({
    id: row.id,
    owner_id: row.ownerId,
    source_page_id: row.sourcePageId ?? null,
    title: row.title ?? null,
    content_preview: row.contentPreview ?? null,
    thumbnail_url: row.thumbnailUrl ?? null,
    source_url: row.sourceUrl ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    is_deleted: row.isDeleted,
  }, 201);
});

// ── DELETE /pages/:id ───────────────────────────────────────────────────────
app.delete('/:id', authRequired, async (c) => {
  const pageId = c.req.param('id');
  const userId = c.get('userId');
  const db = c.get('db');

  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  if (!page.length) {
    throw new HTTPException(404, { message: 'Page not found' });
  }
  if (page[0]!.ownerId !== userId) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  await db
    .update(pages)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(pages.id, pageId));

  return c.json({ id: pageId, deleted: true });
});

export default app;
