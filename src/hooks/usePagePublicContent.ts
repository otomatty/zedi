import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useNoteApi } from "@/hooks/useNoteQueries";
import type { PagePublicContentResponse } from "@/lib/api/types";

/**
 * 公開ページ読み取り経路 `GET /api/pages/:id/public-content` を叩く共有フック。
 * `NotePagePublicView` (本文描画) と `NotePageReadOnly` (Markdown export/copy)
 * の両方が同じレスポンスを参照することで、画面に出ている本文と export 内容の
 * 食い違いを防ぐ (Codex P1: PR #893 review)。クエリキーが同一なので TanStack
 * Query 側で 1 リクエストに dedup される。
 *
 * Shared hook around `GET /api/pages/:id/public-content`. Both
 * `NotePagePublicView` (which renders the body) and `NotePageReadOnly`
 * (which feeds Markdown export / copy actions) read from the same query
 * so the displayed body and exported content can never drift apart
 * (Codex P1 review on PR #893). The shared query key lets TanStack Query
 * dedup the two consumers into a single network request.
 *
 * @param pageId - 取得対象ページ ID。空文字や falsy の場合はクエリを発火しない。
 *   Page id to fetch; falsy values disable the query.
 * @returns TanStack Query の `UseQueryResult`。`data.content_text` がプレーン
 *   テキストとして本文を保持する。
 *   `UseQueryResult` exposing `data.content_text` as plain-text body.
 */
export function usePagePublicContent(pageId: string): UseQueryResult<PagePublicContentResponse> {
  const { api } = useNoteApi();
  return useQuery({
    queryKey: ["page-public-content", pageId],
    queryFn: () => api.getPagePublicContent(pageId),
    enabled: Boolean(pageId),
    staleTime: 1000 * 60,
  });
}
