import {
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
  saving: boolean;
}

export function UserCard({ user, onRoleChange, saving }: UserCardProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="font-medium text-slate-200">{user.name || "—"}</div>
        <div className="mt-0.5 text-sm text-slate-400">{user.email}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={user.role}
            onValueChange={(v) => onRoleChange(v as UserRole)}
            disabled={saving}
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
        </div>
      </CardContent>
    </Card>
  );
}
