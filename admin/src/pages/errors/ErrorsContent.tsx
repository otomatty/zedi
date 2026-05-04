import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
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
import type { ApiErrorRow, ApiErrorSeverity, ApiErrorStatus } from "@/api/admin";
import { API_ERROR_SEVERITY_VALUES, API_ERROR_STATUS_VALUES } from "@/api/admin";
import { formatDate, formatNumber } from "@/lib/dateUtils";

const ANY = "__any__";

interface ErrorsContentProps {
  rows: ApiErrorRow[];
  total: number;
  loading: boolean;
  error: string | null;
  statusFilter: ApiErrorStatus | "all";
  severityFilter: ApiErrorSeverity | "all";
  onStatusFilterChange: (next: ApiErrorStatus | "all") => void;
  onSeverityFilterChange: (next: ApiErrorSeverity | "all") => void;
  onSelect: (row: ApiErrorRow) => void;
}

/**
 * `status` ごとのバッジ色（テーマトークンで揃える）。
 * Status badge variants matching the workflow semantics.
 */
function StatusBadge({ status }: { status: ApiErrorStatus }) {
  const { t } = useTranslation();
  const label = t(`errors.status.${status}`);
  switch (status) {
    case "open":
      return <Badge variant="destructive">{label}</Badge>;
    case "investigating":
      return (
        <Badge variant="outline" className="border-yellow-600 text-yellow-400">
          {label}
        </Badge>
      );
    case "resolved":
      return (
        <Badge variant="outline" className="border-green-600 text-green-400">
          {label}
        </Badge>
      );
    case "ignored":
      return <Badge variant="secondary">{label}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/**
 * `severity` ごとのバッジ色。`unknown` は AI 解析未完了の暫定値。
 * Severity badge variants; `unknown` is the pre-analysis default.
 */
function SeverityBadge({ severity }: { severity: ApiErrorSeverity }) {
  const { t } = useTranslation();
  const label = t(`errors.severity.${severity}`);
  switch (severity) {
    case "high":
      return <Badge variant="destructive">{label}</Badge>;
    case "medium":
      return (
        <Badge variant="outline" className="border-orange-600 text-orange-400">
          {label}
        </Badge>
      );
    case "low":
      return (
        <Badge variant="outline" className="border-blue-600 text-blue-400">
          {label}
        </Badge>
      );
    default:
      return <Badge variant="secondary">{label}</Badge>;
  }
}

/**
 * 管理画面「エラー一覧」のプレゼンテーション層。データ取得・状態管理は
 * コンテナ (index.tsx) に分離する。
 *
 * Presentational layer for the admin errors list. Data fetching and state
 * management live in the container (`index.tsx`).
 *
 * @see https://github.com/otomatty/zedi/issues/804
 */
export function ErrorsContent({
  rows,
  total,
  loading,
  error,
  statusFilter,
  severityFilter,
  onStatusFilterChange,
  onSeverityFilterChange,
  onSelect,
}: ErrorsContentProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{t("errors.title")}</h1>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="errors-filter-status"
            className="mb-1 block text-xs text-slate-400"
            id="errors-filter-status-label"
          >
            {t("errors.filters.status")}
          </label>
          <Select
            value={statusFilter}
            onValueChange={(v) => onStatusFilterChange(v === ANY ? "all" : (v as ApiErrorStatus))}
          >
            <SelectTrigger id="errors-filter-status" aria-labelledby="errors-filter-status-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {API_ERROR_STATUS_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`errors.status.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            htmlFor="errors-filter-severity"
            className="mb-1 block text-xs text-slate-400"
            id="errors-filter-severity-label"
          >
            {t("errors.filters.severity")}
          </label>
          <Select
            value={severityFilter}
            onValueChange={(v) =>
              onSeverityFilterChange(v === ANY ? "all" : (v as ApiErrorSeverity))
            }
          >
            <SelectTrigger
              id="errors-filter-severity"
              aria-labelledby="errors-filter-severity-label"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {API_ERROR_SEVERITY_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`errors.severity.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <p className="mt-4 text-slate-400">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-slate-400">{t("errors.empty")}</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <Table className="border-border min-w-[720px] rounded border">
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-transparent">
                  <TableHead className="px-3 py-2">{t("errors.columns.status")}</TableHead>
                  <TableHead className="px-3 py-2">{t("errors.columns.severity")}</TableHead>
                  <TableHead className="px-3 py-2">{t("errors.columns.title")}</TableHead>
                  <TableHead className="px-3 py-2">{t("errors.columns.route")}</TableHead>
                  <TableHead className="px-3 py-2">{t("errors.columns.occurrences")}</TableHead>
                  <TableHead className="px-3 py-2">{t("errors.columns.lastSeen")}</TableHead>
                  <TableHead className="px-3 py-2">{t("errors.columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="border-border align-top">
                    <TableCell className="px-3 py-2">
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <SeverityBadge severity={row.severity} />
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="text-sm font-medium">{row.title}</div>
                      {row.statusCode != null && (
                        <div className="text-muted-foreground text-xs">HTTP {row.statusCode}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-3 py-2 text-xs">
                      {row.route ?? "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 tabular-nums">
                      {formatNumber(row.occurrences)}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {formatDate(row.lastSeenAt)}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSelect(row)}
                      >
                        {t("errors.actions.viewDetail")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="mt-2 text-xs text-slate-500">{t("common.totalCount", { count: total })}</p>
        </>
      )}
    </div>
  );
}
