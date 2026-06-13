/**
 * React Query hooks for the invitation acceptance flow.
 * 招待受諾フローの React Query フック。
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api";
import type {
  InvitationInfoResponse,
  AcceptInvitationResponse,
  SendInvitationEmailLinkResponse,
} from "@/lib/api/types";

/** Query key factory for invitation queries. */
export const invitationKeys = {
  all: ["invitation"] as const,
  detail: (token: string) => [...invitationKeys.all, token] as const,
};

/**
 * Fetch invitation info by token (no auth required).
 * トークンで招待情報を取得する（認証不要）。
 */
export function useInvitation(token: string) {
  const api = createApiClient();

  return useQuery<InvitationInfoResponse>({
    queryKey: invitationKeys.detail(token),
    queryFn: () => api.getInvitation(token),
    enabled: !!token,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Accept an invitation (auth required).
 * 招待を承認する（認証必須）。
 */
export function useAcceptInvitation() {
  const api = createApiClient();

  return useMutation<AcceptInvitationResponse, Error, { token: string }>({
    mutationFn: ({ token }) => api.acceptInvitation(token),
  });
}

/**
 * Request a rescue magic link sent to the invited email address.
 * 招待先メール宛にマジックリンクを送るよう依頼する。
 *
 * Used by the email-mismatch branch of the invitation page when the signed-in
 * account differs from the invited address.
 */
export function useSendInvitationEmailLink() {
  const api = createApiClient();

  return useMutation<SendInvitationEmailLinkResponse, Error, { token: string }>({
    mutationFn: ({ token }) => api.sendInvitationEmailLink(token),
  });
}
