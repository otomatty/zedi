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
import type { NoteMemberInvitation, NoteMemberRole, NoteMemberStatus } from "@/types/note";

/**
 * バッジ表示時の派生状態。
 * Derived badge variant (invitation lifecycle + legacy statuses).
 */
type BadgeVariant = "pending" | "expired" | "accepted" | "declined";

/**
 * バッジ派生状態ごとの Tailwind クラス。
 * Tailwind classes per derived badge variant.
 */
const badgeStyles: Record<BadgeVariant, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  expired: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  declined: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * 招待行から派生するバッジ状態を決定する。
 * Decide the badge variant from status + invitation expiry.
 */
function deriveBadgeVariant(
  status: NoteMemberStatus,
  invitation: NoteMemberInvitation | null,
  nowMs: number,
): BadgeVariant {
  if (status === "accepted") return "accepted";
  if (status === "declined") return "declined";
  if (invitation && invitation.expiresAt <= nowMs) return "expired";
  return "pending";
}

/**
 * 直近送信からの経過時間を i18n キーと値で返す。
 * Pick the appropriate "sent N ago" i18n key based on elapsed time.
 */
function formatSentAgo(
  t: (key: string, opts?: Record<string, unknown>) => string,
  lastEmailSentAt: number | null,
  nowMs: number,
): string | null {
  if (lastEmailSentAt === null) return null;
  const elapsed = Math.max(0, nowMs - lastEmailSentAt);
  if (elapsed < MS_PER_MINUTE) return t("notes.invitationSentJustNow");
  if (elapsed < MS_PER_HOUR) {
    return t("notes.invitationSentMinutesAgo", { count: Math.floor(elapsed / MS_PER_MINUTE) });
  }
  if (elapsed < MS_PER_DAY) {
    return t("notes.invitationSentHoursAgo", { count: Math.floor(elapsed / MS_PER_HOUR) });
  }
  return t("notes.invitationSentDaysAgo", { count: Math.floor(elapsed / MS_PER_DAY) });
}

/**
 * 有効期限までの残り時間を i18n キーと値で返す。
 * Pick the appropriate "N remaining" i18n key based on remaining time.
 */
function formatRemaining(
  t: (key: string, opts?: Record<string, unknown>) => string,
  expiresAt: number,
  nowMs: number,
): string {
  const remaining = Math.max(0, expiresAt - nowMs);
  if (remaining >= MS_PER_DAY) {
    return t("notes.invitationRemainingDays", { count: Math.ceil(remaining / MS_PER_DAY) });
  }
  return t("notes.invitationRemainingHours", {
    count: Math.max(1, Math.ceil(remaining / MS_PER_HOUR)),
  });
}

/**
 * メンバー管理セクションの Props。
 * Props for the member management section.
 */
export interface NoteMembersManageSectionProps {
  members: Array<{
    memberEmail: string;
    role: NoteMemberRole;
    status: NoteMemberStatus;
    invitation: NoteMemberInvitation | null;
  }>;
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
  /**
   * 現在時刻の注入ポイント（テスト用）。未指定なら `Date.now()`。
   * Injection point for tests; defaults to `Date.now()`.
   */
  now?: () => number;
  /**
   * read-only モードで描画するか。editor / viewer 向けにメンバー一覧だけ
   * 閲覧させたいときに `true` を渡す。
   * - 招待フォーム（Email / Role / Add）は非表示
   * - 各メンバー行の Role セレクトは disabled
   * - 再送信 / 取り消し ボタンは非表示
   * - ステータスバッジ（pending / expired / accepted）は引き続き表示する
   *
   * Render in read-only mode (editor / viewer browsing the list). Hides the
   * invite form and per-row action buttons; status badges remain.
   */
  readOnly?: boolean;
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
  now,
  readOnly = false,
}: NoteMembersManageSectionProps) {
  const { t } = useTranslation();
  const nowMs = (now ?? Date.now)();
  return (
    <section className="border-border/60 mt-6 rounded-lg border p-4">
      {readOnly ? (
        <h2 className="mb-4 text-sm font-semibold">{t("notes.members")}</h2>
      ) : (
        <>
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
        </>
      )}
      <div className={readOnly ? "space-y-3" : "mt-4 space-y-3"}>
        {isMembersLoading ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("notes.noMembersYet")}</p>
        ) : (
          members.map((member) => {
            const isPending = member.status === "pending";
            const isActionable = member.status !== "accepted";
            const variant = deriveBadgeVariant(member.status, member.invitation, nowMs);
            let badgeText: string;
            if (variant === "accepted") {
              badgeText = t("notes.statusAccepted");
            } else if (variant === "declined") {
              badgeText = t("notes.statusDeclined");
            } else if (variant === "expired") {
              badgeText = t("notes.statusExpired");
            } else if (member.invitation) {
              const sent = formatSentAgo(t, member.invitation.lastEmailSentAt, nowMs);
              const remaining = formatRemaining(t, member.invitation.expiresAt, nowMs);
              badgeText = sent
                ? t("notes.statusPendingWithMeta", { sent, remaining })
                : t("notes.statusPending");
            } else {
              badgeText = t("notes.statusPending");
            }
            return (
              <div
                key={member.memberEmail}
                className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-b pb-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{member.memberEmail}</span>
                  <Badge className={badgeStyles[variant]}>{badgeText}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      onUpdateRole(member.memberEmail, value as NoteMemberRole)
                    }
                    disabled={readOnly}
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
                  {!readOnly && isPending && (
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
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        isActionable
                          ? t("notes.a11yCancelInvitation", { email: member.memberEmail })
                          : t("notes.a11yRemoveMember", { email: member.memberEmail })
                      }
                      title={isActionable ? t("notes.cancelInvitation") : t("notes.removeMember")}
                      onClick={() => onRemoveMember(member.memberEmail)}
                    >
                      {isActionable ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
