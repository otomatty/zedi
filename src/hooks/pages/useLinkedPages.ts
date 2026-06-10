import { useQuery } from "@tanstack/react-query";
import { useRepository, usePage, pageKeys } from "@/hooks/pages/usePageQueries";
import { useNoteApi } from "@/hooks/notes/useNoteQueries";
import { extractWikiLinksFromContent, getUniqueWikiLinkTitles } from "@/lib/wikiLinkUtils";
import { getContentPreview } from "@/lib/contentUtils";
import type { Page, PageSummary } from "@/types/page";
import type { PagePublicLinksResponse, PagePublicLinkCard } from "@/lib/api/types";

/**
 * Card data for linked pages display
 *
 * `noteId` は遷移先 URL `/notes/:noteId/:pageId` を組み立てるために必要
 * （Issue #889 Phase 3 で `/pages/:id` ルートを撤去）。Issue #823 / #825 以降
 * 全ページは所属ノートを必ず 1 つ持つので non-null。
 *
 * `noteId` is required to build the `/notes/:noteId/:pageId` URL (Issue #889
 * Phase 3 retired `/pages/:id`). Non-null since every page belongs to exactly
 * one note (Issues #823 / #825).
 */
export interface PageCard {
  id: string;
  noteId: string;
  title: string;
  preview: string; // Content preview (50 chars)
  updatedAt: number;
  sourceUrl?: string;
}

/**
 * Outgoing link with its 2-hop children
 */
export interface OutgoingLinkWithChildren {
  source: PageCard; // The outgoing link page
  children: PageCard[]; // Pages linked from the source (2-hop)
}

/**
 * Data structure for linked pages
 */
export interface LinkedPagesData {
  outgoingLinks: PageCard[]; // Pages linked from this page (without 2-hop)
  outgoingLinksWithChildren: OutgoingLinkWithChildren[]; // Outgoing links that have their own outgoing links
  backlinks: PageCard[]; // Pages linking to this page
  twoHopLinks: PageCard[]; // 2-hop links (links from linked pages) - kept for backward compatibility
  ghostLinks: string[]; // Non-existing link targets
}

/**
 * Input data for calculating linked pages (legacy, uses full Page objects)
 */
export interface CalculateLinkedPagesInput {
  currentPage: Page;
  pageId: string;
  allPages: Page[];
  backlinkIds: string[];
}

/**
 * Input data for optimized linked pages calculation
 */
export interface CalculateLinkedPagesOptimizedInput {
  currentPage: Page;
  pageId: string;
  allPagesSummary: PageSummary[];
  outgoingPages: Page[]; // Pages with content for 2-hop calculation
  backlinkPages: Page[]; // Backlink pages with content for preview
  backlinkIds: string[];
}

/**
 * Convert Page to PageCard
 */
export function pageToCard(page: Page): PageCard {
  return {
    id: page.id,
    noteId: page.noteId,
    title: page.title,
    preview: getContentPreview(page.content, 50),
    updatedAt: page.updatedAt,
    sourceUrl: page.sourceUrl,
  };
}

/**
 * Convert PageSummary to PageCard (without preview since no content)
 */
export function summaryToCard(summary: PageSummary): PageCard {
  return {
    id: summary.id,
    noteId: summary.noteId,
    title: summary.title,
    preview: "", // No content available in summary
    updatedAt: summary.updatedAt,
    sourceUrl: summary.sourceUrl,
  };
}

/**
 * Pure function to calculate linked pages data
 * This is extracted for easier testing
 */
