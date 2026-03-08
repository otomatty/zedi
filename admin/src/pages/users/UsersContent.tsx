import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@zedi/ui";
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
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="メールで検索"
          className="w-full max-w-xs"
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
          <div className="mt-4 hidden md:block">
            <Table className="min-w-[480px] rounded border border-border">
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-transparent">
                  <TableHead className="px-3 py-2">メール</TableHead>
                  <TableHead className="px-3 py-2">名前</TableHead>
                  <TableHead className="px-3 py-2">ロール</TableHead>
                  <TableHead className="px-3 py-2">作成日</TableHead>
                  <TableHead className="px-3 py-2">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="border-border">
                    <TableCell className="px-3 py-2">{u.email}</TableCell>
                    <TableCell className="px-3 py-2">{u.name || "—"}</TableCell>
                    <TableCell className="px-3 py-2">
                      <Select
                        value={u.role}
                        onValueChange={(v) => onRoleChange(u, v as UserRole)}
                        disabled={savingId === u.id}
                      >
                        <SelectTrigger
                          className="h-8 min-w-[100px]"
                          aria-label={`${u.email} のロール`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">user</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-muted-foreground">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-muted-foreground">
                      {savingId === u.id ? "保存中..." : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
