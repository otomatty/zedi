/**
 * ページタイトルのリネームを、参照元ドキュメントとゴーストリンクへ伝播する
 * サービス (issue #726 Phase 2)。
 *
 * Propagate a page-title rename into (1) WikiLink / tag marks inside every
 * source document that links to the renamed page and (2) ghost_links whose
 * text now matches the new title (promotion). Issue #726 Phase 2.
 *
 * スコープ / Scope:
 *   - 実体 → 実体 の書き換え: `links` で `target_id = renamedPageId` のソース
 *     ページを全走査し、Y.Doc 内の対象マークのテキストと属性を書き換える。
 *     手動編集されたテキスト（属性と一致しない区間）はテキストを残し、属性
 *     だけ更新する。`ydocRenameRewrite.ts` を参照。
 *   - ゴースト → 実体 の昇格: `ghost_links.link_text` が newTitle に一致する
 *     行を `links` に挿入し、ゴースト行を削除する。自己参照（同一ページ
 *     内の行）は DB CHECK で拒否されるためスキップする。
 *   - 伝播後、`Hocuspocus` のライブドキュメントを破棄して次回クライアント
 *     接続で DB から再読込させる（ベストエフォート、失敗はログのみ）。
 *
 *   - Real → real: find every source page via `links.target_id = renamedPageId`,
 *     open its Y.Doc, and rewrite the matching wiki-link /
 *     tag marks. Manually-edited link text (segments that no longer match
 *     the mark title) keeps its text; only the attribute is refreshed. See
 *     `ydocRenameRewrite.ts`.
 *   - Ghost → real (promotion): move `ghost_links` rows whose normalized
 *     `link_text` matches the new title into `links`. Self-references are
 *     rejected by a DB CHECK constraint so we filter them out up front.
 *   - After rewriting each source page, ask Hocuspocus to drop its cached
 *     Y.Doc so next clients reload from DB (best-effort; failures logged).
 *
 * 非スコープ / Out of scope:
 *   - 永続的な非同期ジョブキュー（本実装は呼び出し元が `void` で捨てる
 *     fire-and-forget を想定）。リトライ戦略は呼び出し側 TODO。
 *   - 実体 → ゴーストへの降格（削除由来のため issue #726 では扱わない）。
 *   - ノート・テナント境界フィルタ（`links` 自体に到達できる行は既存認可
 *     経路で担保されている前提）。
 *
 *   - Durable retry queue (callers should fire-and-forget with `.catch`;
 *     persistent retries live in a follow-up ticket).
 *   - Real → ghost demotion on deletion (separate issue).
 *   - Tenant-scoped filtering — `links` rows are authorized upstream.
 */

import * as Y from "yjs";
import { and, eq, sql, ne, inArray } from "drizzle-orm";
import { links, ghostLinks, pageContents, pages } from "../schema/index.js";
import type { Database } from "../types/index.js";
import { rewriteTitleRefsInDoc, type RewriteResult } from "./ydocRenameRewrite.js";
import { invalidateHocuspocusDocument } from "../lib/hocuspocusInvalidation.js";
import { buildContentPreview, extractTextFromYXml } from "../lib/extractPlainTextFromYXml.js";

/**
 * `propagateTitleRename` の結果カウンタ。ログ出力・監視用。
 * Counters returned by `propagateTitleRename` for logging and observability.
 */
export interface TitleRenamePropagationResult extends RewriteResult {
  /** Number of source pages scanned (had an outgoing link to the renamed page). */
  sourcePagesAttempted: number;
  /** Source pages whose transaction completed without throwing. */
  sourcePagesSucceeded: number;
  /** Source pages whose rewrite transaction threw (best-effort: error is logged). */
  sourcePagesFailed: number;
  /** Ghost-link rows promoted to real `links` rows because their text now matches. */
  ghostPromotionsCount: number;
}

/**
 * `propagateTitleRename` のオプション。テスト用に Hocuspocus 無効化の
 * 呼び出しを差し替え可能にする。
 *
 * Options for `propagateTitleRename`. Allows tests to inject a stub in
 * place of the real Hocuspocus invalidation HTTP call.
 */
export interface PropagateTitleRenameOptions {
  /**
   * Override the Hocuspocus invalidation call. Defaults to the real HTTP
   * helper; tests inject a stub. 既定値はテスト時に差し替え可能。
   */
  invalidateDocument?: (pageId: string) => Promise<void>;
}

