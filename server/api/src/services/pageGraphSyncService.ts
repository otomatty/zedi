/**
 * Y.Doc から WikiLink / tag マークを抽出し、`links` / `ghost_links` の
 * 「ソースページごとに正しいエッジ集合」状態へ同期するサービス
 * (Issue #880 Phase C)。
 *
 * Extract WikiLink and tag references from a server-side Y.Doc and rebuild
 * the `(source_id, link_type)` slices of `links` / `ghost_links` so they
 * match the current document contents (issue #880 Phase C).
 *
 * 呼び出し元 / Callers:
 *   - `PUT /api/pages/:id/content` (REST 経路の本文保存後)
 *   - Hocuspocus 保存経路 (internal HTTP `POST /api/internal/pages/:id/graph-sync`)
 *
 * 設計方針 / Design notes:
 *   - 解決スコープは「ソースページと同じ `pages.note_id`」のページ集合のみ。
 *     ノートを跨ぐ解決は行わない（個人ページはオーナーのデフォルトノートが
 *     スコープになる）。
 *   - mark に `targetId` が埋まっていれば、(a) ソースと同じ `note_id` かつ
 *     未削除であることを確認した上で `links` に保存する。タイトルが古い／
 *     リネーム途中でも id 一致で解決できる。
 *   - `targetId` が無いマークはタイトル文字列を正規化（小文字 + trim）して
 *     スコープ内ページの正規化タイトルと突き合わせる。`ydocRenameRewrite.ts`
 *     のフォールバック契約と同じ。
 *   - 解決失敗（id 不明 / タイトル不一致）は `ghost_links` に記録する。
 *   - `links` / `ghost_links` の置換は `(source_id, link_type)` 単位の
 *     DELETE → INSERT。他種別 (`wiki` ↔ `tag`) のエッジには触れない
 *     (`syncPages.ts` のセマンティクスと一致)。
 *   - 自己参照（自分のページへのリンク）は CHECK 制約で弾かれるため事前除外。
 *   - 全体を 1 つの DB トランザクションで実行することで、レースしても
 *     `(source_id, link_type)` バケットの状態は常に整合する。
 *
 *   - Resolution scope: the source page's owning `pages.note_id`. Refs do not
 *     resolve across notes; for personal pages this means the owner's
 *     default note.
 *   - Marks carrying a `targetId` are matched by id when the target is in the
 *     same scope; this keeps freshly-renamed links resolving even before the
 *     editor catches up on the title.
 *   - Marks without `targetId` fall back to normalized-title matching, the
 *     same contract as `ydocRenameRewrite.ts`.
 *   - Unresolvable refs are stored in `ghost_links`.
 *   - Replacement is scoped per `(source_id, link_type)` pair so wiki and tag
 *     buckets never wipe each other (matches `syncPages.ts`).
 *   - Self-references are rejected by `links_no_self_ref` (CHECK constraint),
 *     so we filter them out before INSERT.
 *   - Everything runs in one DB transaction so concurrent writers cannot
 *     observe a half-empty bucket.
 */

import * as Y from "yjs";
import { and, eq } from "drizzle-orm";
import { links, ghostLinks, pages, pageContents } from "../schema/index.js";
import type { Database } from "../types/index.js";
import type { LinkType } from "../schema/links.js";

/**
 * 1 つの抽出された参照（WikiLink もしくは tag の 1 つのマーク相当）。
 * normalizedTitle / displayTitle / 任意の targetId をまとめて保持する。
 *
 * One extracted reference (a single WikiLink or tag mark instance). Carries
 * both the lookup key (`normalizedTitle`) and the user-facing spelling
 * (`displayTitle`); `targetId` is set when the mark already resolved on the
 * client side.
 */
interface ExtractedRef {
  /** Lookup key: lowercase + trimmed. */
  normalizedTitle: string;
  /** Display value used for ghost rows. */
  displayTitle: string;
  /** Client-resolved `targetId`, if any. */
  targetId: string | null;
}

/**
 * Y.Doc から抽出した WikiLink / tag 参照集合。各マークごとに 1 件として保持し、
 * planBucket でバケット単位の (links, ghost_links) 計算へ流す。
 *
 * Extracted references grouped per mark type. Each list keeps one entry per
 * mark occurrence (deduplicated by `(normalizedTitle, targetId)`) so the
 * planner can decide id-first vs title-first resolution on a per-mark basis.
 */
