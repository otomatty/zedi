import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNoteApi } from "@/hooks/useNoteQueries";
import type { NoteTagAggregationItem, NoteTagAggregationResponse } from "@/lib/api/types";
import type { TagAggregationItem } from "@/types/tagFilter";

/**
 * フックの戻り値。`source` は表示しているデータがリモート集計 (`remote`) か、
 * フェッチ前 / オフライン時のデフォルト (`empty`) かを示す。
 *
 * Hook result. `source` reports whether the data came from the remote
 * aggregation endpoint or the empty pre-fetch / offline fallback.
 */
export interface UseNoteTagAggregationResult {
  items: TagAggregationItem[];
  noneCount: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  source: "remote" | "empty";
}

const EMPTY_RESULT: Omit<UseNoteTagAggregationResult, "isLoading" | "isError" | "source"> = {
  items: [],
  noneCount: 0,
  totalPages: 0,
};

/**
 * `GET /api/notes/:noteId/tags` を呼んで使用ページ数順のタグ一覧を取得するフック。
 *
 * Fetches the note-wide tag aggregation. Tags arrive already ordered by
 * `page_count DESC, name_lower ASC`, so consumers can iterate verbatim.
 *
 * `enabled: false` を渡すと React Query は走らず、空状態を返す。フィルタバーが
 * 非表示のときに無駄なリクエストを抑止するために使う。
 *
 * Pass `enabled: false` to skip the query (e.g. while the filter bar is
 * hidden) and receive an empty result.
 */
export function useNoteTagAggregation(
  noteId: string,
  options: { enabled?: boolean } = {},
): UseNoteTagAggregationResult {
  const { api, userId, userEmail, isLoaded } = useNoteApi();
  const enabled = (options.enabled ?? true) && isLoaded && !!noteId;

  const query = useQuery<NoteTagAggregationResponse, Error>({
    queryKey: ["note-tag-aggregation", noteId, userId, userEmail ?? ""],
    queryFn: () => api.getNoteTags(noteId),
    enabled,
    // タグエッジ追加・ページ追加でサーバ ETag が変わるため、stale はやや長めで
    // 十分。30 秒間は再フェッチを抑止し、フィルタ操作のたびに往復しないようにする。
    // 30 s staleness is fine: server ETag bumps on tag / page mutations
    // anyway, and this avoids re-fetching on every chip click.
    staleTime: 30 * 1000,
  });

  return useMemo<UseNoteTagAggregationResult>(() => {
    if (!query.data) {
      return {
        ...EMPTY_RESULT,
        isLoading: query.isLoading,
        isError: query.isError,
        source: "empty",
      };
    }
    return {
      items: query.data.items.map(apiItemToTagAggregation),
      noneCount: query.data.none_count,
      totalPages: query.data.total_pages,
      isLoading: query.isLoading,
      isError: query.isError,
      source: "remote",
    };
  }, [query.data, query.isLoading, query.isError]);
}

function apiItemToTagAggregation(item: NoteTagAggregationItem): TagAggregationItem {
  return {
    name: item.name,
    nameLower: item.name_lower,
    pageCount: item.page_count,
    resolved: item.resolved,
  };
}
