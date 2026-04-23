/**
 * /api/pages/:id/snapshots — ページバージョン履歴 API
 * Page version history (snapshots) API
 *
 * GET    /:id/snapshots                     — スナップショット一覧 / List snapshots
 * GET    /:id/snapshots/:snapshotId         — スナップショット詳細 / Get snapshot detail
 * POST   /:id/snapshots/:snapshotId/restore — 復元（新バージョンとして）/ Restore as new version
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { pages, pageContents, pageSnapshots, users } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";
import { assertPageViewAccess, assertPageEditAccess } from "../services/pageAccessService.js";
import { pruneSnapshotsExceedingLimitSql } from "../services/snapshotService.js";

const app = new Hono<AppEnv>();
const DEFAULT_HOCUSPOCUS_INTERNAL_URL = "http://127.0.0.1:1234";
/** Best-effort invalidation HTTP timeout (ms). / ベストエフォート無効化の HTTP タイムアウト（ミリ秒） */
const HOCUSPOCUS_INVALIDATE_TIMEOUT_MS = 2500;

function getHocuspocusInternalUrl(): string | null {
  const explicitUrl = process.env.HOCUSPOCUS_INTERNAL_URL?.trim();
  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, "");
  }
  return process.env.NODE_ENV === "development" ? DEFAULT_HOCUSPOCUS_INTERNAL_URL : null;
}

/**
 * Hocuspocus に復元後のライブドキュメント無効化を依頼する（ベストエフォート）。
 * タイムアウト・HTTP エラーはログのみで呼び出し元には伝えない。
 *
 * Best-effort: asks Hocuspocus to drop live Y.Doc after restore. Timeouts and HTTP
 * errors are logged only and never thrown to the caller.
 */