export function calculateLinkedPages(input: CalculateLinkedPagesInput): LinkedPagesData {
  const { currentPage, pageId, allPages, backlinkIds } = input;

  // 1. Extract WikiLinks from current page content
  const wikiLinks = extractWikiLinksFromContent(currentPage.content);
  const linkTitles = getUniqueWikiLinkTitles(wikiLinks);

  // 2. Create page mappings
  const pageByTitle = new Map(allPages.map((p) => [p.title.toLowerCase().trim(), p]));
  const pageById = new Map(allPages.map((p) => [p.id, p]));

  // 3. Outgoing Links (existing pages only)
  const allOutgoingLinks: PageCard[] = [];
  const ghostLinks: string[] = [];

  for (const title of linkTitles) {
    const targetPage = pageByTitle.get(title.toLowerCase().trim());
    if (targetPage && targetPage.id !== pageId) {
      allOutgoingLinks.push(pageToCard(targetPage));
    } else if (!targetPage) {
      ghostLinks.push(title);
    }
  }

  // 4. Backlinks (from links table)
  const backlinks: PageCard[] = backlinkIds
    .map((id) => pageById.get(id))
    .filter((p): p is Page => p !== undefined && !p.isDeleted)
    .map(pageToCard);

  // 5. 2-hop Links (outgoing links from linked pages) - grouped by source
  const twoHopSet = new Set<string>();
  const twoHopLinks: PageCard[] = [];
  const outgoingIds = new Set(allOutgoingLinks.map((o) => o.id));
  const outgoingLinksWithChildren: OutgoingLinkWithChildren[] = [];
  const outgoingLinksWithoutChildren: PageCard[] = [];

  for (const outgoing of allOutgoingLinks) {
    const outgoingPage = pageById.get(outgoing.id);
    if (!outgoingPage) {
      outgoingLinksWithoutChildren.push(outgoing);
      continue;
    }

    const secondaryLinks = extractWikiLinksFromContent(outgoingPage.content);
    const children: PageCard[] = [];

    for (const link of secondaryLinks) {
      const targetPage = pageByTitle.get(link.title.toLowerCase().trim());
      if (targetPage && targetPage.id !== pageId && !outgoingIds.has(targetPage.id)) {
        // Add to children for this source
        const alreadyInChildren = children.some((c) => c.id === targetPage.id);
        if (!alreadyInChildren) {
          children.push(pageToCard(targetPage));
        }

        // Also track globally for backward compatibility
        if (!twoHopSet.has(targetPage.id)) {
          twoHopSet.add(targetPage.id);
          twoHopLinks.push(pageToCard(targetPage));
        }
      }
    }

    if (children.length > 0) {
      outgoingLinksWithChildren.push({
        source: outgoing,
        children: children.slice(0, 5), // Limit children per source
      });
    } else {
      outgoingLinksWithoutChildren.push(outgoing);
    }
  }

  return {
    outgoingLinks: outgoingLinksWithoutChildren.slice(0, 10),
    outgoingLinksWithChildren: outgoingLinksWithChildren.slice(0, 5),
    backlinks: backlinks.slice(0, 10),
    twoHopLinks: twoHopLinks.slice(0, 10),
    ghostLinks: ghostLinks.slice(0, 5),
  };
}

/**
 * Optimized function to calculate linked pages data
 * Uses summary for title matching and fetches content only for necessary pages
 */
export function calculateLinkedPagesOptimized(
  input: CalculateLinkedPagesOptimizedInput,
): LinkedPagesData {
  const { currentPage, pageId, allPagesSummary, outgoingPages, backlinkPages, backlinkIds } = input;

  // 1. Extract WikiLinks from current page content
  const wikiLinks = extractWikiLinksFromContent(currentPage.content);
  const linkTitles = getUniqueWikiLinkTitles(wikiLinks);

  // 2. Create mappings
  const summaryByTitle = new Map(allPagesSummary.map((p) => [p.title.toLowerCase().trim(), p]));
  const summaryById = new Map(allPagesSummary.map((p) => [p.id, p]));
  const pageById = new Map(outgoingPages.map((p) => [p.id, p]));
  const backlinkPageById = new Map(backlinkPages.map((p) => [p.id, p]));

  // 3. Outgoing Links (existing pages only)
  const allOutgoingLinks: PageCard[] = [];
  const ghostLinks: string[] = [];

  for (const title of linkTitles) {
    const targetSummary = summaryByTitle.get(title.toLowerCase().trim());
    if (targetSummary && targetSummary.id !== pageId) {
      const fullPage = pageById.get(targetSummary.id);
      if (fullPage) {
        allOutgoingLinks.push(pageToCard(fullPage));
      } else {
        // Fallback to summary (no preview)
        allOutgoingLinks.push(summaryToCard(targetSummary));
      }
    } else if (!targetSummary) {
      ghostLinks.push(title);
    }
  }

  // 4. Backlinks (from links table)
  const backlinks: PageCard[] = backlinkIds
    .map((id) => {
      const fullPage = backlinkPageById.get(id);
      if (fullPage && !fullPage.isDeleted) {
        return pageToCard(fullPage);
      }
      const summary = summaryById.get(id);
      if (summary && !summary.isDeleted) {
        return summaryToCard(summary);
      }
      return null;
    })
    .filter((p): p is PageCard => p !== null);

  // 5. 2-hop Links (outgoing links from linked pages) - grouped by source
  const twoHopSet = new Set<string>();
  const twoHopLinks: PageCard[] = [];
  const outgoingIds = new Set(allOutgoingLinks.map((o) => o.id));
  const outgoingLinksWithChildren: OutgoingLinkWithChildren[] = [];
  const outgoingLinksWithoutChildren: PageCard[] = [];

  for (const outgoing of allOutgoingLinks) {
    const outgoingPage = pageById.get(outgoing.id);
    if (!outgoingPage) {
      outgoingLinksWithoutChildren.push(outgoing);
      continue;
    }

    const secondaryLinks = extractWikiLinksFromContent(outgoingPage.content);
    const children: PageCard[] = [];

    for (const link of secondaryLinks) {
      const targetSummary = summaryByTitle.get(link.title.toLowerCase().trim());
      if (targetSummary && targetSummary.id !== pageId && !outgoingIds.has(targetSummary.id)) {
        // Add to children for this source
        const alreadyInChildren = children.some((c) => c.id === targetSummary.id);
        if (!alreadyInChildren) {
          const fullPage = pageById.get(targetSummary.id);
          if (fullPage) {
            children.push(pageToCard(fullPage));
          } else {
            children.push(summaryToCard(targetSummary));
          }
        }

        // Also track globally for backward compatibility
        if (!twoHopSet.has(targetSummary.id)) {
          twoHopSet.add(targetSummary.id);
          const fullPage = pageById.get(targetSummary.id);
          if (fullPage) {
            twoHopLinks.push(pageToCard(fullPage));
          } else {
            twoHopLinks.push(summaryToCard(targetSummary));
          }
        }
      }
    }

    if (children.length > 0) {
      outgoingLinksWithChildren.push({
        source: outgoing,
        children: children.slice(0, 5), // Limit children per source
      });
    } else {
      outgoingLinksWithoutChildren.push(outgoing);
    }
  }

  return {
    outgoingLinks: outgoingLinksWithoutChildren.slice(0, 10),
    outgoingLinksWithChildren: outgoingLinksWithChildren.slice(0, 5),
    backlinks: backlinks.slice(0, 10),
    twoHopLinks: twoHopLinks.slice(0, 10),
    ghostLinks: ghostLinks.slice(0, 5),
  };
}

