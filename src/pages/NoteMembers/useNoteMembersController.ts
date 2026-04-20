import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import {
  useAddNoteMember,
  useNoteMembers,
  useRemoveNoteMember,
  useResendInvitation,
  useUpdateNoteMemberRole,
} from "@/hooks/useNoteQueries";
import type { NoteMember, NoteMemberRole } from "@/types/note";
import { memberRoleKeys } from "./noteMembersConfig";

/**
 * メンバー管理セクションの状態・ハンドラをまとめる Controller hook。
 * 同じロジックをノートメンバーページと共有モーダル両方で使いまわすための抽出。
 *
 * Controller hook that owns the state and handlers for the member management
 * section. Extracted so the note-members page and the share modal share the
 * same behavior.
 */
export interface NoteMembersController {
  members: NoteMember[];
  isMembersLoading: boolean;
  memberEmail: string;
  setMemberEmail: (v: string) => void;
  memberRole: NoteMemberRole;
  setMemberRole: (v: NoteMemberRole) => void;
  roleOptions: Array<{ value: NoteMemberRole; label: string }>;
  handleAddMember: () => Promise<void>;
  handleUpdateMemberRole: (email: string, role: NoteMemberRole) => Promise<void>;
  handleRemoveMember: (email: string) => Promise<void>;
  handleResendInvitation: (email: string) => Promise<void>;
}

/**
 * ノートメンバー管理の状態・ハンドラを返す Controller hook。
 * Returns state and handlers for the member management section.
 *
 * @param noteId - 対象ノート ID / Target note id
 * @param enabled - メンバー取得 query の有効化 / Whether to fetch members
 */
export function useNoteMembersController(noteId: string, enabled: boolean): NoteMembersController {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: members = [], isLoading: isMembersLoading } = useNoteMembers(noteId, enabled);

  const addMemberMutation = useAddNoteMember();
  const updateMemberRoleMutation = useUpdateNoteMemberRole();
  const removeMemberMutation = useRemoveNoteMember();
  const resendInvitationMutation = useResendInvitation();

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<NoteMemberRole>("viewer");

  const roleOptions = useMemo(
    () =>
      (Object.keys(memberRoleKeys) as NoteMemberRole[]).map((value) => ({
        value,
        label: t(memberRoleKeys[value]),
      })),
    [t],
  );

  const handleAddMember = useCallback(async () => {
    if (!noteId || !memberEmail.trim() || addMemberMutation.isPending) return;
    try {
      await addMemberMutation.mutateAsync({
        noteId,
        memberEmail: memberEmail.trim(),
        role: memberRole,
      });
      setMemberEmail("");
      setMemberRole("viewer");
      toast({ title: t("notes.memberAdded") });
    } catch (error) {
      console.error("Failed to add member:", error);
      toast({ title: t("notes.memberAddFailed"), variant: "destructive" });
    }
  }, [noteId, memberEmail, memberRole, addMemberMutation, toast, t]);

  const handleUpdateMemberRole = useCallback(
    async (email: string, role: NoteMemberRole) => {
      if (!noteId) return;
      try {
        await updateMemberRoleMutation.mutateAsync({
          noteId,
          memberEmail: email,
          role,
        });
        toast({ title: t("notes.roleUpdated") });
      } catch (error) {
        console.error("Failed to update member role:", error);
        toast({ title: t("notes.roleUpdateFailed"), variant: "destructive" });
      }
    },
    [noteId, updateMemberRoleMutation, toast, t],
  );

  const handleRemoveMember = useCallback(
    async (email: string) => {
      if (!noteId) return;
      try {
        await removeMemberMutation.mutateAsync({ noteId, memberEmail: email });
        toast({ title: t("notes.memberRemoved") });
      } catch (error) {
        console.error("Failed to remove member:", error);
        toast({ title: t("notes.memberRemoveFailed"), variant: "destructive" });
      }
    },
    [noteId, removeMemberMutation, toast, t],
  );

  const handleResendInvitation = useCallback(
    async (email: string) => {
      if (!noteId) return;
      try {
        const result = await resendInvitationMutation.mutateAsync({ noteId, memberEmail: email });
        if (result.resent) {
          toast({ title: t("notes.resendInvitationSuccess") });
        } else {
          toast({ title: t("notes.resendInvitationFailed"), variant: "destructive" });
        }
      } catch (error) {
        console.error("Failed to resend invitation:", error);
        toast({ title: t("notes.resendInvitationFailed"), variant: "destructive" });
      }
    },
    [noteId, resendInvitationMutation, toast, t],
  );

  return useMemo(
    () => ({
      members,
      isMembersLoading,
      memberEmail,
      setMemberEmail,
      memberRole,
      setMemberRole,
      roleOptions,
      handleAddMember,
      handleUpdateMemberRole,
      handleRemoveMember,
      handleResendInvitation,
    }),
    [
      members,
      isMembersLoading,
      memberEmail,
      memberRole,
      roleOptions,
      handleAddMember,
      handleUpdateMemberRole,
      handleRemoveMember,
      handleResendInvitation,
    ],
  );
}
