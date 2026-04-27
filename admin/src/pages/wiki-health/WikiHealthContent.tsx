import { useTranslation } from "react-i18next";
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

const ALL_RULES: LintRule[] = [
  "orphan",
  "ghost_many",
  "title_similar",
  "conflict",
  "broken_link",
  "stale",
];

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

/** UI selector sentinel for "all rules" (no filter). */
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
  const { t } = useTranslation();
  const filtered = ruleFilter ? findings.filter((f) => f.rule === ruleFilter) : findings;

  /**
   * detail オブジェクトからサマリ文字列を生成する。
   * Creates a summary string from a detail object.
   */
  const formatDetail = (detail: Record<string, unknown>): string => {
    if (typeof detail.suggestion === "string") return detail.suggestion;
    if (typeof detail.title === "string") return detail.title;
    if (typeof detail.linkText === "string") {
      const count = typeof detail.count === "number" ? detail.count : "?";
      return t("wikiHealth.detail.linkText", { linkText: detail.linkText, count });
    }
    return JSON.stringify(detail);
  };

  const handleRuleChange = (value: string) => {
    onRuleFilterChange(value === ANY_RULE ? undefined : (value as LintRule));
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{t("wikiHealth.title")}</h1>
        <Button type="button" onClick={onRunLint} disabled={running || loading}>
          {running ? t("common.running") : t("wikiHealth.runLint")}
        </Button>
      </div>

      {/* サマリ表示 / Summary display */}
      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {summary.map((s) => (
            <div key={s.rule} className="bg-muted/50 rounded border px-3 py-2">
              <div className="text-muted-foreground text-xs">{t(`wikiHealth.rules.${s.rule}`)}</div>
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
          {t("wikiHealth.filterRule")}
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
            <SelectItem value={ANY_RULE}>{t("common.all")}</SelectItem>
            {ALL_RULES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`wikiHealth.rules.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      {loading && findings.length === 0 ? (
        <p className="text-muted-foreground mt-4">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground mt-4">
          {findings.length === 0 ? t("wikiHealth.emptyAll") : t("wikiHealth.emptyFiltered")}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table className="border-border min-w-[640px] rounded border">
            <TableHeader>
              <TableRow className="border-border bg-muted/50 hover:bg-transparent">
                <TableHead className="px-3 py-2">{t("wikiHealth.columns.rule")}</TableHead>
                <TableHead className="px-3 py-2">{t("wikiHealth.columns.severity")}</TableHead>
                <TableHead className="px-3 py-2">{t("wikiHealth.columns.detail")}</TableHead>
                <TableHead className="px-3 py-2">{t("wikiHealth.columns.createdAt")}</TableHead>
                <TableHead className="px-3 py-2">{t("wikiHealth.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f.id} className="border-border align-top">
                  <TableCell className="px-3 py-2">
                    <Badge variant="outline">{t(`wikiHealth.rules.${f.rule}`)}</Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md px-3 py-2">
                    <div className="text-sm">{formatDetail(f.detail)}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {t("wikiHealth.pagesRelated", { count: f.page_ids.length })}
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
                      {t("wikiHealth.resolve")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-2 text-xs">
            {t("common.totalCount", { count: filtered.length })}
          </p>
        </div>
      )}
    </div>
  );
}