const emptyLinkedPagesData: LinkedPagesData = {
  outgoingLinks: [],
  outgoingLinksWithChildren: [],
  backlinks: [],
  twoHopLinks: [],
  ghostLinks: [],
};

/**
 * 公開リンク API レスポンスを `LinkedPagesData` に変換する。2-hop は提供
 * しないため `outgoingLinksWithChildren` / `twoHopLinks` は空配列で返す。
 *
 * 表示上限は `calculateLinkedPagesOptimized` と揃え、repo モード（IndexedDB
 * 経路）と UI 上のカード枚数が一致するようにする：outgoing / backlinks は
 * それぞれ 10 件、ghost は 5 件まで。サーバは既に 50 件で打ち切るが、
 * クライアント側でも明示的に slice する。
 *
 * Adapt the `/public-links` API payload to `LinkedPagesData`. The endpoint
 * does not surface 2-hop data, so `outgoingLinksWithChildren` and
 * `twoHopLinks` are returned as empty arrays.
 *
 * Display caps mirror `calculateLinkedPagesOptimized` so the repo-mode and
 * api-mode UIs render the same number of cards: outgoing / backlinks cap at
 * 10, ghosts at 5. The server already truncates at 50; the client repeats
 * the slice explicitly so the limit is documented at both layers.
 */
function apiToLinkedPagesData(resp: PagePublicLinksResponse): LinkedPagesData {
  const toCard = (r: PagePublicLinkCard): PageCard => ({
    id: r.id,
    noteId: r.note_id,
    title: r.title ?? "",
    preview: r.content_preview ?? "",
    updatedAt: new Date(r.updated_at).getTime(),
    sourceUrl: r.source_url ?? undefined,
  });
  return {
    outgoingLinks: resp.outgoing_links.slice(0, 10).map(toCard),
    outgoingLinksWithChildren: [],
    backlinks: resp.backlinks.slice(0, 10).map(toCard),
    twoHopLinks: [],
    ghostLinks: resp.ghost_links.slice(0, 5),
  };
}

/**
 * `useLinkedPages` のオプション。`mode` でデータ取得経路を切り替える。
 *
 * - `"repo"` (既定): ログイン編集者向け。IndexedDB の `StorageAdapter`
 *   から read し、`currentPage.noteId` でクライアントサイドにスコープする。
 * - `"api"`: 公開ノートを閲覧するゲスト用。`GET /api/pages/:id/public-links`
 *   を呼び、サーバが返したノートスコープ済みデータを利用する。
 *
 * Options for `useLinkedPages`. `mode` selects the data source:
 *
 * - `"repo"` (default): for signed-in editors. Reads `StorageAdapter`
 *   (IndexedDB) and filters by `currentPage.noteId` client-side.
 * - `"api"`: for guests viewing public/unlisted notes. Calls
 *   `GET /api/pages/:id/public-links`; the server already enforces the
 *   note-scope filter and returns ready-to-render cards.
 */
