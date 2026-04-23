import type { IPageRepository } from "@/lib/pageRepository";
import type { PageSummary } from "@/types/page";

/**
 * `syncLinksWithRepo` が受け取る WikiLink の最小情報。
 * Minimal shape of a WikiLink passed to `syncLinksWithRepo`.
 */
export interface WikiLinkForSync {
  title: string;
  exists?: boolean;
}

/**
 * `syncLinksWithRepo` の拡張オプション。WikiLink のスコープ絞り込み
 * （Issue #713 Phase 4）のために `pageNoteId` と、ノートネイティブページ用
 * の外部候補リスト `notePages` を受け取る。
 *
 * Extra options for `syncLinksWithRepo`. Used to scope WikiLink resolution
 * (issue #713 Phase 4). `pageNoteId` identifies whether the source page is
 * personal (`null`) or note-native (`string`); `notePages` supplies an
 * external candidate list when the repository does not hold note-native
 * pages locally (IndexedDB holds only personal pages).
 */
export interface SyncLinksOptions {
  /**
   * リンク元ページの所属ノート ID。`null` なら個人ページとして同期し、
   * `repo.getPagesSummary()` が返す個人ページのみを解決候補にする。
   * 文字列値なら `notePages` に渡された候補リストだけを使う。
   *
   * Note id that owns the source page. `null` → personal; the repo's
   * personal page summaries are used. A string → note-native; callers must
   * supply `notePages` with the note's page list.
   */
  pageNoteId?: string | null;
  /**
   * `pageNoteId !== null` のときに使われる、ノートネイティブページの候補
   * リスト。IndexedDB にはノート配下のページが入らない前提のため、API
   * から取得したリストを呼び出し側が渡す必要がある。渡されない場合は
   * ノートスコープでの解決候補が空になり、すべてゴーストリンクとして
   * 扱われる。
   *
   * External candidate list used when `pageNoteId` is a string. The
   * repository does not store note-native pages locally, so callers pass
   * pages fetched from the API. If omitted, note-scoped resolution has no
   * candidates and every WikiLink becomes a ghost link.
   */
  notePages?: Array<Pick<PageSummary, "id" | "title">>;
}

/**
 * Sync WikiLinks for a page (delta update).
 * - Removes links/ghost_links that are no longer in content.
 * - Adds links for current content (existing pages → links, others → ghost_links).
 *
 * Extracted for unit testing with a mock repo.
 *
 * Scope (Issue #713 Phase 4):
 * - `options.pageNoteId === null`（既定）: 個人ページに対する同期。解決候補
 *   は `repo.getPagesSummary(userId)` が返す個人ページのみ。
 * - `options.pageNoteId === string`: ノートネイティブページに対する同期。
 *   解決候補は `options.notePages` のみ（呼び出し側が API から取得した
 *   ノート配下のページ一覧を渡す）。
 *
 * - `options.pageNoteId === null` (default): sync for a personal page.
 *   Candidates come from `repo.getPagesSummary(userId)`.
 * - `options.pageNoteId === string`: sync for a note-native page. Candidates
 *   come from `options.notePages` only (caller must pre-fetch the note's
 *   pages from the API).
 */
export async function syncLinksWithRepo(
  repo: IPageRepository,
  userId: string,
  sourcePageId: string,
  wikiLinks: WikiLinkForSync[],
  options: SyncLinksOptions = {},
): Promise<void> {
  const pageNoteId = options.pageNoteId ?? null;
  const candidateSource: Array<Pick<PageSummary, "id" | "title">> = pageNoteId
    ? (options.notePages ?? [])
    : await repo.getPagesSummary(userId);

  const pageTitleToId = new Map(candidateSource.map((p) => [p.title.toLowerCase().trim(), p.id]));
  const idToNormalizedTitle = new Map(
    candidateSource.map((p) => [p.id, p.title.toLowerCase().trim()]),
  );
  const currentNormalizedTitles = new Set(wikiLinks.map((l) => l.title.toLowerCase().trim()));

  // Delta: remove links that are no longer in content
  const [oldOutgoingTargetIds, oldGhostTexts] = await Promise.all([
    repo.getOutgoingLinks(sourcePageId),
    repo.getGhostLinksBySourcePage(sourcePageId),
  ]);
  for (const targetId of oldOutgoingTargetIds) {
    const norm = idToNormalizedTitle.get(targetId);
    if (norm !== undefined && !currentNormalizedTitles.has(norm)) {
      await repo.removeLink(sourcePageId, targetId);
    }
  }
  for (const linkText of oldGhostTexts) {
    const norm = linkText.toLowerCase().trim();
    if (!currentNormalizedTitles.has(norm)) {
      await repo.removeGhostLink(linkText, sourcePageId);
    }
  }

  // Add/update: current content's links
  for (const link of wikiLinks) {
    const normalizedTitle = link.title.toLowerCase().trim();
    const targetPageId = pageTitleToId.get(normalizedTitle);

    if (targetPageId && targetPageId !== sourcePageId) {
      await repo.addLink(sourcePageId, targetPageId);
      await repo.removeGhostLink(link.title, sourcePageId);
    } else if (!targetPageId) {
      await repo.addGhostLink(link.title, sourcePageId);
    }
  }
}
