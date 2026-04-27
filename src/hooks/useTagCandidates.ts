import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRepository } from "@/hooks/usePageQueries";
import { useWikiLinkCandidates } from "@/hooks/useWikiLinkCandidates";

/**
 * タグサジェスト用 1 候補。`exists` はクエリ時点でスコープ内に同名ページが
 * 存在するかを示す（true なら確定時の `tag` Mark に `exists: true` を付け、
 * `targetId` も解決済みの値で埋める）。
 *
 * One tag suggestion candidate. `exists` reports whether the current scope
 * contains a page named after the tag at the time of the query — when true
 * the host applies the `tag` Mark with `exists: true` and a resolved
 * `targetId`. See issue #767 (Phase 2).
 */
export interface TagSuggestionCandidate {
  /** Display + insertion name (no leading `#`). 表示と挿入に使う名前。 */
  name: string;
  /** 同名ページがスコープ内にあるか / a page with this name exists in scope */
  exists: boolean;
  /**
   * 解決済みのターゲットページ id（`exists === true` のときのみ非 null）。
   * Resolved target page id (non-null only when `exists === true`).
   */
  targetId: string | null;
}

/**
 * 候補ソースを統合した結果。`candidates` は重複排除済み（大文字小文字無視）。
 * Aggregated candidate list with case-insensitive de-duplication.
 */
export interface UseTagCandidatesResult {
  candidates: TagSuggestionCandidate[];
  isLoading: boolean;
}

/**
 * タグサジェストの候補を集約する。Phase 2 では候補ソースを 2 系統用意する:
 *
 * 1. 現スコープ（個人 or 同一ノート）のページタイトル — `useWikiLinkCandidates`
 *    と同じ名前空間。タイトルがそのままタグ名として使える。
 * 2. 既出タグ名（ゴースト側）— 他ページで `#name` として登場している未解決の
 *    タグを `getGhostLinks` から `linkType === 'tag'` でフィルタして取得する。
 *    既存ページで実体化済みのタグは 1) で網羅されるため、ここでは未解決分のみ
 *    を補う。
 *
 * 結果は大文字小文字を無視して重複排除し、ページタイトル経由のものは
 * `exists: true` + `targetId` 入りで返す（確定時にそのまま `tag` Mark の属性に
 * 反映できる）。`/api/tags` を新設する案は issue #767 の out-of-scope。
 *
 * Aggregates tag suggestion candidates from two sources for Phase 2 (issue
 * #767). 1) Page titles in the current scope (same namespace as
 * `useWikiLinkExistsChecker`). 2) Existing tag names that show up only in
 * `ghost_links` with `linkType === 'tag'` (resolved tags are already covered
 * by 1)). Results are case-insensitively de-duplicated; page-title hits keep
 * their resolved `targetId` so the host can populate the `tag` Mark on
 * confirm without an extra round-trip.
 *
 * @param pageNoteId - 編集中ページの noteId（個人スコープなら `null`）。
 *   Owning note id of the page being edited (`null` = personal scope).
 */
export function useTagCandidates(pageNoteId: string | null | undefined): UseTagCandidatesResult {
  const { pages, isLoading: isPagesLoading } = useWikiLinkCandidates(pageNoteId);
  const { getRepository, userId, isLoaded } = useRepository();

  // ゴーストタグは別クエリで取得してキャッシュする。pageNoteId をキーに含めて
  // ノート切替時に再フェッチさせる。Ghost タグは「他ページで未解決のまま使われ
  // ているタグ」を補完するための補助情報なので、ロード遅延は致命的ではない。
  // Ghost tags are loaded in a separate, cached query keyed by pageNoteId so
  // switching scope re-fetches. They're a secondary input, so being slightly
  // late is acceptable (the popover still works with page titles alone).
  const ghostTagsQuery = useQuery({
    queryKey: ["tag-candidates", "ghost", userId, pageNoteId ?? null],
    queryFn: async (): Promise<string[]> => {
      const repo = await getRepository();
      const all = await repo.getGhostLinks(userId);
      return all
        .filter((g) => g.linkType === "tag")
        .map((g) => g.linkText.trim())
        .filter((t): t is string => t.length > 0);
    },
    enabled: isLoaded,
    staleTime: 1000 * 30, // 30s — popover use case tolerates short staleness
  });

  return useMemo<UseTagCandidatesResult>(() => {
    const seen = new Set<string>();
    const candidates: TagSuggestionCandidate[] = [];

    for (const page of pages) {
      if (page.isDeleted) continue;
      const trimmed = page.title.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ name: trimmed, exists: true, targetId: page.id });
    }

    for (const name of ghostTagsQuery.data ?? []) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ name, exists: false, targetId: null });
    }

    return {
      candidates,
      isLoading: isPagesLoading || ghostTagsQuery.isLoading,
    };
  }, [pages, ghostTagsQuery.data, ghostTagsQuery.isLoading, isPagesLoading]);
}
