import React from "react";
import { Link, useParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@zedi/ui";
import { useNote } from "@/hooks/useNoteQueries";
import { useTranslation } from "react-i18next";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { NoteMembersManageSection } from "./NoteMembersManageSection";
import { NoteInviteLinksSection } from "./NoteInviteLinksSection";
import { useNoteMembersController } from "./useNoteMembersController";

/**
 * ノートメンバー管理ページ。
 * Note members management page.
 *
 * - owner: 編集可（招待 / Role 変更 / 取り消し / リンク発行・取り消し）
 * - editor: read-only（メンバー一覧 + 既存リンク一覧の閲覧 + リンクのコピーは可）
 * - viewer / 非ログイン: 閲覧不可
 *
 * Owners can manage everything; editors browse the same UI in read-only mode
 * for transparency over who has access. Viewers (and unsigned users) hit the
 * "no access" branch.
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

  const isLocal = source === "local";
  const canManageMembers = Boolean(access?.canManageMembers && isLocal);
  // editor は read-only でメンバー一覧と発行済みリンクを閲覧できる。viewer は
  // プライバシー配慮で個別ページからは見せない（共有モーダルの公開設定タブ
  // 経由でアクセス手段は説明される）。
  // Editors can browse the page in read-only mode; viewers don't see this
  // page at all (privacy — they only get the visibility tab in the modal).
  const canViewAsEditor = Boolean(access?.role === "editor" && access.canView && isLocal);
  const canShowPage = canManageMembers || canViewAsEditor;
  const readOnly = !canManageMembers;

  // editor は members API を read-only で読みたい。`canManageMembers` ベースの
  // ガードだと `enabled=false` になり一覧が空になるため、ページが表示できる
  // ロール（owner / editor）であれば fetch を有効化する。
  // The `enabled` flag for `useNoteMembers` was previously gated on
  // `canManageMembers`, which would block editors. Open it up to anyone who
  // can see the page so the read-only list actually populates.
  const controller = useNoteMembersController(noteId ?? "", canShowPage);

  if (isNoteLoading) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </PageLoadingOrDenied>
    );
  }
  if (!note || !access?.canView) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("notes.noteNotFoundOrNoAccess")}</p>
      </PageLoadingOrDenied>
    );
  }

  return (
    <div className="min-h-0 flex-1 py-8">
      <Container>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{t("notes.members")}</h1>
            <p className="text-muted-foreground mt-1 truncate text-sm">
              {note.title || t("notes.untitledNote")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/notes/${note.id}`}>{t("notes.backToNote")}</Link>
          </Button>
        </div>

        {!canShowPage ? (
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
                readOnly={readOnly}
              />
            </TabsContent>
            <TabsContent value="share-links">
              <NoteInviteLinksSection
                noteId={noteId ?? ""}
                editPermission={note.editPermission}
                readOnly={readOnly}
              />
            </TabsContent>
          </Tabs>
        )}
      </Container>
    </div>
  );
};

export default NoteMembers;
