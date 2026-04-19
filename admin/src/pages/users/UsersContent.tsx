import { useState } from "react";
import {
  Badge,
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
import type { UserAdmin, UserRole, UserStatus } from "@/api/admin";
import { formatDate } from "@/lib/dateUtils";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { UserCard } from "./UserCard";
import { SuspendDialog } from "./SuspendDialog";
import { useConfirmDialogs } from "./useConfirmDialogs";

interface UsersContentProps {
  users: UserAdmin[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  statusFilter: UserStatus | "all";
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: UserStatus | "all") => void;
  onPageChange: (page: number) => void;
  error: string | null;
  loading: boolean;
  savingIds: Set<string>;
  onRoleChange: (user: UserAdmin, role: UserRole) => void;
  onSuspend: (user: UserAdmin, reason?: string) => void;
  onUnsuspend: (user: UserAdmin) => void;
  onDelete: (user: UserAdmin) => void;
}

/**
 * ステータスに応じたバッジを表示する。
 * Renders a badge based on user status.
 */
function StatusBadge({ status }: { status: UserStatus }) {
  switch (status) {
    case "active":
      return (
        <Badge variant="outline" className="border-green-600 text-green-400">
          active
        </Badge>
      );
    case "suspended":
      return <Badge variant="destructive">suspended</Badge>;
    case "deleted":
      return <Badge variant="secondary">deleted</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/**
 * ユーザー管理画面のメインコンテンツ（一覧・検索・ページング・ロール変更・サスペンド）。
 * Main content for the admin user management page.
 *
 * @param props - Users, pagination, search, and action handlers
 * @returns User management UI
 */
export function UsersContent({
  users,
  total,
  page,
  pageSize,
  search,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onPageChange,
  error,
  loading,
  savingIds,
  onRoleChange,
  onSuspend,
  onUnsuspend,
  onDelete,
}: UsersContentProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasPreviousPage = page > 0;
  const hasNextPage = page + 1 < pageCount;
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : page * pageSize + users.length;

  const [suspendTarget, setSuspendTarget] = useState<UserAdmin | null>(null);
  const confirm = useConfirmDialogs(onRoleChange, onUnsuspend, onDelete);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">ユーザー管理</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={statusFilter}
            onValueChange={(v) => onStatusFilterChange(v as UserStatus | "all")}
          >
            <SelectTrigger className="h-9 w-full sm:w-[140px]" aria-label="ステータスフィルタ">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="suspended">suspended</SelectItem>
              <SelectItem value="deleted">deleted</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="メールで検索"
            className="w-full max-w-xs"
            aria-label="メールで検索"
          />
        </div>
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
                  <TableHead className="px-3 py-2">ステータス</TableHead>
                  <TableHead className="px-3 py-2">ロール</TableHead>
                  <TableHead className="px-3 py-2">ページ数</TableHead>
                  <TableHead className="px-3 py-2">作成日</TableHead>
                  <TableHead className="px-3 py-2">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow
                    key={u.id}
                    className={`border-border ${u.status === "suspended" ? "opacity-50" : u.status === "deleted" ? "opacity-40" : ""}`}
                  >
                    <TableCell className="px-3 py-2">{u.email}</TableCell>
                    <TableCell className="px-3 py-2">{u.name || "—"}</TableCell>
                    <TableCell className="px-3 py-2">
                      <StatusBadge status={u.status} />
                      {u.suspendedReason && (
                        <span
                          className="text-muted-foreground ml-1 text-xs"
                          title={u.suspendedReason}
                        >
                          (
                          {u.suspendedReason.length > 20
                            ? `${u.suspendedReason.slice(0, 20)}...`
                            : u.suspendedReason}
                          )
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Select
                        value={u.role}
                        onValueChange={(v) => confirm.requestRoleChange(u, v as UserRole)}
                        disabled={savingIds.has(u.id) || u.status !== "active"}
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
                    <TableCell className="text-muted-foreground px-3 py-2 tabular-nums">
                      {u.pageCount.toLocaleString("ja-JP")}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-3 py-2">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {savingIds.has(u.id) ? (
                        <span className="text-muted-foreground text-sm">保存中...</span>
                      ) : u.status === "deleted" ? (
                        <span className="text-muted-foreground text-sm">削除済み</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {u.status === "suspended" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => confirm.requestUnsuspend(u)}
                            >
                              復活
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setSuspendTarget(u)}
                            >
                              サスペンド
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => confirm.requestDelete(u)}
                          >
                            削除
                          </Button>
                        </div>
                      )}
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
                onRoleChange={(role) => confirm.requestRoleChange(u, role)}
                onSuspend={() => setSuspendTarget(u)}
                onUnsuspend={() => confirm.requestUnsuspend(u)}
                onDelete={() => confirm.requestDelete(u)}
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

      <SuspendDialog
        user={suspendTarget}
        onClose={() => setSuspendTarget(null)}
        onConfirm={onSuspend}
      />

      {/* ロール変更確認ダイアログ / Role change confirmation dialog */}
      <ConfirmActionDialog
        open={confirm.roleChangeTarget !== null}
        onOpenChange={(open) => {
          if (!open) confirm.cancelRoleChange();
        }}
        title="ロールを変更"
        description={
          confirm.roleChangeTarget
            ? `${confirm.roleChangeTarget.user.name || confirm.roleChangeTarget.user.email} のロールを「${confirm.roleChangeTarget.user.role}」から「${confirm.roleChangeTarget.newRole}」に変更しますか？`
            : ""
        }
        confirmLabel="変更する"
        destructive
        onConfirm={confirm.confirmRoleChange}
      />

      {/* サスペンド解除確認ダイアログ / Unsuspend confirmation dialog */}
      <ConfirmActionDialog
        open={confirm.unsuspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) confirm.cancelUnsuspend();
        }}
        title="サスペンドを解除"
        description={
          confirm.unsuspendTarget
            ? `${confirm.unsuspendTarget.name || confirm.unsuspendTarget.email} のサスペンドを解除し、アカウントを復活させますか？`
            : ""
        }
        confirmLabel="復活させる"
        onConfirm={confirm.confirmUnsuspend}
      />

      {/* ユーザー削除確認ダイアログ / User deletion confirmation dialog */}
      <ConfirmActionDialog
        open={confirm.deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) confirm.cancelDelete();
        }}
        title="ユーザーを削除"
        description={
          confirm.deleteTarget
            ? `${confirm.deleteTarget.user.name || confirm.deleteTarget.user.email} を削除します。個人情報は匿名化され、セッションと OAuth 連携は削除されます。この操作は元に戻せません。`
            : ""
        }
        confirmLabel="削除する"
        destructive
        confirmPhrase={confirm.deleteTarget?.user.email}
        loading={confirm.deleteTarget?.loadingImpact}
        onConfirm={confirm.confirmDelete}
      >
        {confirm.deleteTarget?.impact && (
          <div className="rounded border border-yellow-600/40 bg-yellow-900/20 p-3 text-sm">
            <p className="mb-1 font-medium text-yellow-300">影響範囲:</p>
            <ul className="text-muted-foreground list-inside list-disc space-y-0.5">
              <li>所有ノート: {confirm.deleteTarget.impact.notesCount} 件</li>
              <li>アクティブセッション: {confirm.deleteTarget.impact.sessionsCount} 件</li>
              <li>
                サブスクリプション:{" "}
                {confirm.deleteTarget.impact.activeSubscription ? "あり (active)" : "なし"}
              </li>
              {confirm.deleteTarget.impact.lastAiUsageAt && (
                <li>
                  最後の AI 使用:{" "}
                  {new Date(confirm.deleteTarget.impact.lastAiUsageAt).toLocaleDateString("ja-JP")}
                </li>
              )}
            </ul>
          </div>
        )}
      </ConfirmActionDialog>
    </div>
  );
}