/**
 * 参照元ページの書き換えを並列実行する際の最大同時実行数。各 source page は
 * 個別の `db.transaction`（接続を 1 本消費）を張る。さらに本伝播は呼び出し元で
 * fire-and-forget されるため、複数ユーザーの同時リネームで使用接続数が重畳する
 * （N 件同時 → 最大 4N 接続）。DB プール上限（`db/client.ts` の `max: 20`）を
 * 枯渇させて無関係な API を巻き込まないよう、保守的に 4 に固定する。
 *
 * Maximum number of source-page rewrites run concurrently. Each rewrite opens
 * its own transaction (one pooled connection), and propagation is fire-and-
 * forget, so concurrent renames stack (N at once → up to 4N connections). Kept
 * conservatively at 4 so it never exhausts the pool (`max: 20`) and starves
 * unrelated requests.
 */
const SOURCE_REWRITE_CONCURRENCY = 4;

function normalizeTitle(value: string): string {
  return value.toLowerCase().trim();
}

function emptyResult(): TitleRenamePropagationResult {
  return {
    wikiLinkMarksUpdated: 0,
    wikiLinkTextUpdated: 0,
    tagMarksUpdated: 0,
    tagTextUpdated: 0,
    sourcePagesAttempted: 0,
    sourcePagesSucceeded: 0,
    sourcePagesFailed: 0,
    ghostPromotionsCount: 0,
  };
}

function toBuffer(ydocState: unknown): Buffer | null {
  if (ydocState instanceof Buffer) return ydocState;
  if (ydocState instanceof Uint8Array) return Buffer.from(ydocState);
  if (typeof ydocState === "string") {
    // 万一 DB 層が base64 文字列で返してきた場合のフォールバック。
    // Defensive path in case a driver hands back a base64 string.
    return Buffer.from(ydocState, "base64");
  }
  return null;
}

/**
 * 1 つのソースページについて Y.Doc を読み込んで書き換え、変更があれば
 * 楽観バージョンを +1 して書き戻す。
 *
 * Rewrite a single source page's Y.Doc in a serialized transaction. Returns
 * `{ changed: false }` when either the page has no `page_contents` row or
 * the rewriter produced zero changes — callers should skip the Hocuspocus
 * invalidation in that case.
 */
async function rewriteSourcePage(
  db: Database,
  sourcePageId: string,
  renamedPageId: string,
  oldTitle: string,
  newTitle: string,
): Promise<{ changed: boolean; rewrite: RewriteResult }> {
  const zeroRewrite: RewriteResult = {
    wikiLinkMarksUpdated: 0,
    wikiLinkTextUpdated: 0,
    tagMarksUpdated: 0,
    tagTextUpdated: 0,
  };

  return db.transaction(async (tx) => {
    // 行ロックを取って Hocuspocus の並行書き込みと直列化する
    // (snapshot restore と同じパターン)。
    // Serialize with Hocuspocus' concurrent `onStoreDocument` writes by
    // grabbing the same row lock the snapshot-restore path uses.
    await tx.execute(sql`SELECT 1 FROM page_contents WHERE page_id = ${sourcePageId} FOR UPDATE`);

    const current = await tx
      .select()
      .from(pageContents)
      .where(eq(pageContents.pageId, sourcePageId))
      .limit(1);

    const row = current[0];
    if (!row) {
      return { changed: false, rewrite: zeroRewrite };
    }

    const buffer = toBuffer(row.ydocState);
    if (!buffer) {
      return { changed: false, rewrite: zeroRewrite };
    }

    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(buffer));
    // `renamedPageId` を渡すことで `targetId` 属性付きマークは ID 一致のみで
    // 書き換える（issue #737）。`targetId` が無い旧マークはタイトル一致で
    // フォールバック書き換えされる。
    // Pass `renamedPageId` so marks carrying a `targetId` are rewritten only
    // on id match (issue #737); legacy marks without `targetId` continue to
    // use the title-only fallback (lazy migration).
    const rewrite = rewriteTitleRefsInDoc(doc, oldTitle, newTitle, { renamedPageId });
    const hasChanges = rewrite.wikiLinkMarksUpdated > 0 || rewrite.tagMarksUpdated > 0;
    if (!hasChanges) {
      return { changed: false, rewrite };
    }

    const encodedState = Buffer.from(Y.encodeStateAsUpdate(doc));
    // リネーム後の Y.Doc からプレーンテキストとプレビューを取り直し、
    // `page_contents.content_text` / `pages.content_preview` が古い
    // タイトルのまま取り残されないようにする（PR #736 レビュー参照）。
    // Derive the new plain text / preview from the rewritten Y.Doc and
    // persist them atomically with `ydoc_state` so search, listing, and
    // snapshot metadata stay consistent. See PR #736 review.
    const newContentText = extractTextFromYXml(doc.getXmlFragment("default"));
    const newContentPreview = buildContentPreview(newContentText);
    await tx
      .update(pageContents)
      .set({
        ydocState: encodedState,
        version: sql`${pageContents.version} + 1`,
        contentText: newContentText,
        updatedAt: new Date(),
      })
      .where(eq(pageContents.pageId, sourcePageId));

    await tx
      .update(pages)
      .set({ contentPreview: newContentPreview, updatedAt: new Date() })
      .where(eq(pages.id, sourcePageId));

    return { changed: true, rewrite };
  });
}

