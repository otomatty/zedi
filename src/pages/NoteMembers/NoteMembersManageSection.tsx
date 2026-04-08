import { RefreshCw, Trash2, XCircle } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { NoteMemberRole, NoteMemberStatus } from "@/types/note";

/**
 * メンバー管理セクションの Props。
 * Props for the member management section.
 */
export interface NoteMembersManageSectionProps {
  members: Array<{ memberEmail: string; role: NoteMemberRole; status: NoteMemberStatus }>;
  isMembersLoading: boolean;
  memberEmail: string;
  setMemberEmail: (v: string) => void;
  memberRole: NoteMemberRole;
  setMemberRole: (v: NoteMemberRole) => void;
  roleOptions: Array<{ value: NoteMemberRole; label: string }>;
  onAddMember: () => Promise<void>;
  onUpdateRole: (email: string, role: NoteMemberRole) => Promise<void>;
  onRemoveMember: (email: string) => Promise<void>;
  onResendInvitation: (email: string) => Promise<void>;
}

/**
 * メンバー管理セクション。
 * Member management section with status badges, resend, and cancel invitation.
 */
export function NoteMembersManageSection({
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
  onResendInvitation,
}: NoteMembersManageSectionProps) {
  const { t } = useTranslation();
  return (
    <section className="border-border/60 mt-6 rounded-lg border p-4">
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
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("notes.noMembersYet")}</p>
        ) : (
          members.map((member) => {
            const isPending = member.status === "pending";
            return (
              <div
                key={member.memberEmail}
                className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-b pb-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{member.memberEmail}</span>
                  {isPending ? (
                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200 dark:hover:bg-yellow-900">
                      {t("notes.statusPending")}
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-900">
                      {t("notes.statusAccepted")}
                    </Badge>
                  )}
                </div>
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
                  {isPending && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("notes.a11yResendInvitation", { email: member.memberEmail })}
                      title={t("notes.resendInvitation")}
                      onClick={() => onResendInvitation(member.memberEmail)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      isPending
                        ? t("notes.a11yCancelInvitation", { email: member.memberEmail })
                        : t("notes.a11yRemoveMember", { email: member.memberEmail })
                    }
                    title={isPending ? t("notes.cancelInvitation") : undefined}
                    onClick={() => onRemoveMember(member.memberEmail)}
                  >
                    {isPending ? <XCircle className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
