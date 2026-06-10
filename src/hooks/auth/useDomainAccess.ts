/**
 * React Query hooks for the note domain-access flow (epic #657 / issue #663).
 * ノートのドメイン招待 (note_domain_access) フローの React Query フック。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api";
import type { CreateDomainAccessBody, DomainAccessRow } from "@/lib/api/types";

/**
 * Query key factory for domain-access queries.
 * ドメイン招待系クエリのキー工場。
 */
export const domainAccessKeys = {
  all: ["domain-access"] as const,
  listByNote: (noteId: string) => [...domainAccessKeys.all, "note", noteId] as const,
};

/**
 * List domain-access rules for a note (owner / editor).
 * ノートのドメインルール一覧を取得する（owner / editor）。
 */
export function useDomainAccessForNote(noteId: string, enabled = true) {
  const api = createApiClient();
  return useQuery<DomainAccessRow[]>({
    queryKey: domainAccessKeys.listByNote(noteId),
    queryFn: () => api.listDomainAccess(noteId),
    enabled: enabled && !!noteId,
  });
}

/**
 * Create a new domain-access rule (owner only). Free-email providers are
 * rejected by the server with HTTP 400.
 * ドメインルールを追加する（オーナーのみ）。フリーメール (gmail.com 等) は
 * サーバーが 400 で拒否する。
 */
export function useCreateDomainAccess(noteId: string) {
  const api = createApiClient();
  const qc = useQueryClient();
  return useMutation<DomainAccessRow, Error, CreateDomainAccessBody>({
    mutationFn: (body) => api.createDomainAccess(noteId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: domainAccessKeys.listByNote(noteId) });
    },
  });
}

/**
 * Delete an existing domain-access rule (owner only). The effect is immediate;
 * any user who was relying on this rule loses access on their next request.
 * ドメインルールを削除する（オーナーのみ）。削除は即座に反映され、その
 * ドメインに依存していたアクセスは次回リクエストから失効する。
 */
export function useDeleteDomainAccess(noteId: string) {
  const api = createApiClient();
  const qc = useQueryClient();
  return useMutation<{ removed: true; id: string }, Error, { accessId: string }>({
    mutationFn: ({ accessId }) => api.deleteDomainAccess(noteId, accessId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: domainAccessKeys.listByNote(noteId) });
    },
  });
}
