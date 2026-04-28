import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@zedi/ui";
import { NoteMembersManageSection } from "@/pages/NoteMembers/NoteMembersManageSection";
import { useNoteMembersController } from "@/pages/NoteMembers/useNoteMembersController";

/**
 * メンバータブの Props。
 * Props for the members tab.
 */
export interface ShareModalMembersTabProps {
  noteId: string;
  enabled: boolean;
  onNavigate?: () => void;
  /**
   * read-only 表示にするか。editor 用にメンバー一覧だけ閲覧させたいときに `true` を渡す。
   * Render the section read-only (used for editors who can browse the member
   * list but cannot mutate it).
   */
  readOnly?: boolean;
}

/**
 * 共有モーダルのメンバータブ。既存のメンバー管理セクションを埋め込みで再利用する。
 * read-only モードのとき、フルメンバーページへのリンクは出さず（その先も
 * editor 用 read-only ページに遷移できるが UI を簡素化するため）、招待 UI / 操作
 * ボタンは下層で隠す。
 *
 * Members tab inside the share modal. Reuses `NoteMembersManageSection` and
 * offers a link to the full members page for owners. In read-only mode we skip
 * that footer link to keep the UI focused on browsing the list.
 */
export function ShareModalMembersTab({
  noteId,
  enabled,
  onNavigate,
  readOnly = false,
}: ShareModalMembersTabProps) {
  const { t } = useTranslation();
  const controller = useNoteMembersController(noteId, enabled);

  return (
    <div>
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
      {!readOnly ? (
        <div className="mt-3 flex justify-end">
          <Button asChild variant="link" size="sm" onClick={onNavigate}>
            <Link to={`/notes/${noteId}/members`}>
              <ExternalLink className="mr-1 h-3 w-3" />
              {t("notes.shareOpenMembersPage")}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
