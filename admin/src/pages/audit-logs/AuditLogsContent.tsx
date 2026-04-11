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
  Badge,
} from "@zedi/ui";
import type { AuditLogEntry } from "@/api/admin";
import { formatDate } from "@/lib/dateUtils";

/**
 * 監査ログページで使う表示用フィルター状態。
 * UI-level filter state for the audit log page.
 */
export interface AuditLogsFilters {
  action?: string;
  actorEmail?: string;
  targetEmail?: string;
  from?: string;
  to?: string;
}

interface AuditLogsContentProps {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  filters: AuditLogsFilters;
  onFilterChange: (next: AuditLogsFilters) => void;
  error: string | null;
  loading: boolean;
  onPageChange: (page: number) => void;
}

/** UI selector sentinel for "すべて" (no filter). */
const ANY_ACTION = "__any__";

/**
 * 現時点では Phase 1 (#550) のロール変更のみ記録される。
 * 後続で suspend/unsuspend/delete が追加される想定。
 *
 * Only role-change is recorded in Phase 1 (#550); suspend/unsuspend/delete
 * will be added by subsequent issues.
 */
const KNOWN_ACTIONS: { value: string; label: string }[] = [
  { value: "user.role.update", label: "ユーザー: ロール変更" },
];

/**
 * `action` ごとに before/after を短いサマリに整形する。
 * Format a before/after payload into a short, action-specific summary.
 *
 * - `user.role.update` → `role: user → admin`
 * - その他は `before → after` の JSON を簡潔に表示 / Others fall back to compact JSON diff
 */
function formatDiffSummary(
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  if (action === "user.role.update") {
    const b = (before?.role as string | undefined) ?? "?";
    const a = (after?.role as string | undefined) ?? "?";
    return `role: ${b} → ${a}`;
  }
  const left = before ? JSON.stringify(before) : "—";
  const right = after ? JSON.stringify(after) : "—";
  return `${left} → ${right}`;
}

/**
 * 監査ログ一覧のプレゼンテーション層。取得ロジックはコンテナ (index.tsx) 側。
 * Presentational component for the audit log list; data-fetching lives in the container.
 */
export function AuditLogsContent({
  logs,
  total,
  page,
  pageSize,
  filters,
  onFilterChange,
  error,
  loading,
  onPageChange,
}: AuditLogsContentProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasPreviousPage = page > 0;
  const hasNextPage = page + 1 < pageCount;
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : page * pageSize + logs.length;

  const handleActionChange = (value: string) => {
    onFilterChange({
      ...filters,
      action: value === ANY_ACTION ? undefined : value,
    });
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">監査ログ</h1>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label
            htmlFor="audit-filter-action"
            className="mb-1 block text-xs text-slate-400"
            id="audit-filter-action-label"
          >
            アクションで絞り込み
          </label>
          <Select value={filters.action ?? ANY_ACTION} onValueChange={handleActionChange}>
            <SelectTrigger id="audit-filter-action" aria-labelledby="audit-filter-action-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_ACTION}>すべて</SelectItem>
              {KNOWN_ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="audit-filter-actor" className="mb-1 block text-xs text-slate-400">
            操作者メール
          </label>
          <Input
            id="audit-filter-actor"
            type="search"
            value={filters.actorEmail ?? ""}
            onChange={(e) =>
              onFilterChange({ ...filters, actorEmail: e.target.value || undefined })
            }
            placeholder="admin@example.com"
          />
        </div>
        <div>
          <label htmlFor="audit-filter-target" className="mb-1 block text-xs text-slate-400">
            対象メール
          </label>
          <Input
            id="audit-filter-target"
            type="search"
            value={filters.targetEmail ?? ""}
            onChange={(e) =>
              onFilterChange({ ...filters, targetEmail: e.target.value || undefined })
            }
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label htmlFor="audit-filter-from" className="mb-1 block text-xs text-slate-400">
            期間（開始）
          </label>
          <Input
            id="audit-filter-from"
            type="datetime-local"
            value={filters.from ?? ""}
            onChange={(e) => onFilterChange({ ...filters, from: e.target.value || undefined })}
          />
        </div>
        <div>
          <label htmlFor="audit-filter-to" className="mb-1 block text-xs text-slate-400">
            期間（終了）
          </label>
          <Input
            id="audit-filter-to"
            type="datetime-local"
            value={filters.to ?? ""}
            onChange={(e) => onFilterChange({ ...filters, to: e.target.value || undefined })}
          />
        </div>
      </div>

      {error && (
        <div className="mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      {loading && logs.length === 0 ? (
        <p className="mt-4 text-slate-400">読み込み中...</p>
      ) : logs.length === 0 ? (
        <p className="mt-4 text-slate-400">監査ログはありません。</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <Table className="border-border min-w-[720px] rounded border">
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-transparent">
                  <TableHead className="px-3 py-2">日時</TableHead>
                  <TableHead className="px-3 py-2">操作者</TableHead>
                  <TableHead className="px-3 py-2">アクション</TableHead>
                  <TableHead className="px-3 py-2">対象</TableHead>
                  <TableHead className="px-3 py-2">変更内容</TableHead>
                  <TableHead className="px-3 py-2">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="border-border align-top">
                    <TableCell className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="text-sm">{log.actorEmail ?? "—"}</div>
                      {log.actorName && (
                        <div className="text-muted-foreground text-xs">{log.actorName}</div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge>{log.action}</Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="text-sm">{log.targetEmail ?? log.targetId ?? "—"}</div>
                      {log.targetName && (
                        <div className="text-muted-foreground text-xs">{log.targetName}</div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <details>
                        <summary className="cursor-pointer text-sm">
                          {formatDiffSummary(log.action, log.before, log.after)}
                        </summary>
                        <pre className="text-muted-foreground mt-2 max-w-md overflow-x-auto text-xs">
                          {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
                        </pre>
                      </details>
                    </TableCell>
                    <TableCell className="text-muted-foreground px-3 py-2 text-xs">
                      {log.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
