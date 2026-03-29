import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@zedi/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@zedi/ui";
import { addMonths, subMonths } from "date-fns";
import { formatMonthYear } from "@/lib/dateUtils";
import { getAvailableMonthsFromPages } from "@/lib/dateUtils";
import { usePagesSummary } from "@/hooks/usePageQueries";

/** Path for the home grid; month filter uses `?month=yyyy-MM`. / ホームグリッド。月絞り込みは `?month=yyyy-MM` */
const HOME_PATH = "/home";

/**
 * Current calendar month in local time as `yyyy-MM` (for capping prev/next and the dropdown).
 * ローカル日付の「今月」を `yyyy-MM` で表す（次へ／ドロップダウン上限に使用）。
 */
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Reads and validates `month` from `location.search` (`yyyy-MM`, month 1–12).
 * `location.search` から `month` を読み、`yyyy-MM`（月 1–12）なら検証済みで返す。
 */
function parseMonthParam(search: string): string | null {
  const params = new URLSearchParams(search);
  const month = params.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return month;
}

/**
 * Month filter for the home page: reads `?month=yyyy-MM`, prev/next, and a dropdown of months that have pages (past months only).
 * ホームの月フィルタ：`?month=yyyy-MM` の反映、前後月、ページの月ドロップダウン（当月より前のみ）。
 *
 * Shown in {@link Header} on desktop (`md+`) next to the logo; other routes ignore the query and behave like “all time”.
 * {@link Header} のロゴ横（`md+` 表示）。他ルートではクエリを無視し「全期間」相当の表示。
 */
export const MonthNavigation: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: pages = [] } = usePagesSummary();

  const isOnHome = location.pathname === HOME_PATH;
  const monthParam = isOnHome ? parseMonthParam(location.search) : null;
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);

  /**
   * Months that appear in page `updatedAt`, newest first; excludes the current calendar month and the future (navigation cap).
   * ページの `updatedAt` に現れる月（新しい順）。当月・未来は除外（ナビの上限と一致）。
   */
  const availableMonths = useMemo(() => {
    const all = getAvailableMonthsFromPages(pages.filter((p) => !p.isDeleted));
    return all.filter((yyyyMM) => yyyyMM < currentMonthKey);
  }, [pages, currentMonthKey]);

  const displayLabel = useMemo(() => {
    if (!monthParam) return t("home.period.all");
    const [y, m] = monthParam.split("-").map(Number);
    return formatMonthYear(new Date(y, m - 1, 1));
  }, [monthParam, t]);

  const navigateToMonth = (month: string | null) => {
    const path = month ? `${HOME_PATH}?month=${month}` : HOME_PATH;
    navigate(path);
  };

  const handlePrev = () => {
    if (monthParam) {
      const [y, m] = monthParam.split("-").map(Number);
      const date = new Date(y, m - 1, 1);
      const prev = subMonths(date, 1);
      const nextMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      navigateToMonth(nextMonth);
    } else {
      const prev = subMonths(new Date(), 1);
      const nextMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      navigateToMonth(nextMonth);
    }
  };

  /**
   * One step forward from the displayed month (from “all time”, starts at next calendar month after today’s month).
   * 表示中の月の 1 ヶ月後。「全期間」からは今日の月の次の月（通常は来月）を指す。
   */
  const nextMonthParam = useMemo(() => {
    if (monthParam) {
      const [y, m] = monthParam.split("-").map(Number);
      const date = new Date(y, m - 1, 1);
      const next = addMonths(date, 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    }
    const next = addMonths(new Date(), 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  }, [monthParam]);

  const canGoNext = nextMonthParam < currentMonthKey;

  const handleNext = () => {
    if (!canGoNext) return;
    navigateToMonth(nextMonthParam);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={handlePrev}
        aria-label={t("home.pagination.previous")}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-9 min-w-[110px] text-sm font-medium"
            aria-label={t("home.period.selectMonth")}
          >
            <span className="text-center">{displayLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[min(60vh,320px)] overflow-y-auto">
          <DropdownMenuItem
            onClick={() => navigateToMonth(null)}
            className={!monthParam ? "bg-accent" : undefined}
          >
            {t("home.period.all")}
          </DropdownMenuItem>
          {availableMonths.length > 0 &&
            availableMonths.map((yyyyMM) => {
              const [y, m] = yyyyMM.split("-").map(Number);
              const label = formatMonthYear(new Date(y, m - 1, 1));
              return (
                <DropdownMenuItem
                  key={yyyyMM}
                  onClick={() => navigateToMonth(yyyyMM)}
                  className={monthParam === yyyyMM ? "bg-accent" : undefined}
                >
                  {label}
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={handleNext}
        disabled={!canGoNext}
        aria-label={t("home.pagination.next")}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
};
