import React from "react";
import { Link, useParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@zedi/ui";
import { useNote } from "@/hooks/useNoteQueries";
import { useTranslation } from "react-i18next";
import { NoteMembersLoadingOrDenied } from "./NoteMembersLoadingOrDenied";
import { NoteMembersManageSection } from "./NoteMembersManageSection";
import { NoteInviteLinksSection } from "./NoteInviteLinksSection";
import { useNoteMembersController } from "./useNoteMembersController";

/**
 *
 */
const NoteMembers: React.FC = () => {
  const { t } = useTranslation();
  const { noteId } = useParams<{ noteId: string }>();

  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const canManageMembers = Boolean(access?.canManageMembers && source === "local");

  const controller = useNoteMembersController(noteId ?? "", canManageMembers);

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
          <Tabs defaultValue="members" className="mt-6">
            <TabsList>
              <TabsTrigger value="members">{t("notes.membersTabMembers")}</TabsTrigger>
              <TabsTrigger value="share-links">{t("notes.membersTabShareLinks")}</TabsTrigger>
            </TabsList>
            <TabsContent value="members">
              <NoteMembersManageSection
                members={controller.members}
                isMembersLoading={controller.isMembersLoading}
                memberEmail={controller.memberEmail}
                setMemberEmail={controller.setMemberEmail}
                memberRole={controller.memberRole}
                setMemberRole={controller.setMemberRole}
                roleOptions={controller.roleOptions}
                onAddMember={controller.handleAddMember}
                onUpdateRole={controller.handleUpdateMemberRole}
                onRemoveMember={controller.handleRemoveMember}
                onResendInvitation={controller.handleResendInvitation}
              />
            </TabsContent>
            <TabsContent value="share-links">
              <NoteInviteLinksSection noteId={noteId ?? ""} />
            </TabsContent>
          </Tabs>
        )}
      </Container>
    </main>
  );
};

export default NoteMembers;
