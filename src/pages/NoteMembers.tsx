import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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
    canManageMembers
  );

  const addMemberMutation = useAddNoteMember();
  const updateMemberRoleMutation = useUpdateNoteMemberRole();
  const removeMemberMutation = useRemoveNoteMember();

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<NoteMemberRole>("viewer");

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

  const handleUpdateMemberRole = async (
    email: string,
    role: NoteMemberRole
  ) => {
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
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          </Container>
        </main>
      </div>
    );
  }

  if (!note || !access?.canView) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">
              {t("notes.noteNotFoundOrNoAccess")}
            </p>
          </Container>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-8">
        <Container>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold truncate">{t("notes.members")}</h1>
              <p className="mt-1 text-sm text-muted-foreground truncate">
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
            <section className="mt-6 rounded-lg border border-border/60 p-4">
              <h2 className="text-sm font-semibold mb-4">{t("notes.inviteMember")}</h2>
              <div className="grid gap-3 md:grid-cols-[1fr_200px_auto]">
                <Input
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder={t("notes.emailPlaceholder")}
                />
                <Select
                  value={memberRole}
                  onValueChange={(value) =>
                    setMemberRole(value as NoteMemberRole)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("notes.role")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(memberRoleKeys) as NoteMemberRole[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(memberRoleKeys[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddMember}>{t("notes.add")}</Button>
              </div>

              <div className="mt-4 space-y-3">
                {isMembersLoading ? (
                  <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("notes.noMembersYet")}
                  </p>
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
                            handleUpdateMemberRole(
                              member.memberEmail,
                              value as NoteMemberRole
                            )
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {memberRoleOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member.memberEmail)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </Container>
      </main>
    </div>
  );
};

export default NoteMembers;
