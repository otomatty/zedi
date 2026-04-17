import {
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
  Badge,
} from "@zedi/ui";
import type { LintFindingItem, LintRule, LintRunSummaryItem } from "@/api/lint";
import { formatDate } from "@/lib/dateUtils";

/**
 * ルール名を日本語・英語で表示する。
 * Maps rule name to display label (Japanese / English).
 */
const RULE_LABELS: Record<LintRule, string> = {
  orphan: "孤立ページ / Orphan",
  ghost_many: "Ghost Link 過多 / Ghost Excess",
  title_similar: "タイトル類似 / Title Similar",
  conflict: "矛盾 / Conflict",
  broken_link: "リンク切れ / Broken Link",
  stale: "古い情報 / Stale",
};

/**
 * 重要度に対応する Badge バリアント。
 * Badge variant per severity.
 */
function severityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "error":
      return "destructive";
    case "warn":
      return "secondary";
    default:
      return "outline";
  }
}

/**
 * detail オブジェクトからサマリ文字列を生成する。
 * Creates a summary string from a detail object.
 */
function formatDetail(detail: Record<string, unknown>): string {
  if (typeof detail.suggestion === "string") return detail.suggestion;
  if (typeof detail.title === "string") return detail.title;
  if (typeof detail.linkText === "string") {
    const count = typeof detail.count === "number" ? detail.count : "?";
    return `「${detail.linkText}」(${count} 件)`;
  }
  return JSON.stringify(detail);
}

/** UI selector sentinel for "すべて" (no filter). */
const ANY_RULE = "__any__";

interface WikiHealthContentProps {
  findings: LintFindingItem[];
  summary: LintRunSummaryItem[] | null;
  loading: boolean;
  running: boolean;
  error: string | null;
  ruleFilter: LintRule | undefined;
  onRuleFilterChange: (rule: LintRule | undefined) => void;
  onRunLint: () => void;
  onResolve: (id: string) => void;
}

/**
 * Wiki Health ダッシュボードのプレゼンテーション層。
 * Presentational component for the Wiki Health dashboard.
 */
export function WikiHealthContent({
  findings,
  summary,
  loading,
  running,
  error,
  ruleFilter,
  onRuleFilterChange,
  onRunLint,
  onResolve,
}: WikiHealthContentProps) {
  const filtered = ruleFilter ? findings.filter((f) => f.rule === ruleFilter) : findings;

  const handleRuleChange = (value: string) => {
    onRuleFilterChange(value === ANY_RULE ? undefined : (value as LintRule));
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Wiki Health ダッシュボード</h1>
        <Button type="button" onClick={onRunLint} disabled={running || loading}>
          {running ? "実行中..." : "Lint 実行"}
        </Button>
      </div>

      {/* サマリ表示 / Summary display */}
      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {summary.map((s) => (
            <div key={s.rule} className="bg-muted/50 rounded border px-3 py-2">
              <div className="text-muted-foreground text-xs">{RULE_LABELS[s.rule]}</div>
              <div className="mt-1 text-xl font-bold">{s.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* フィルタ / Filter */}
      <div className="mt-4">
        <label
          htmlFor="lint-filter-rule"
          className="text-muted-foreground mb-1 block text-xs"
          id="lint-filter-rule-label"
        >
          ルールで絞り込み
        </label>
        <Select value={ruleFilter ?? ANY_RULE} onValueChange={handleRuleChange}>
          <SelectTrigger
            id="lint-filter-rule"
            aria-labelledby="lint-filter-rule-label"
            className="w-60"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_RULE}>すべて</SelectItem>
            {(Object.keys(RULE_LABELS) as LintRule[]).map((r) => (
              <SelectItem key={r} value={r}>
                {RULE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      {loading && findings.length === 0 ? (
        <p className="text-muted-foreground mt-4">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground mt-4">
          {findings.length === 0
            ? "Lint findings はありません。「Lint 実行」をクリックしてください。"
            : "該当する findings はありません。"}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table className="border-border min-w-[640px] rounded border">
            <TableHeader>
              <TableRow className="border-border bg-muted/50 hover:bg-transparent">
                <TableHead className="px-3 py-2">ルール</TableHead>
                <TableHead className="px-3 py-2">重要度</TableHead>
                <TableHead className="px-3 py-2">詳細</TableHead>
                <TableHead className="px-3 py-2">検出日時</TableHead>
                <TableHead className="px-3 py-2">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f.id} className="border-border align-top">
                  <TableCell className="px-3 py-2">
                    <Badge variant="outline">{RULE_LABELS[f.rule]}</Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md px-3 py-2">
                    <div className="text-sm">{formatDetail(f.detail)}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {f.page_ids.length} ページ関連
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                    {formatDate(f.created_at)}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onResolve(f.id)}
                    >
                      解決
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-2 text-xs">合計 {filtered.length} 件</p>
        </div>
      )}
    </div>
  );
}
