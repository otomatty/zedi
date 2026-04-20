/**
 * React Query hooks for the share-link (invite-links) flow.
 * 共有リンク（invite-links）フローの React Query フック。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api";
import type {
  CreateInviteLinkBody,
  InviteLinkPreviewResponse,
  InviteLinkRedeemResponse,
  InviteLinkRow,
} from "@/lib/api/types";

/**
 * Query key factory for share-link queries.
 * 共有リンク系クエリのキー工場。
 */
export const inviteLinkKeys = {
  all: ["invite-links"] as const,
  preview: (token: string) => [...inviteLinkKeys.all, "preview", token] as const,
  listByNote: (noteId: string) => [...inviteLinkKeys.all, "note", noteId] as const,
};

/**
 * Fetch preview info for a share link (no auth required).
 * 共有リンクのプレビュー情報を取得する（認証不要）。
 */
export function useInviteLinkPreview(token: string) {
  const api = createApiClient();
  return useQuery<InviteLinkPreviewResponse>({
    queryKey: inviteLinkKeys.preview(token),
    queryFn: () => api.getInviteLinkPreview(token),
    enabled: !!token,
    retry: false,
    staleTime: 1000 * 30,
  });
}

/**
 * Redeem a share link (auth required).
 * 共有リンクを受諾する（認証必須）。
 */
export function useRedeemInviteLink() {
  const api = createApiClient();
  return useMutation<InviteLinkRedeemResponse, Error, { token: string }>({
    mutationFn: ({ token }) => api.redeemInviteLink(token),
  });
}

/**
 * List active (non-revoked) share links for a note (owner / editor).
 * ノートの有効な共有リンク一覧を取得する（owner / editor）。
 */
export function useInviteLinksForNote(noteId: string) {
  const api = createApiClient();
  return useQuery<InviteLinkRow[]>({
    queryKey: inviteLinkKeys.listByNote(noteId),
    queryFn: () => api.listInviteLinks(noteId),
    enabled: !!noteId,
  });
}

/**
 * Create a new share link (owner only).
 * 新しい共有リンクを発行する（オーナーのみ）。
 */
export function useCreateInviteLink(noteId: string) {
  const api = createApiClient();
  const qc = useQueryClient();
  return useMutation<InviteLinkRow, Error, CreateInviteLinkBody>({
    mutationFn: (body) => api.createInviteLink(noteId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inviteLinkKeys.listByNote(noteId) });
    },
  });
}

/**
 * Revoke an existing share link (owner only).
 * 既存の共有リンクを取り消す（オーナーのみ）。
 */
export function useRevokeInviteLink(noteId: string) {
  const api = createApiClient();
  const qc = useQueryClient();
  return useMutation<{ revoked: true; revokedAt: string }, Error, { linkId: string }>({
    mutationFn: ({ linkId }) => api.revokeInviteLink(noteId, linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inviteLinkKeys.listByNote(noteId) });
    },
  });
}
