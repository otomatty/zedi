import React from "react";
import { useTranslation } from "react-i18next";
import { NoteInviteLinksSection } from "@/pages/NoteMembers/NoteInviteLinksSection";
import { useNoteSettingsContext } from "../NoteSettingsContext";

/**
 * `/notes/:noteId/settings/links` — 共有招待リンクの発行・取り消しセクション。
 *
 * 既存の `NoteInviteLinksSection`（旧 ShareModal のリンクタブと同じ実装を
 * 共有）をそのまま 1 セクションとして埋め込む。owner は発行・取り消し可、
 * editor は発行済みリンクの read-only 閲覧のみ。
 *
 * Invite-links section. Reuses `NoteInviteLinksSection` (the same component
 * the old share modal used). Owners can create / revoke; editors browse
 * existing links read-only.
 */
const LinksSection: React.FC = () => {
  const { t } = useTranslation();
  const { note, canManage, canViewAsEditor } = useNoteSettingsContext();
  const canShow = canManage || canViewAsEditor;
  const readOnly = !canManage;

  if (!canShow) {
    return (
      <p className="text-muted-foreground text-sm">{t("notes.noPermissionToManageMembers")}</p>
    );
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">{t("notes.settingsNav.links")}</h2>
        <p className="text-muted-foreground text-xs">{t("notes.linksSectionDescription")}</p>
      </header>
      <NoteInviteLinksSection
        noteId={note.id}
        editPermission={note.editPermission}
        readOnly={readOnly}
      />
    </div>
  );
};

export default LinksSection;
