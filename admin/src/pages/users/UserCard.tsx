import type { UserAdmin, UserRole } from "@/api/admin";

interface UserCardProps {
  user: UserAdmin;
  onRoleChange: (role: UserRole) => void;
  saving: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function UserCard({ user, onRoleChange, saving }: UserCardProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <div className="font-medium text-slate-200">{user.name || "—"}</div>
      <div className="mt-0.5 text-sm text-slate-400">{user.email}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label={`${user.email} のロール`}
          value={user.role}
          onChange={(e) => onRoleChange(e.target.value as UserRole)}
          disabled={saving}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200 disabled:opacity-50"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <span className="text-xs text-slate-500">{formatDate(user.createdAt)}</span>
      </div>
    </div>
  );
}
