import React from "react";
import { useTranslation } from "react-i18next";
import { Progress, cn } from "@zedi/ui";

/**
 *
 */
export interface UsageMeterProps {
  consumedUnits: number;
  budgetUnits: number;
  remainingUnits: number;
  usagePercent: number;
  /** Optional className forwarded to the outer wrapper. */
  className?: string;
  /** When true, shows the "approaching limit" warning copy below the bar. */
  showDangerWarning?: boolean;
}

/**
 * Usage meter for the AI cost-units quota. Colors the percent label and the
 * progress bar indicator yellow at 80% or higher and red at 95% or higher.
 *
 * AI の Cost Units 使用量メーター。80% 以上で黄色、95% 以上で赤の警告色に
 * 切り替わる。`/pricing` ページと契約管理セクションで共有する。
 */
export const UsageMeter: React.FC<UsageMeterProps> = ({
  consumedUnits,
  budgetUnits,
  remainingUnits,
  usagePercent,
  className,
  showDangerWarning = true,
}) => {
  const { t } = useTranslation();
  const percent = Math.min(usagePercent, 100);
  const isDanger = percent >= 95;
  const isWarning = percent >= 80;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("pricing.status.aiUsage")}</span>
        <span
          className={cn(
            "font-medium tabular-nums",
            isDanger
              ? "text-destructive"
              : isWarning
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-foreground",
          )}
        >
          {percent.toFixed(1)}%
        </span>
      </div>
      <Progress
        value={percent}
        className={cn(
          "h-2.5",
          isDanger && "[&>div]:bg-destructive",
          isWarning && !isDanger && "[&>div]:bg-yellow-500",
        )}
      />
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>
          {consumedUnits.toLocaleString()} / {budgetUnits.toLocaleString()}{" "}
          {t("pricing.status.costUnits")}
        </span>
        <span>
          {t("pricing.status.remaining")}: {Math.max(0, remainingUnits).toLocaleString()}
        </span>
      </div>
      {showDangerWarning && isDanger && (
        <p className="text-destructive text-xs">{t("pricing.status.dangerWarning")}</p>
      )}
    </div>
  );
};

export default UsageMeter;