async function invalidateHocuspocusDocument(pageId: string): Promise<void> {
  const baseUrl = getHocuspocusInternalUrl();
  const internalSecret = process.env.BETTER_AUTH_SECRET?.trim();

  if (!baseUrl || !internalSecret) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[Snapshots] Skipped Hocuspocus invalidation for page ${pageId}: internal URL or secret is missing.`,
      );
    }
    return;
  }

  const url = `${baseUrl}/internal/documents/${encodeURIComponent(pageId)}/invalidate`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOCUSPOCUS_INVALIDATE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-internal-secret": internalSecret,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(
        `[Snapshots] Hocuspocus invalidation HTTP ${response.status} for page ${pageId}`,
      );
    }
  } catch (error) {
    clearTimeout(timeoutId);
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") {
      console.warn(`[Snapshots] Hocuspocus invalidation timed out for page ${pageId}`);
      return;
    }
    console.warn(`[Snapshots] Hocuspocus invalidation failed for page ${pageId}:`, error);
  }
}

// ── GET /:id/snapshots ──────────────────────────────────────────────────────
app.get("/:id/snapshots", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  await assertPageViewAccess(db, pageId, userId);

  const rows = await db
    .select({
      id: pageSnapshots.id,
      version: pageSnapshots.version,
      contentText: pageSnapshots.contentText,
      createdBy: pageSnapshots.createdBy,
      trigger: pageSnapshots.trigger,
      createdAt: pageSnapshots.createdAt,
    })
    .from(pageSnapshots)
    .where(eq(pageSnapshots.pageId, pageId))
    .orderBy(desc(pageSnapshots.createdAt));

  // created_by → email をまとめて解決
  const userIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as string[];
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const u of userRows) {
      emailMap.set(u.id, u.email);
    }
  }

  return c.json({
    snapshots: rows.map((r) => ({
      id: r.id,
      version: r.version,
      content_text: r.contentText,
      created_by: r.createdBy,
      created_by_email: r.createdBy ? (emailMap.get(r.createdBy) ?? null) : null,
      trigger: r.trigger,
      created_at: r.createdAt.toISOString(),
    })),
  });
});

// ── GET /:id/snapshots/:snapshotId ──────────────────────────────────────────
app.get("/:id/snapshots/:snapshotId", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const snapshotId = c.req.param("snapshotId");
  const userId = c.get("userId");
  const db = c.get("db");

  await assertPageViewAccess(db, pageId, userId);

  const rows = await db
    .select()
    .from(pageSnapshots)
    .where(and(eq(pageSnapshots.id, snapshotId), eq(pageSnapshots.pageId, pageId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new HTTPException(404, { message: "Snapshot not found" });

  // created_by の email を取得
  let createdByEmail: string | null = null;
  if (row.createdBy) {
    const userRow = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, row.createdBy))
      .limit(1);
    createdByEmail = userRow[0]?.email ?? null;
  }

  const ydocBase64 =
    row.ydocState instanceof Buffer
      ? row.ydocState.toString("base64")
      : Buffer.from(row.ydocState as unknown as ArrayBufferLike).toString("base64");

  return c.json({
    id: row.id,
    version: row.version,
    ydoc_state: ydocBase64,
    content_text: row.contentText,
    created_by: row.createdBy,
    created_by_email: createdByEmail,
    trigger: row.trigger,
    created_at: row.createdAt.toISOString(),
  });
});

/**
 * POST /:id/snapshots/:snapshotId/restore
 *
 * スナップショットを復元する。編集権限を持つユーザーのみが実行可能で、判定は
 * 他のページ書き込み系エンドポイント（`PUT /api/pages/:id/content` など）と
 * 同じく `assertPageEditAccess` に委譲する。
 *
 * - 個人ページ（`pages.note_id IS NULL`）: `pages.ownerId` 一致のみ
 * - ノートネイティブページ（`pages.note_id IS NOT NULL`）: ノートロール +
 *   `editPermission` の `canEdit` 評価（issue #713）。これにより、ノートを抜けた
 *   元作成者が restore を継続できてしまう問題と、ノートオーナーが他メンバー作成
 *   ページを restore できない問題の両方が解消される。
 *
 * Restore a snapshot. Edit permission is required and is now delegated to
 * `assertPageEditAccess`, the same helper used by `PUT /api/pages/:id/content`.
 *
 * - Personal page (`pages.note_id IS NULL`): only the `pages.ownerId` user.
 * - Note-native page (`pages.note_id IS NOT NULL`): the caller's note role
 *   must satisfy `canEdit` against the note's `editPermission` (issue #713).
 *   This both prevents removed members from continuing to restore and lets
 *   note owners restore snapshots on pages created by other editors.
 *
 * **Collaboration / コラボレーション**: This endpoint acquires a DB row lock for `page_contents`
 * and then asks Hocuspocus to invalidate the live document after commit. Configure
 * `HOCUSPOCUS_INTERNAL_URL` (or rely on the local default) plus `BETTER_AUTH_SECRET`
 * so stale in-memory Y.Doc state is disconnected before it can overwrite the restored DB state.
 */
// ── POST /:id/snapshots/:snapshotId/restore ─────────────────────────────────
app.post("/:id/snapshots/:snapshotId/restore", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const snapshotId = c.req.param("snapshotId");
  const userId = c.get("userId");
  const db = c.get("db");

  // 編集権限チェック（個人ページは所有者のみ、ノートネイティブはノートロール経由）
  // Edit-permission check (owner for personal pages, note-role aware for note-native).
  await assertPageEditAccess(db, pageId, userId);

  // 復元対象のスナップショットを取得
  const snapRows = await db
    .select()
    .from(pageSnapshots)
    .where(and(eq(pageSnapshots.id, snapshotId), eq(pageSnapshots.pageId, pageId)))
    .limit(1);

  const snap = snapRows[0];
  if (!snap) throw new HTTPException(404, { message: "Snapshot not found" });

  // トランザクションで復元処理
  const result = await db.transaction(async (tx) => {
    // page_contents 行をロックし、pre-restore バックアップと復元を同じ直列化境界で実行する。
    // Lock the current page_contents row so backup + restore observe a consistent state.
    await tx.execute(sql`SELECT 1 FROM page_contents WHERE page_id = ${pageId} FOR UPDATE`);

    // 1. 現在の状態をスナップショットとして保存
    const currentContent = await tx
      .select()
      .from(pageContents)
      .where(eq(pageContents.pageId, pageId))
      .limit(1);

    const current = currentContent[0];
    if (current) {
      await tx.insert(pageSnapshots).values({
        pageId,
        version: current.version,
        ydocState: current.ydocState,
        contentText: current.contentText,
        createdBy: userId,
        trigger: "pre-restore",
      });
    }

    // 2. page_contents を復元対象で上書き（version +1）
    const updated = await tx
      .update(pageContents)
      .set({
        ydocState: snap.ydocState,
        version: sql`${pageContents.version} + 1`,
        contentText: snap.contentText,
        updatedAt: new Date(),
      })
      .where(eq(pageContents.pageId, pageId))
      .returning();

    const updatedRow = updated[0];
    if (!updatedRow) throw new HTTPException(500, { message: "Restore failed" });

    // 3. 復元後の状態もスナップショットとして保存 (trigger: 'restore')
    const restoreSnap = await tx
      .insert(pageSnapshots)
      .values({
        pageId,
        version: updatedRow.version,
        ydocState: snap.ydocState,
        contentText: snap.contentText,
        createdBy: userId,
        trigger: "restore",
      })
      .returning();
    const restoreSnapshotId = restoreSnap[0]?.id;
    if (!restoreSnapshotId) {
      throw new HTTPException(500, { message: "Restore snapshot insert failed" });
    }

    // 4. pages メタデータ更新
    const contentPreview = snap.contentText
      ? snap.contentText.trim().replace(/\s+/g, " ").slice(0, 120)
      : null;
    await tx
      .update(pages)
      .set({ contentPreview, updatedAt: new Date() })
      .where(eq(pages.id, pageId));

    // 5. 100件超過分を削除
    await tx.execute(pruneSnapshotsExceedingLimitSql(pageId));

    return {
      version: updatedRow.version,
      snapshotId: restoreSnapshotId,
    };
  });

  await invalidateHocuspocusDocument(pageId);

  return c.json({
    version: result.version,
    snapshot_id: result.snapshotId,
  });
});

export default app;
