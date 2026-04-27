import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@zedi/ui";
import type { UserAdmin, UserRole } from "@/api/admin";
import { formatDate } from "@/lib/dateUtils";

interface UserCardProps {
  user: UserAdmin;
  onRoleChange: (role: UserRole) => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onDelete: () => void;
  saving: boolean;
}

/**
 * モバイル向けユーザーカードコンポーネント。
 * User card component for mobile view.
 */
export function UserCard({
  user,
  onRoleChange,
  onSuspend,
  onUnsuspend,
  onDelete,
  saving,
}: UserCardProps) {
  const { t } = useTranslation();
  return (
    <Card
      className={
        user.status === "suspended" ? "opacity-50" : user.status === "deleted" ? "opacity-40" : ""
      }
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className="font-medium text-slate-200">{user.name || "—"}</div>
          {user.status === "active" ? (
            <Badge variant="outline" className="border-green-600 text-green-400">
              active
            </Badge>
          ) : user.status === "suspended" ? (
            <Badge variant="destructive">suspended</Badge>
          ) : (
            <Badge variant="secondary">{user.status}</Badge>
          )}
        </div>
        <div className="mt-0.5 text-sm text-slate-400">{user.email}</div>
        {user.suspendedReason && (
          <div className="text-muted-foreground mt-1 text-xs">
            {t("users.card.reasonPrefix", { reason: user.suspendedReason })}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={user.role}
            onValueChange={(v) => onRoleChange(v as UserRole)}
            disabled={saving || user.status !== "active"}
          >
            <SelectTrigger
              className="h-8 w-[120px]"
              aria-label={t("users.row.roleAriaLabel", { email: user.email })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-500">
            {t("users.card.pageCount", { count: user.pageCount.toLocaleString("ja-JP") })}
          </span>
          <span className="text-xs text-slate-500">{formatDate(user.createdAt)}</span>
          {!saving && user.status === "deleted" ? (
            <span className="text-muted-foreground text-xs">{t("users.states.deleted")}</span>
          ) : (
            !saving && (
              <>
                {user.status === "suspended" ? (
                  <Button type="button" variant="outline" size="sm" onClick={onUnsuspend}>
                    {t("users.actions.restore")}
                  </Button>
                ) : (
                  <Button type="button" variant="destructive" size="sm" onClick={onSuspend}>
                    {t("users.actions.suspend")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  {t("users.actions.delete")}
                </Button>
              </>
            )
          )}
          {saving && (
            <span className="text-muted-foreground text-xs">{t("users.states.saving")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