export interface UseLinkedPagesOptions {
  mode?: "repo" | "api";
}

/**
 * Hook to fetch linked pages data for a given page.
 *
 * OPTIMIZED (mode="repo"):
 * - Uses getPagesSummary() for title matching (no content, reduces Rows Read by ~95%)
 * - Only fetches content for outgoing link pages (needed for 2-hop calculation)
 * - Only fetches content for backlink pages (needed for preview)
 *
 * Note-scoped: link graph is restricted to pages within `currentPage.noteId`.
 * Cross-note WikiLink targets become ghost links; cross-note backlinks are
 * dropped.
 *
 * mode="api": calls `/public-links` so unauthenticated guests can render the
 * linked pages section. The server returns note-scoped cards and does not
 * include 2-hop data.
 */
export function useLinkedPages(pageId: string, options?: UseLinkedPagesOptions) {
  const mode = options?.mode ?? "repo";
  const { getRepository, userId, isLoaded } = useRepository();
  const { data: currentPage } = usePage(pageId);
  const { api } = useNoteApi();

  return useQuery({
    queryKey: [...pageKeys.all, "linkedPages", mode, userId, pageId],
    queryFn: async (): Promise<LinkedPagesData> => {
      if (mode === "api") {
        const resp = await api.getPagePublicLinks(pageId);
        return apiToLinkedPagesData(resp);
      }

      if (!currentPage) {
        return emptyLinkedPagesData;
      }

      const repo = await getRepository();

      // OPTIMIZED: Get summaries for title matching (no content)
      const allPagesSummary = await repo.getPagesSummary(userId);
      const rawBacklinkIds = await repo.getBacklinks(pageId);

      // ノートスコープ：現在のページが属するノート内のページだけを評価対象に
      // する。これにより別ノートの WikiLink は自然にゴーストへ降格し、別ノート
      // からの backlink は ID 解決に失敗して結果から落ちる。
      // Note-scoping: restrict the candidate set to pages in the current note.
      // Cross-note WikiLink targets become ghosts and cross-note backlink IDs
      // fall through during summary lookup.
      const scopedSummary = allPagesSummary.filter((p) => p.noteId === currentPage.noteId);

      // backlink ID は `links` テーブルから note 越境して返るため、scopedSummary
      // に存在する ID だけに事前フィルタする。これがないと `getPagesByIds` が
      // 別ノートのページ本体を解決し、`calculateLinkedPagesOptimized` が
      // 「Page 本体あり」を優先するロジックでクロスノート backlink を昇格させて
      // しまう（coderabbitai review on PR #915）。
      // backlink IDs come from the `links` table without a note filter. Without
      // pre-filtering here, `getPagesByIds` resolves cross-note pages and
      // `calculateLinkedPagesOptimized` (which prefers full Page over summary)
      // would surface them. Restrict to ids present in `scopedSummary` so the
      // backlink scope is enforced before hydration (coderabbitai review on
      // PR #915).
      const scopedIds = new Set(scopedSummary.map((p) => p.id));
      const backlinkIds = rawBacklinkIds.filter((id) => scopedIds.has(id));

      // Extract WikiLinks to identify which pages need full content
      const wikiLinks = extractWikiLinksFromContent(currentPage.content);
      const linkTitles = getUniqueWikiLinkTitles(wikiLinks);

      // Map titles to page IDs (scoped)
      const summaryByTitle = new Map(scopedSummary.map((p) => [p.title.toLowerCase().trim(), p]));

      // Identify outgoing page IDs (need content for 2-hop calculation)
      const outgoingPageIds: string[] = [];
      for (const title of linkTitles) {
        const summary = summaryByTitle.get(title.toLowerCase().trim());
        if (summary && summary.id !== pageId) {
          outgoingPageIds.push(summary.id);
        }
      }

      // OPTIMIZED: Only fetch content for necessary pages
      const [outgoingPages, backlinkPages] = await Promise.all([
        repo.getPagesByIds(userId, outgoingPageIds),
        repo.getPagesByIds(userId, backlinkIds),
      ]);

      return calculateLinkedPagesOptimized({
        currentPage,
        pageId,
        allPagesSummary: scopedSummary,
        outgoingPages,
        backlinkPages,
        backlinkIds,
      });
    },
    enabled: mode === "api" ? !!pageId : isLoaded && !!pageId && !!currentPage,
    staleTime: 1000 * 30, // 30 seconds
  });
}