/**
 * 1 つのソースページを書き換え、変更があれば Hocuspocus キャッシュを破棄する。
 * 並列バッチの 1 ユニットとして使う。invalidate の失敗はベストエフォートで
 * warn して握りつぶし、rewrite の失敗はそのまま throw して呼び出し側の
 * `Promise.allSettled` に `sourcePagesFailed` として集計させる。
 *
 * Rewrite one source page and, if it changed, drop its Hocuspocus cache.
 * Used as a single unit inside the bounded parallel batch. Invalidation
 * failures are swallowed (best-effort warn); rewrite failures propagate so
 * the caller's `Promise.allSettled` counts them as `sourcePagesFailed`.
 */
async function rewriteAndInvalidateSourcePage(
  db: Database,
  sourceId: string,
  renamedPageId: string,
  oldTitle: string,
  newTitle: string,
  invalidate: (pageId: string) => Promise<void>,
): Promise<RewriteResult> {
  const { changed, rewrite } = await rewriteSourcePage(
    db,
    sourceId,
    renamedPageId,
    oldTitle,
    newTitle,
  );

  if (changed) {
    try {
      await invalidate(sourceId);
    } catch (error) {
      console.warn(`[RenamePropagation] Invalidation failed for source page ${sourceId}:`, error);
    }
  }

  return rewrite;
}

/**
 * 新タイトルと一致するゴーストリンクを、リネーム対象と同一スコープ内でのみ
 * 実体リンクへ昇格させる。スコープはリネーム対象の `pages.note_id` で決定する。
 * ソースページも同一 `note_id` の場合のみ昇格する（Issue #823）。
 *
 * Promote ghost-link rows matching the new title only when the source page
 * shares the renamed page's `note_id` (issue #823).
 */
async function promoteGhostLinks(
  db: Database,
  renamedPageId: string,
  newTitle: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    // 1. Resolve the scope of the renamed page. Missing row → nothing to do.
    //    リネーム対象のスコープを解決。行が無ければ何もしない。
    const scopeRows = await tx
      .select({ noteId: pages.noteId, ownerId: pages.ownerId })
      .from(pages)
      .where(eq(pages.id, renamedPageId))
      .limit(1);
    const scope = scopeRows[0];
    if (!scope) return 0;

    // 2. 同一ノート（`pages.note_id`）かつテキスト一致のゴースト行を列挙する。
    const candidates = await tx
      .select({
        sourcePageId: ghostLinks.sourcePageId,
        linkType: ghostLinks.linkType,
      })
      .from(ghostLinks)
      .innerJoin(pages, eq(pages.id, ghostLinks.sourcePageId))
      .where(
        and(
          sql`LOWER(TRIM(${ghostLinks.linkText})) = LOWER(TRIM(${newTitle}))`,
          ne(ghostLinks.sourcePageId, renamedPageId),
          eq(pages.noteId, scope.noteId),
        ),
      );

    if (candidates.length === 0) return 0;

    // 3. Delete the matching in-scope ghost rows and insert real links.
    //    同一スコープのゴースト行だけ削除し、本物のリンクを挿入する。
    const scopedSourceIds = Array.from(new Set(candidates.map((c) => c.sourcePageId)));
    await tx
      .delete(ghostLinks)
      .where(
        and(
          sql`LOWER(TRIM(${ghostLinks.linkText})) = LOWER(TRIM(${newTitle}))`,
          inArray(ghostLinks.sourcePageId, scopedSourceIds),
        ),
      );

    await tx
      .insert(links)
      .values(
        candidates.map((row) => ({
          sourceId: row.sourcePageId,
          targetId: renamedPageId,
          linkType: row.linkType,
        })),
      )
      // 競合（既に同じエッジがある場合）は無視する。
      // Conflicts (an authoritative edge already exists) are harmless.
      .onConflictDoNothing();

    return candidates.length;
  });
}

