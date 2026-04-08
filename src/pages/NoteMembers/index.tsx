import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Container from "@/components/layout/Container";
import { Button, useToast } from "@zedi/ui";
import {
  useAddNoteMember,
  useNote,
  useNoteMembers,
  useRemoveNoteMember,
  useResendInvitation,
  useUpdateNoteMemberRole,
} from "@/hooks/useNoteQueries";
import type { NoteMemberRole } from "@/types/note";
import { useTranslation } from "react-i18next";
import { memberRoleKeys } from "./noteMembersConfig";
import { NoteMembersLoadingOrDenied } from "./NoteMembersLoadingOrDenied";
import { NoteMembersManageSection } from "./NoteMembersManageSection";

/**
 *
 */
const NoteMembers: React.FC = () => {
  const { t } = useTranslation();
  const { noteId } = useParams<{ noteId: string }>();
  const { toast } = useToast();

  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const canManageMembers = Boolean(access?.canManageMembers && source === "local");
  const { data: members = [], isLoading: isMembersLoading } = useNoteMembers(
    noteId ?? "",
    canManageMembers,
  );

  const addMemberMutation = useAddNoteMember();
  const updateMemberRoleMutation = useUpdateNoteMemberRole();
  const removeMemberMutation = useRemoveNoteMember();
  const resendInvitationMutation = useResendInvitation();

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<NoteMemberRole>("viewer");
  const memberRoleOptions = (Object.keys(memberRoleKeys) as NoteMemberRole[]).map((value) => ({
    value,
    label: t(memberRoleKeys[value]),
  }));

  const handleAddMember = async () => {
    if (!noteId || !memberEmail.trim()) return;
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
  };

  const handleUpdateMemberRole = async (email: string, role: NoteMemberRole) => {
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
  };

  const handleRemoveMember = async (email: string) => {
    if (!noteId) return;
    try {
      await removeMemberMutation.mutateAsync({ noteId, memberEmail: email });
      toast({ title: t("notes.memberRemoved") });
    } catch (error) {
      console.error("Failed to remove member:", error);
      toast({ title: t("notes.memberRemoveFailed"), variant: "destructive" });
    }
  };

  const handleResendInvitation = async (email: string) => {
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
  };

  if (isNoteLoading) {
    return (
      <NoteMembersLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </NoteMembersLoadingOrDenied>
    );
  }
  if (!note || !access?.canView) {
    return (
      <NoteMembersLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("notes.noteNotFoundOrNoAccess")}</p>
      </NoteMembersLoadingOrDenied>
    );
  }

  return (
    <AppLayout>
      <main className="min-h-0 flex-1 overflow-y-auto py-8">
        <Container>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{t("notes.members")}</h1>
              <p className="text-muted-foreground mt-1 truncate text-sm">
                {note.title || t("notes.untitledNote")}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/note/${note.id}`}>{t("notes.backToNote")}</Link>
            </Button>
          </div>

          {!canManageMembers ? (
            <p className="text-muted-foreground mt-6 text-sm">
              {t("notes.noPermissionToManageMembers")}
            </p>
          ) : (
            <NoteMembersManageSection
              members={members}
              isMembersLoading={isMembersLoading}
              memberEmail={memberEmail}
              setMemberEmail={setMemberEmail}
              memberRole={memberRole}
              setMemberRole={setMemberRole}
              roleOptions={memberRoleOptions}
              onAddMember={handleAddMember}
              onUpdateRole={handleUpdateMemberRole}
              onRemoveMember={handleRemoveMember}
              onResendInvitation={handleResendInvitation}
            />
          )}
        </Container>
      </main>
    </AppLayout>
  );
};

export default NoteMembers;
