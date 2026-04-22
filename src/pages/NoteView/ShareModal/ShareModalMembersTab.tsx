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
}

/**
 * 共有モーダルのメンバータブ。既存のメンバー管理セクションを埋め込みで再利用する。
 * Members tab inside the share modal. Reuses `NoteMembersManageSection` and
 * offers a link to the full members management page for bulk operations.
 */
export function ShareModalMembersTab({ noteId, enabled, onNavigate }: ShareModalMembersTabProps) {
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
      />
      <div className="mt-3 flex justify-end">
        <Button asChild variant="link" size="sm" onClick={onNavigate}>
          <Link to={`/notes/${noteId}/members`}>
            <ExternalLink className="mr-1 h-3 w-3" />
            {t("notes.shareOpenMembersPage")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
