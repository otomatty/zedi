import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addMonths, subMonths } from "date-fns";
import { formatMonthYear } from "@/lib/dateUtils";
import { getAvailableMonthsFromPages } from "@/lib/dateUtils";
import { usePagesSummary } from "@/hooks/usePageQueries";

const HOME_PATH = "/home";

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthParam(search: string): string | null {
  const params = new URLSearchParams(search);
  const month = params.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return month;
}

export const MonthNavigation: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: pages = [] } = usePagesSummary();

  const isOnHome = location.pathname === HOME_PATH;
  const monthParam = isOnHome ? parseMonthParam(location.search) : null;
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);

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
    <div className="hidden sm:flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handlePrev}
        aria-label={t("home.pagination.previous")}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="min-w-[100px] font-medium text-muted-foreground hover:text-foreground"
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
        className="h-8 w-8"
        onClick={handleNext}
        disabled={!canGoNext}
        aria-label={t("home.pagination.next")}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
