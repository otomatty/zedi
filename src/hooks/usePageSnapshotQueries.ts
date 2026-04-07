/**
 * ページスナップショット（バージョン履歴）用の React Query フック
 * React Query hooks for page snapshots (version history)
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api";
import type { PageSnapshot, PageSnapshotDetail } from "@/types/pageSnapshot";
import type { SnapshotListItem } from "@/lib/api/types";

export /**
 *
 */
const snapshotKeys = {
  all: ["pageSnapshots"] as const,
  lists: () => [...snapshotKeys.all, "list"] as const,
  list: (pageId: string) => [...snapshotKeys.lists(), pageId] as const,
  details: () => [...snapshotKeys.all, "detail"] as const,
  detail: (pageId: string, snapshotId: string) =>
    [...snapshotKeys.details(), pageId, snapshotId] as const,
};

/**
 * API レスポンスをフロント型に変換する
 * Convert API response to frontend type
 */
function apiSnapshotToSnapshot(item: SnapshotListItem): PageSnapshot {
  return {
    id: item.id,
    version: item.version,
    contentText: item.content_text,
    createdBy: item.created_by,
    createdByEmail: item.created_by_email,
    trigger: item.trigger,
    createdAt: item.created_at,
  };
}

/**
 * スナップショット一覧を取得する
 * Fetch the list of snapshots for a page
 */
export function usePageSnapshots(pageId: string) {
  const api = createApiClient();
  return useQuery({
    queryKey: snapshotKeys.list(pageId),
    queryFn: async (): Promise<PageSnapshot[]> => {
      const res = await api.getPageSnapshots(pageId);
      return res.snapshots.map(apiSnapshotToSnapshot);
    },
    enabled: !!pageId,
  });
}

/**
 * スナップショット詳細（Y.Doc 含む）を取得する
 * Fetch snapshot detail with Y.Doc state
 */
export function usePageSnapshot(pageId: string, snapshotId: string | null) {
  const api = createApiClient();
  return useQuery({
    queryKey: snapshotKeys.detail(pageId, snapshotId ?? ""),
    queryFn: async (): Promise<PageSnapshotDetail> => {
      if (!snapshotId) throw new Error("unreachable: snapshotId is null");
      const res = await api.getPageSnapshot(pageId, snapshotId);
      return {
        id: res.id,
        version: res.version,
        ydocState: res.ydoc_state,
        contentText: res.content_text,
        createdBy: res.created_by,
        createdByEmail: res.created_by_email,
        trigger: res.trigger,
        createdAt: res.created_at,
      };
    },
    enabled: !!pageId && !!snapshotId,
  });
}

/**
 * スナップショットを復元する（新バージョンとして）
 * Restore a snapshot as a new version
 */
export function useRestorePageSnapshot(pageId: string) {
  const api = createApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      return api.restorePageSnapshot(pageId, snapshotId);
    },
    onSuccess: () => {
      // スナップショット一覧を再取得 / Refetch snapshot list
      queryClient.invalidateQueries({ queryKey: snapshotKeys.list(pageId) });
      // ページコンテンツ関連のキャッシュも無効化 / Invalidate page content caches
      queryClient.invalidateQueries({ queryKey: ["pageContent", pageId] });
    },
  });
}
