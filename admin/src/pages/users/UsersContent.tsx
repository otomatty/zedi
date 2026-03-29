import {
  Button,
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
import { formatDate } from "@/lib/dateUtils";
import { UserCard } from "./UserCard";

interface UsersContentProps {
  users: UserAdmin[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  error: string | null;
  loading: boolean;
  savingIds: Set<string>;
  onRoleChange: (user: UserAdmin, role: UserRole) => void;
}

/**
 * ユーザー管理画面のメインコンテンツ（一覧・検索・ページング・ロール変更）。
 * Main content for the admin user management page.
 *
 * @param props - Users, pagination, search, and role-change handlers
 * @returns User management UI
 */
export function UsersContent({
  users,
  total,
  page,
  pageSize,
  search,
  onSearchChange,
  onPageChange,
  error,
  loading,
  savingIds,
  onRoleChange,
}: UsersContentProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasPreviousPage = page > 0;
  const hasNextPage = page + 1 < pageCount;
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : page * pageSize + users.length;

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
            <Table className="border-border min-w-[480px] rounded border">
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
                        disabled={savingIds.has(u.id)}
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
                    <TableCell className="text-muted-foreground px-3 py-2">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-3 py-2">
                      {savingIds.has(u.id) ? "保存中..." : ""}
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
                saving={savingIds.has(u.id)}
              />
            ))}
          </div>

          <p className="mt-2 text-xs text-slate-500">
            {total > 0 ? `${rangeStart}-${rangeEnd}` : "0"} 件を表示 / 合計 {total} 件
          </p>

          {total > pageSize && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {page + 1} / {pageCount} ページ
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page - 1)}
                  disabled={!hasPreviousPage || loading}
                >
                  前へ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page + 1)}
                  disabled={!hasNextPage || loading}
                >
                  次へ
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
