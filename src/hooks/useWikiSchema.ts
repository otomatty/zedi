/**
 * Hook for fetching and updating the user's wiki schema ("constitution") page.
 * ユーザーの Wiki スキーマ（「憲法」）ページの取得・更新フック。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

/**
 * Response shape from GET /api/wiki-schema.
 * GET /api/wiki-schema のレスポンス型。
 */
export interface WikiSchemaData {
  pageId: string;
  title: string;
  content: string;
}

/**
 * Builds a per-user React Query cache key for the wiki schema.
 * ユーザーごとに分離されたキャッシュキーを構築する。
 *
 * Using a static key would let one user's schema bleed into another user's
 * session after a logout/login until refetch finishes (and `setQueryData`
 * would write back into the shared slot).
 * 静的キーだと再フェッチ完了までユーザー間でデータが見える可能性があるため、
 * userId を含めて分離する。
 */
function getWikiSchemaKey(userId: string | undefined) {
  return ["wiki-schema", userId ?? "anonymous"] as const;
}

/**
 * Fetches the wiki schema page text from the API.
 * API から Wiki スキーマページテキストを取得する。
 */
async function fetchWikiSchema(): Promise<WikiSchemaData | null> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
  const res = await fetch(`${baseUrl}/api/wiki-schema`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch wiki schema: ${res.status}`);
  return res.json() as Promise<WikiSchemaData>;
}

/**
 * Updates (upsert) the wiki schema page.
 * Wiki スキーマページを更新（upsert）する。
 */
async function updateWikiSchema(body: {
  title?: string;
  content: string;
}): Promise<WikiSchemaData> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
  const res = await fetch(`${baseUrl}/api/wiki-schema`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update wiki schema: ${res.status}`);
  return res.json() as Promise<WikiSchemaData>;
}

/**
 * React Query hook for the user's wiki schema page.
 * ユーザーの Wiki スキーマページ用 React Query フック。
 *
 * @returns `{ data, isLoading, error, updateSchema }` — data is null when no schema exists yet.
 */
export function useWikiSchema() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = getWikiSchemaKey(user?.id);

  const query = useQuery({
    queryKey,
    queryFn: fetchWikiSchema,
    enabled: !!user,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: updateWikiSchema,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  return {
    /** Current schema data (null if none exists). / 現スキーマデータ（未設定なら null）。 */
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    /** Create or update the schema page. / スキーマページを作成・更新する。 */
    updateSchema: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}