/**
 * ページ `renamedPageId` のタイトル変更 `oldTitle` → `newTitle` を、参照元
 * ドキュメントおよびゴーストリンクへ伝播する。
 *
 * Propagate a rename `oldTitle` → `newTitle` for `renamedPageId` through
 * every source page's Y.Doc and through the ghost-link graph.
 *
 * この関数はベストエフォート動作である:
 *   - 個々のソースページ書き換えが失敗しても、残りのページとゴースト昇格
 *     処理は続行する。失敗はカウンタとログに残る。
 *   - Hocuspocus 無効化の失敗は呼び出し側に伝播させない。
 *
 * Best-effort:
 *   - Per-source rewrite failures are logged and counted in
 *     `sourcePagesFailed`; they do not abort the rest of the work.
 *   - Hocuspocus invalidation failures are logged and swallowed.
 */
export async function propagateTitleRename(
  db: Database,
  renamedPageId: string,
  oldTitle: string | null | undefined,
  newTitle: string | null | undefined,
  options?: PropagateTitleRenameOptions,
): Promise<TitleRenamePropagationResult> {
  const result = emptyResult();

  const trimmedOld = typeof oldTitle === "string" ? oldTitle.trim() : "";
  const trimmedNew = typeof newTitle === "string" ? newTitle.trim() : "";

  if (!trimmedOld || !trimmedNew) return result;
  if (normalizeTitle(trimmedOld) === normalizeTitle(trimmedNew)) return result;

  const invalidate =
    options?.invalidateDocument ??
    ((pageId: string) =>
      invalidateHocuspocusDocument(pageId, { logPrefix: "[RenamePropagation]" }));

  // 1. Rewrite source pages that have a real link to the renamed page.
  //    実体リンク経由でリネーム対象を参照しているページ群を書き換える。
  const sourceRows = await db
    .select({ sourceId: links.sourceId })
    .from(links)
    .where(eq(links.targetId, renamedPageId));

  const uniqueSourceIds = Array.from(new Set(sourceRows.map((r) => r.sourceId)));

  // 各 source page は独立した `page_contents` 行をロックするため順序非依存。
  // 多数リンク時のレイテンシを抑えるため、最大 SOURCE_REWRITE_CONCURRENCY 件
  // ずつチャンクに分けて並列実行する。失敗は従来どおりベストエフォートで握り、
  // 後続の source / ghost 昇格を止めない。
  //
  // Source pages are order-independent (each locks a distinct page_contents
  // row), so rewrite them in bounded `Promise.allSettled` batches to keep
  // latency flat as the link count grows. Per-page failures stay best-effort.
  for (let i = 0; i < uniqueSourceIds.length; i += SOURCE_REWRITE_CONCURRENCY) {
    const batch = uniqueSourceIds.slice(i, i + SOURCE_REWRITE_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((sourceId) =>
        rewriteAndInvalidateSourcePage(
          db,
          sourceId,
          renamedPageId,
          trimmedOld,
          trimmedNew,
          invalidate,
        ),
      ),
    );

    settled.forEach((outcome, idx) => {
      const sourceId = batch[idx];
      result.sourcePagesAttempted += 1;
      if (outcome.status === "fulfilled") {
        result.sourcePagesSucceeded += 1;
        result.wikiLinkMarksUpdated += outcome.value.wikiLinkMarksUpdated;
        result.wikiLinkTextUpdated += outcome.value.wikiLinkTextUpdated;
        result.tagMarksUpdated += outcome.value.tagMarksUpdated;
        result.tagTextUpdated += outcome.value.tagTextUpdated;
      } else {
        result.sourcePagesFailed += 1;
        console.error(
          `[RenamePropagation] Failed to rewrite source page ${sourceId} ` +
            `for rename ${renamedPageId} (${trimmedOld} → ${trimmedNew}):`,
          outcome.reason,
        );
      }
    });
  }

  // 2. Promote matching ghost links. ベストエフォートで昇格させる。
  try {
    result.ghostPromotionsCount = await promoteGhostLinks(db, renamedPageId, trimmedNew);
  } catch (error) {
    console.error(
      `[RenamePropagation] Ghost-link promotion failed for ${renamedPageId} (new title ${trimmedNew}):`,
      error,
    );
  }

  return result;
}
