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
  saving: boolean;
}

/**
 *
 */
export function UserCard({ user, onRoleChange, onSuspend, onUnsuspend, saving }: UserCardProps) {
  return (
    <Card className={user.status === "suspended" ? "opacity-50" : ""}>
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
          <div className="text-muted-foreground mt-1 text-xs">理由: {user.suspendedReason}</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={user.role}
            onValueChange={(v) => onRoleChange(v as UserRole)}
            disabled={saving || user.status === "suspended"}
          >
            <SelectTrigger className="h-8 w-[120px]" aria-label={`${user.email} のロール`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-500">{formatDate(user.createdAt)}</span>
          {!saving &&
            (user.status === "suspended" ? (
              <Button type="button" variant="outline" size="sm" onClick={onUnsuspend}>
                復活
              </Button>
            ) : (
              <Button type="button" variant="destructive" size="sm" onClick={onSuspend}>
                サスペンド
              </Button>
            ))}
          {saving && <span className="text-muted-foreground text-xs">保存中...</span>}
        </div>
      </CardContent>
    </Card>
  );
}
