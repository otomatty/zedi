import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@zedi/ui";
import { useToast } from "@zedi/ui";
import {
  useAddNoteMember,
  useNote,
  useNoteMembers,
  useRemoveNoteMember,
  useUpdateNoteMemberRole,
} from "@/hooks/useNoteQueries";
import type { NoteMemberRole } from "@/types/note";
import { useTranslation } from "react-i18next";

const memberRoleKeys: Record<NoteMemberRole, string> = {
  viewer: "notes.roleViewer",
  editor: "notes.roleEditor",
};

function NoteMembersLoadingOrDenied({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-10">
        <Container>{children}</Container>
      </main>
    </div>
  );
}

interface NoteMembersManageSectionProps {
  members: Array<{ memberEmail: string; role: NoteMemberRole }>;
  isMembersLoading: boolean;
  memberEmail: string;
  setMemberEmail: (v: string) => void;
  memberRole: NoteMemberRole;
  setMemberRole: (v: NoteMemberRole) => void;
  roleOptions: Array<{ value: NoteMemberRole; label: string }>;
  onAddMember: () => Promise<void>;
  onUpdateRole: (email: string, role: NoteMemberRole) => Promise<void>;
  onRemoveMember: (email: string) => Promise<void>;
}

function NoteMembersManageSection({
  members,
  isMembersLoading,
  memberEmail,
  setMemberEmail,
  memberRole,
  setMemberRole,
  roleOptions,
  onAddMember,
  onUpdateRole,
  onRemoveMember,
}: NoteMembersManageSectionProps) {
  const { t } = useTranslation();
  return (
    <section className="mt-6 rounded-lg border border-border/60 p-4">
      <h2 className="mb-4 text-sm font-semibold">{t("notes.inviteMember")}</h2>
      <div className="grid gap-3 md:grid-cols-[1fr_200px_auto]">
        <Input
          value={memberEmail}
          onChange={(event) => setMemberEmail(event.target.value)}
          placeholder={t("notes.emailPlaceholder")}
        />
        <Select
          value={memberRole}
          onValueChange={(value) => setMemberRole(value as NoteMemberRole)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("notes.role")} />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onAddMember}>{t("notes.add")}</Button>
      </div>
      <div className="mt-4 space-y-3">
        {isMembersLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("notes.noMembersYet")}</p>
        ) : (
          members.map((member) => (
            <div
              key={member.memberEmail}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-2"
            >
              <div className="text-sm">{member.memberEmail}</div>
              <div className="flex items-center gap-2">
                <Select
                  value={member.role}
                  onValueChange={(value) =>
                    onUpdateRole(member.memberEmail, value as NoteMemberRole)
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveMember(member.memberEmail)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

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

  if (isNoteLoading) {
    return (
      <NoteMembersLoadingOrDenied>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </NoteMembersLoadingOrDenied>
    );
  }
  if (!note || !access?.canView) {
    return (
      <NoteMembersLoadingOrDenied>
        <p className="text-sm text-muted-foreground">{t("notes.noteNotFoundOrNoAccess")}</p>
      </NoteMembersLoadingOrDenied>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-8">
        <Container>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{t("notes.members")}</h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {note.title || t("notes.untitledNote")}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/note/${note.id}`}>{t("notes.backToNote")}</Link>
            </Button>
          </div>

          {!canManageMembers ? (
            <p className="mt-6 text-sm text-muted-foreground">
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
            />
          )}
        </Container>
      </main>
    </div>
  );
};

export default NoteMembers;
