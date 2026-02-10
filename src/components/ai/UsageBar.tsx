import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchUsage } from "@/lib/aiService";
import type { AIUsage } from "@/types/ai";

interface UsageBarProps {
  /** Compact mode — shows only the bar, no labels */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Externally provided usage (skip fetch) */
  usage?: AIUsage | null;
  /** Whether to auto-refresh usage data */
  autoRefresh?: boolean;
}

/**
 * AI使用量プログレスバー
 * - ヘッダーやサイドバーに配置してAI使用量をリアルタイム表示
 * - コンパクトモードとフルモードを切替可能
 */
export const UsageBar: React.FC<UsageBarProps> = ({
  compact = false,
  className,
  usage: externalUsage,
  autoRefresh = true,
}) => {
  const [usage, setUsage] = useState<AIUsage | null>(externalUsage ?? null);
  const [loading, setLoading] = useState(!externalUsage);

  const loadUsage = useCallback(async () => {
    try {
      const data = await fetchUsage();
      setUsage(data);
    } catch {
      // Failed to load — show nothing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (externalUsage) {
      setUsage(externalUsage);
      setLoading(false);
      return;
    }
    loadUsage();
  }, [externalUsage, loadUsage]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!autoRefresh || externalUsage) return;
    const interval = setInterval(loadUsage, 60_000);
    return () => clearInterval(interval);
  }, [autoRefresh, externalUsage, loadUsage]);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        {!compact && <span className="text-xs text-muted-foreground">読込中...</span>}
      </div>
    );
  }

  if (!usage) return null;

  const percent = Math.min(usage.usagePercent, 100);
  const isWarning = percent >= 80;
  const isDanger = percent >= 95;

  const barColor = isDanger
    ? "bg-destructive"
    : isWarning
      ? "bg-yellow-500"
      : "bg-primary";

  if (compact) {
    return (
      <div
        className={cn("flex items-center gap-2", className)}
        title={`AI使用量: ${percent.toFixed(1)}%`}
      >
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {percent.toFixed(0)}%
        </span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">AI使用量</span>
        </div>
        <span
          className={cn(
            "text-sm tabular-nums",
            isDanger
              ? "text-destructive font-medium"
              : isWarning
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-muted-foreground"
          )}
        >
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{usage.tier === "paid" ? "有料プラン" : "無料プラン"}</span>
        <span>{usage.yearMonth}</span>
      </div>
      {isDanger && (
        <p className="text-xs text-destructive">
          使用量の上限に近づいています。プランのアップグレードをご検討ください。
        </p>
      )}
    </div>
  );
};
