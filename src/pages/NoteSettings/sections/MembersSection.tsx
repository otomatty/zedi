import React from "react";
import { useTranslation } from "react-i18next";
import { NoteMembersManageSection } from "@/pages/NoteMembers/NoteMembersManageSection";
import { useNoteMembersController } from "@/pages/NoteMembers/useNoteMembersController";
import { useNoteSettingsContext } from "../NoteSettingsContext";

/**
 * `/notes/:noteId/settings/members` — メンバー招待・ロール変更・削除セクション。
 *
 * 旧 `/notes/:noteId/members` ページの中身（招待フォーム + 一覧）をそのまま
 * 設定画面の 1 セクションとして取り込んだもの。フェッチは
 * `useNoteMembersController` がそのまま面倒を見るので、レイアウト側で
 * 二重に取得することは無い。
 *
 * Members management section. Inlines the legacy `/notes/:noteId/members`
 * page UI (`NoteMembersManageSection`) under the settings layout. The
 * controller hook still owns its own React Query lifecycle, so layout
 * de-duplication is not required.
 */
const MembersSection: React.FC = () => {
  const { t } = useTranslation();
  const { note, canManage, canViewAsEditor } = useNoteSettingsContext();
  const canShow = canManage || canViewAsEditor;
  const readOnly = !canManage;
  const controller = useNoteMembersController(note.id, canShow);

  if (!canShow) {
    return (
      <p className="text-muted-foreground text-sm">{t("notes.noPermissionToManageMembers")}</p>
    );
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">{t("notes.settingsNav.members")}</h2>
        <p className="text-muted-foreground text-xs">{t("notes.membersSectionDescription")}</p>
      </header>
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
    </div>
  );
};

export default MembersSection;
