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
import { and, eq, sql, ne } from "drizzle-orm";
import { links, ghostLinks, pageContents } from "../schema/index.js";
import type { Database } from "../types/index.js";
import { rewriteTitleRefsInDoc, type RewriteResult } from "./ydocRenameRewrite.js";
import { invalidateHocuspocusDocument } from "../lib/hocuspocusInvalidation.js";

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
    const rewrite = rewriteTitleRefsInDoc(doc, oldTitle, newTitle);
    const hasChanges = rewrite.wikiLinkMarksUpdated > 0 || rewrite.tagMarksUpdated > 0;
    if (!hasChanges) {
      return { changed: false, rewrite };
    }

    const encodedState = Buffer.from(Y.encodeStateAsUpdate(doc));
    await tx
      .update(pageContents)
      .set({
        ydocState: encodedState,
        version: sql`${pageContents.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(pageContents.pageId, sourcePageId));

    return { changed: true, rewrite };
  });
}

/**
 * 新タイトルと一致するゴーストリンクを検索し、実体リンクへ昇格させる。
 * Delete matching `ghost_links` rows and insert real `links` rows pointing
 * at the renamed page. Self-references are skipped to respect the DB CHECK.
 */
async function promoteGhostLinks(
  db: Database,
  renamedPageId: string,
  newTitle: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const promoted = await tx
      .delete(ghostLinks)
      .where(
        and(
          sql`LOWER(TRIM(${ghostLinks.linkText})) = LOWER(TRIM(${newTitle}))`,
          ne(ghostLinks.sourcePageId, renamedPageId),
        ),
      )
      .returning({
        sourcePageId: ghostLinks.sourcePageId,
        linkType: ghostLinks.linkType,
        linkText: ghostLinks.linkText,
      });

    if (promoted.length === 0) return 0;

    await tx
      .insert(links)
      .values(
        promoted.map((row) => ({
          sourceId: row.sourcePageId,
          targetId: renamedPageId,
          linkType: row.linkType,
        })),
      )
      // 競合（既に同じエッジがある場合）は無視する。削除した ghost は
      // 回復不能だが、既に本物のリンクが存在するので問題にならない。
      // Conflicts (a real edge already exists) are harmless — the ghost
      // row is gone but the authoritative edge is still present.
      .onConflictDoNothing();

    return promoted.length;
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

  for (const sourceId of uniqueSourceIds) {
    result.sourcePagesAttempted += 1;
    try {
      const { changed, rewrite } = await rewriteSourcePage(db, sourceId, trimmedOld, trimmedNew);
      result.sourcePagesSucceeded += 1;
      result.wikiLinkMarksUpdated += rewrite.wikiLinkMarksUpdated;
      result.wikiLinkTextUpdated += rewrite.wikiLinkTextUpdated;
      result.tagMarksUpdated += rewrite.tagMarksUpdated;
      result.tagTextUpdated += rewrite.tagTextUpdated;

      if (changed) {
        try {
          await invalidate(sourceId);
        } catch (error) {
          console.warn(
            `[RenamePropagation] Invalidation failed for source page ${sourceId}:`,
            error,
          );
        }
      }
    } catch (error) {
      result.sourcePagesFailed += 1;
      console.error(
        `[RenamePropagation] Failed to rewrite source page ${sourceId} ` +
          `for rename ${renamedPageId} (${trimmedOld} → ${trimmedNew}):`,
        error,
      );
    }
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