interface ExtractedRefs {
  wikiRefs: ExtractedRef[];
  tagRefs: ExtractedRef[];
}

/**
 * `syncPageGraphFromYDoc` の結果カウンタ。運用ログ用。
 * Counters returned by `syncPageGraphFromYDoc` for logging.
 */
export interface PageGraphSyncResult {
  wikiLinksInserted: number;
  wikiGhostsInserted: number;
  tagLinksInserted: number;
  tagGhostsInserted: number;
  /** Whether the source page is missing or deleted (no sync performed). */
  skippedSourceNotFound: boolean;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractStringAttr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Y.Doc の `default` XmlFragment を走査し、`Y.XmlText.toDelta()` の
 * `attributes.wikiLink` / `attributes.tag` から参照を取り出す。
 *
 * Walk the Y.Doc's `default` XmlFragment and collect references from
 * `Y.XmlText.toDelta()` segments carrying `wikiLink` / `tag` mark attributes.
 */
/**
 * 1 セグメントの `attributes` から、`wikiLink` / `tag` どちらか（または両方）の
 * 参照を抽出して seen Map に追加する。同じ正規化キーが既にあれば first-write-wins。
 *
 * Pull `wikiLink` / `tag` references out of a single delta segment's
 * attributes and accumulate them into the seen maps. Same `normalizedTitle`
 * plus `targetId` collapses to one entry (first-write-wins).
 */
function collectFromAttributes(
  attributes: Record<string, unknown>,
  wikiSeen: Map<string, ExtractedRef>,
  tagSeen: Map<string, ExtractedRef>,
): void {
  const wikiAttr = isPlainObject(attributes.wikiLink) ? attributes.wikiLink : null;
  if (wikiAttr) {
    const title = extractStringAttr(wikiAttr.title);
    if (title) {
      const normalized = normalize(title);
      const targetId = extractStringAttr(wikiAttr.targetId);
      const key = `${normalized}\x00${targetId ?? ""}`;
      if (!wikiSeen.has(key)) {
        wikiSeen.set(key, { normalizedTitle: normalized, displayTitle: title, targetId });
      }
    }
  }

  const tagAttr = isPlainObject(attributes.tag) ? attributes.tag : null;
  if (tagAttr) {
    const name = extractStringAttr(tagAttr.name);
    if (name) {
      const normalized = normalize(name);
      const targetId = extractStringAttr(tagAttr.targetId);
      const key = `${normalized}\x00${targetId ?? ""}`;
      if (!tagSeen.has(key)) {
        tagSeen.set(key, { normalizedTitle: normalized, displayTitle: name, targetId });
      }
    }
  }
}

function extractRefsFromYDoc(doc: Y.Doc, fragmentName = "default"): ExtractedRefs {
  // (normalizedTitle, targetId|"") キーで重複排除する。タイトルが同じで
  // targetId が違う場合は別マーク扱いとし、両方を保持する（例: 別ノートの id
  // を持ち越したコピー参照が同名の別 mark と共存するケース）。
  // Dedupe by `(normalizedTitle, targetId|"")` so a same-titled mark with a
  // different `targetId` is kept distinct — e.g. a stale copied mark carrying
  // a foreign id alongside a fresh title-only mark.
  const wikiSeen = new Map<string, ExtractedRef>();
  const tagSeen = new Map<string, ExtractedRef>();

  function visitDelta(text: Y.XmlText): void {
    const delta = text.toDelta() as Array<unknown>;
    for (const raw of delta) {
      if (!isPlainObject(raw) || typeof raw.insert !== "string") continue;
      const attributes = isPlainObject(raw.attributes) ? raw.attributes : null;
      if (!attributes) continue;
      collectFromAttributes(attributes, wikiSeen, tagSeen);
    }
  }

  function walk(node: Y.XmlFragment | Y.XmlElement): void {
    // `node.get(i)` is O(i); use `toArray()` for a single O(N) pass — same
    // optimisation as `ydocRenameRewrite.ts`.
    const children = node.toArray() as Array<Y.XmlElement | Y.XmlText>;
    for (const child of children) {
      if (child instanceof Y.XmlText) {
        visitDelta(child);
      } else if (child instanceof Y.XmlElement) {
        walk(child);
      }
    }
  }

  walk(doc.getXmlFragment(fragmentName));

  return {
    wikiRefs: [...wikiSeen.values()],
    tagRefs: [...tagSeen.values()],
  };
}

/**
 * 解決結果（タイトル → ページ id の正規化マップ + 有効な targetId 集合）。
 * Resolution result: title→id map (keyed on normalized title) plus the set
 * of `targetId` values that survived the in-scope / not-deleted filter.
 */
interface ResolvedScope {
  /** Normalized page title → page id (lookup by mark.title). */
  titleToId: Map<string, string>;
  /** `targetId` values that are in scope and not deleted. */
  validTargetIds: Set<string>;
}

/**
 * `sourcePageNoteId` と同じノートに属する有効なページから、解決マップを構築する。
 * `markedTargetIds` に含まれる id は別途検証して、ノート跨ぎや削除済みを弾く。
 *
 * Build a resolution map from the source page's note: normalized page titles
 * mapped to their ids, plus the subset of mark-supplied `targetId` values
 * that survive scope + soft-delete checks.
 *
 * 型注: drizzle の `tx` 型 (`PgTransaction<...>`) は `Database` (`NodePgDatabase`)
 * に直接代入できないが、`select` API は共通の親クラスから来ているため
 * structural な部分型を要求する形にしている。
 *
 * Type note: drizzle's `tx` (`PgTransaction<...>`) is not assignable to
 * `Database` (`NodePgDatabase`) directly, but both expose the same `select`
 * API. The structural pick keeps the helper callable from either context.
 */
type ReadHandle = Pick<Database, "select">;
async function buildResolvedScope(
  tx: ReadHandle,
  sourcePageNoteId: string,
  sourcePageId: string,
  markedTargetIds: Set<string>,
): Promise<ResolvedScope> {
  const scopeRows = await tx
    .select({ id: pages.id, title: pages.title, isDeleted: pages.isDeleted })
    .from(pages)
    .where(eq(pages.noteId, sourcePageNoteId));

  const titleToId = new Map<string, string>();
  const validIds = new Set<string>();
  for (const row of scopeRows) {
    if (row.isDeleted) continue;
    validIds.add(row.id);
    if (row.title) {
      const key = normalize(row.title);
      // 同一ノート内で同名ページが複数あった場合は最初に見つかった id を採用
      // する (作成順)。WikiLink の解決方針として、新しいページが既存の同名
      // ページを「奪う」のは挙動として混乱しやすいため最初勝ち。
      // First-write-wins on duplicate titles within a note; later same-name
      // pages do not steal resolution from older ones (less surprising UX).
      if (!titleToId.has(key)) {
        titleToId.set(key, row.id);
      }
    }
  }

  const validTargetIds = new Set<string>();
  for (const id of markedTargetIds) {
    // `targetId` がソースページと同じノート内の有効ページなら採用。
    // ノートを跨いだ id（過去にコピー前の id を保持している場合など）は弾く。
    // Only keep `targetId` values for in-scope, non-deleted pages so cross-note
    // ids (e.g. left behind by a copy-to-personal flow) become ghosts.
    if (validIds.has(id)) validTargetIds.add(id);
  }
  // 自己参照は CHECK 制約に弾かれるので事前除外する。
  // Strip self-references up front to keep the CHECK constraint from rejecting
  // the whole INSERT batch.
  validTargetIds.delete(sourcePageId);

  return { titleToId, validTargetIds };
}

/**
 * 1 つの link バケット（wiki または tag）について、参照リストと解決マップから
 * 「保存するべき links 行」と「保存するべき ghost_links 行」を計算する。
 *
 * For one link bucket (wiki or tag), turn the extracted refs + scope map into
 * the (sourceId, targetId) edges and the (linkText, sourceId) ghost rows that
 * should exist after this sync pass. Each ref is decided independently:
 *   1. mark.targetId が scope 内で有効なら、その id でリンク化する。
 *      タイトル fallback は走らない（rename 中でも壊れない）。
 *   2. そうでなければタイトル一致で解決を試みる。
 *   3. どちらも解決できない場合だけ ghost に倒す。
 *
 * Each ref is processed independently:
 *   1. If the mark's `targetId` is still valid in scope, link by id (no
 *      title fallback — protects against in-flight renames).
 *   2. Otherwise, try title resolution against scope.
 *   3. Only if neither resolves, write a ghost row.
 */
function planBucket(
  sourcePageId: string,
  refs: ExtractedRef[],
  scope: ResolvedScope,
): { linkTargetIds: Set<string>; ghostTexts: Map<string, string> } {
  const linkTargetIds = new Set<string>();
  const ghostTexts = new Map<string, string>();

  for (const ref of refs) {
    // 1. mark.targetId 経由の解決を最優先。`targetId` がスコープ内で有効なら
    //    タイトル fallback には進まない（in-flight rename 対策）。
    // 1. id-based resolution wins; a valid `targetId` short-circuits title
    //    fallback so an in-flight rename does not regress to a ghost.
    if (ref.targetId && scope.validTargetIds.has(ref.targetId)) {
      // `targetId === sourcePageId` の自己参照は buildResolvedScope で除外済み。
      // Self-references were removed from `validTargetIds` upstream.
      linkTargetIds.add(ref.targetId);
      continue;
    }

    // 2. タイトル一致で解決する。
    // 2. Title-based resolution.
    const titleResolvedId = scope.titleToId.get(ref.normalizedTitle);
    if (titleResolvedId && titleResolvedId !== sourcePageId) {
      linkTargetIds.add(titleResolvedId);
      continue;
    }

    // 3. 解決できなかった refs を ghost に倒す。同一 normalizedTitle が複数
    //    出てきた場合は first-write-wins で display を保存する。
    // 3. Unresolved refs become ghosts; first-seen display spelling wins on
    //    duplicate normalized titles.
    if (titleResolvedId === sourcePageId) {
      // タイトル一致で自分自身が出てきた場合は CHECK 制約で弾かれるので
      // ghost にも入れない（自己参照は完全に無視）。
      // Title resolved to the source page itself — drop entirely (the CHECK
      // constraint forbids self-links, and a ghost on your own page is noise).
      continue;
    }
    if (!ghostTexts.has(ref.normalizedTitle)) {
      ghostTexts.set(ref.normalizedTitle, ref.displayTitle);
    }
  }

  return { linkTargetIds, ghostTexts };
}

/**
 * `(source_id, link_type)` バケットの links / ghost_links を、与えられた集合へ
 * 置き換える。`syncPages.ts` の DELETE → INSERT セマンティクスと同じ。
 *
 * Replace the `(source_id, link_type)` slice of `links` / `ghost_links` with
 * the supplied target/ghost sets. Mirrors `syncPages.ts` semantics.
 */
type WriteHandle = Pick<Database, "insert" | "delete">;
async function replaceBucket(
  tx: WriteHandle,
  sourcePageId: string,
  linkType: LinkType,
  desiredLinkTargetIds: Set<string>,
  desiredGhostTexts: Map<string, string>,
): Promise<{ insertedLinks: number; insertedGhosts: number }> {
  // DELETE existing edges for this (source, link_type).
  // 既存エッジを (source, link_type) 単位で全削除し、計算済みの新規集合で
  // 再構成する。`syncPages.ts` と同じ「バケット内 LWW」モデル。
  await tx.delete(links).where(and(eq(links.sourceId, sourcePageId), eq(links.linkType, linkType)));
  await tx
    .delete(ghostLinks)
    .where(and(eq(ghostLinks.sourcePageId, sourcePageId), eq(ghostLinks.linkType, linkType)));

  let insertedLinks = 0;
  let insertedGhosts = 0;

  if (desiredLinkTargetIds.size > 0) {
    const rows = Array.from(desiredLinkTargetIds).map((targetId) => ({
      sourceId: sourcePageId,
      targetId,
      linkType,
    }));
    await tx.insert(links).values(rows).onConflictDoNothing();
    insertedLinks = rows.length;
  }

  if (desiredGhostTexts.size > 0) {
    const rows = Array.from(desiredGhostTexts.values()).map((linkText) => ({
      linkText,
      sourcePageId,
      linkType,
    }));
    await tx.insert(ghostLinks).values(rows).onConflictDoNothing();
    insertedGhosts = rows.length;
  }

  return { insertedLinks, insertedGhosts };
}

/**
 * `pageId` のソースページについて、Y.Doc の現在内容から
 * `links` / `ghost_links` を `(source_id, link_type)` バケット単位で
 * 再構築する。
 *
 * Rebuild the `(source_id, link_type)` slices of `links` / `ghost_links` for
 * `pageId` from the current Y.Doc contents.
 *
 * @param db - Drizzle database handle.
 * @param sourcePageId - The page whose outgoing edges are being synced.
 * @param doc - The current Y.Doc for that page (already deserialized).
 * @returns Counters describing what was rewritten.
 */
export async function syncPageGraphFromYDoc(
  db: Database,
  sourcePageId: string,
  doc: Y.Doc,
): Promise<PageGraphSyncResult> {
  const empty: PageGraphSyncResult = {
    wikiLinksInserted: 0,
    wikiGhostsInserted: 0,
    tagLinksInserted: 0,
    tagGhostsInserted: 0,
    skippedSourceNotFound: false,
  };

  return db.transaction(async (tx) => {
    // ソースページの note スコープを解決する。削除済み・行欠落は best-effort
    // としてサイレント no-op（呼び出し側のメイン保存パスは既に終わっている）。
    // Resolve the source page's note scope. Missing / soft-deleted rows are
    // treated as a no-op since this service runs in a best-effort context
    // after the main content save has already succeeded.
    const sourceRows = await tx
      .select({ noteId: pages.noteId, isDeleted: pages.isDeleted })
      .from(pages)
      .where(eq(pages.id, sourcePageId))
      .limit(1);
    const source = sourceRows[0];
    if (!source || source.isDeleted) {
      return { ...empty, skippedSourceNotFound: true };
    }

    const refs = extractRefsFromYDoc(doc);
    const allTargetIds = new Set<string>();
    for (const ref of refs.wikiRefs) {
      if (ref.targetId) allTargetIds.add(ref.targetId);
    }
    for (const ref of refs.tagRefs) {
      if (ref.targetId) allTargetIds.add(ref.targetId);
    }
    const scope = await buildResolvedScope(tx, source.noteId, sourcePageId, allTargetIds);

    const wikiPlan = planBucket(sourcePageId, refs.wikiRefs, scope);
    const tagPlan = planBucket(sourcePageId, refs.tagRefs, scope);

    const wikiResult = await replaceBucket(
      tx,
      sourcePageId,
      "wiki",
      wikiPlan.linkTargetIds,
      wikiPlan.ghostTexts,
    );
    const tagResult = await replaceBucket(
      tx,
      sourcePageId,
      "tag",
      tagPlan.linkTargetIds,
      tagPlan.ghostTexts,
    );

    return {
      wikiLinksInserted: wikiResult.insertedLinks,
      wikiGhostsInserted: wikiResult.insertedGhosts,
      tagLinksInserted: tagResult.insertedLinks,
      tagGhostsInserted: tagResult.insertedGhosts,
      skippedSourceNotFound: false,
    };
  });
}

/**
 * `pageId` の現在の `page_contents.ydoc_state` を読み込んで Y.Doc を組み立て、
 * グラフ同期を実行するラッパー。Hocuspocus 保存後の internal 経路や、API 内
 * の fire-and-forget 呼び出しから使う。
 *
 * Convenience wrapper: read `page_contents.ydoc_state` for `pageId`, hydrate
 * the Y.Doc, and run `syncPageGraphFromYDoc`. Used by the Hocuspocus
 * post-save trigger (via internal HTTP) and by the REST PUT /content path
 * (fire-and-forget).
 *
 * Returns `null` when there is no stored content yet — the caller should
 * treat that as a no-op (graph stays empty).
 */
export async function syncPageGraphFromStoredYDoc(
  db: Database,
  sourcePageId: string,
): Promise<PageGraphSyncResult | null> {
  const rows = await db
    .select({ ydocState: pageContents.ydocState })
    .from(pageContents)
    .where(eq(pageContents.pageId, sourcePageId))
    .limit(1);
  const row = rows[0];
  if (!row?.ydocState) return null;

  const buffer =
    row.ydocState instanceof Buffer
      ? row.ydocState
      : Buffer.from(row.ydocState as unknown as ArrayBufferLike);

  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(buffer));
  return syncPageGraphFromYDoc(db, sourcePageId, doc);
}

/**
 * テスト用フック。ユニットテストで内部ヘルパーを直接検証するために露出する。
 * production code が触ることは想定していない。
 *
 * Internal helpers exposed solely for tests. Production code should call
 * `syncPageGraphFromYDoc` / `syncPageGraphFromStoredYDoc`.
 */
export const __test_only = { extractRefsFromYDoc, planBucket };
