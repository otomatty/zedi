import type { UserAdmin, UserRole } from "@/api/admin";
import { UserCard } from "./UserCard";

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

interface UsersContentProps {
  users: UserAdmin[];
  total: number;
  search: string;
  onSearchChange: (value: string) => void;
  error: string | null;
  loading: boolean;
  savingId: string | null;
  onRoleChange: (user: UserAdmin, role: UserRole) => void;
}

export function UsersContent({
  users,
  total,
  search,
  onSearchChange,
  error,
  loading,
  savingId,
  onRoleChange,
}: UsersContentProps) {
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">ユーザー管理</h1>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="メールで検索"
          className="w-full max-w-xs rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
          aria-label="メールで検索"
        />
      </div>

      {error && (
        <div className="mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      {loading && users.length === 0 ? (
        <p className="mt-4 text-slate-400">読み込み中...</p>
      ) : (
        <>
          {/* デスクトップ: テーブル */}
          <div className="mt-4 hidden overflow-x-auto rounded border border-slate-700 md:block">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="px-3 py-2 font-medium text-slate-300">メール</th>
                  <th className="px-3 py-2 font-medium text-slate-300">名前</th>
                  <th className="px-3 py-2 font-medium text-slate-300">ロール</th>
                  <th className="px-3 py-2 font-medium text-slate-300">作成日</th>
                  <th className="px-3 py-2 font-medium text-slate-300">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-700/70">
                    <td className="px-3 py-2 text-slate-300">{u.email}</td>
                    <td className="px-3 py-2 text-slate-300">{u.name || "—"}</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`${u.email} のロール`}
                        value={u.role}
                        onChange={(e) => onRoleChange(u, e.target.value as UserRole)}
                        disabled={savingId === u.id}
                        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 disabled:opacity-50"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{formatDate(u.createdAt)}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {savingId === u.id ? "保存中..." : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* モバイル: リスト */}
          <div className="mt-4 space-y-3 md:hidden">
            {users.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                onRoleChange={(role) => onRoleChange(u, role)}
                saving={savingId === u.id}
              />
            ))}
          </div>

          <p className="mt-2 text-xs text-slate-500">
            {users.length} 件 / 合計 {total} 件
          </p>
        </>
      )}
    </div>
  );
}
