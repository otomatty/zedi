import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Sparkles, TrendingUp, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fetchUsage } from "@/lib/aiService";
import type { AIUsage } from "@/types/ai";
import { cn } from "@/lib/utils";

interface UsageDetailDialogProps {
  children?: React.ReactNode;
}

/**
 * AI使用量の詳細ダイアログ
 * - 現在月の使用量パーセンテージ
 * - Cost Unit消費量
 * - ティア情報
 * - アップグレード導線
 */
export const UsageDetailDialog: React.FC<UsageDetailDialogProps> = ({
  children,
}) => {
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUsage();
      setUsage(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadUsage();
    }
  }, [open, loadUsage]);

  const percent = usage ? Math.min(usage.usagePercent, 100) : 0;
  const isDanger = percent >= 95;
  const isWarning = percent >= 80;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            AI使用量
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI使用量
          </DialogTitle>
          <DialogDescription>
            今月のAI機能の使用状況
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : usage ? (
          <div className="space-y-6 py-2">
            {/* Usage Bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">使用率</span>
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    isDanger
                      ? "text-destructive"
                      : isWarning
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-foreground"
                  )}
                >
                  {percent.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={percent}
                className={cn(
                  "h-3",
                  isDanger && "[&>div]:bg-destructive",
                  isWarning && !isDanger && "[&>div]:bg-yellow-500"
                )}
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">消費</span>
                </div>
                <p className="text-lg font-semibold tabular-nums">
                  {usage.consumedUnits.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">Cost Units</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">上限</span>
                </div>
                <p className="text-lg font-semibold tabular-nums">
                  {usage.budgetUnits.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">Cost Units</p>
              </div>
            </div>

            {/* Tier Info */}
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {usage.tier === "paid" ? "有料プラン" : "無料プラン"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {usage.yearMonth}
                  </p>
                </div>
                {usage.tier === "free" && (
                  <Button variant="default" size="sm" asChild>
                    <a href="/pricing">アップグレード</a>
                  </Button>
                )}
              </div>
            </div>

            {/* Warning */}
            {isDanger && (
              <p className="text-sm text-destructive">
                使用量の上限に達しようとしています。プランをアップグレードすると、
                より多くのAI機能を利用できます。
              </p>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            使用量データを取得できませんでした
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
