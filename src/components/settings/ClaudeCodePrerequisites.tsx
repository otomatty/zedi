import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Monitor, Terminal, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@zedi/ui";
import { isTauriDesktop } from "@/lib/platform";
import { cn } from "@zedi/ui";

interface PrerequisiteItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  status: "checking" | "ok" | "fail";
  detail?: string;
}

/**
 * Claude Code の前提条件チェックリスト。
 * Prerequisite checklist for Claude Code.
 */
export function ClaudeCodePrerequisites() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrerequisiteItem[]>([]);
  const [checking, setChecking] = useState(false);

  const runChecks = useCallback(async () => {
    setChecking(true);

    const desktopOk = isTauriDesktop();

    const initial: PrerequisiteItem[] = [
      {
        id: "desktop",
        label: t("aiSettings.prereq.desktop"),
        description: t("aiSettings.prereq.desktopDescription"),
        icon: <Monitor className="h-4 w-4" />,
        status: desktopOk ? "ok" : "fail",
        detail: desktopOk ? t("aiSettings.prereq.desktopOk") : t("aiSettings.prereq.desktopFail"),
      },
      {
        id: "cli",
        label: t("aiSettings.prereq.cli"),
        description: t("aiSettings.prereq.cliDescription"),
        icon: <Terminal className="h-4 w-4" />,
        status: desktopOk ? "checking" : "fail",
        detail: desktopOk ? undefined : t("aiSettings.prereq.requiresDesktop"),
      },
      {
        id: "sidecar",
        label: t("aiSettings.prereq.sidecar"),
        description: t("aiSettings.prereq.sidecarDescription"),
        icon: <Wifi className="h-4 w-4" />,
        status: desktopOk ? "checking" : "fail",
        detail: desktopOk ? undefined : t("aiSettings.prereq.requiresDesktop"),
      },
    ];
    setItems([...initial]);

    if (!desktopOk) {
      setChecking(false);
      return;
    }

    try {
      const { checkClaudeInstallation } = await import("@/lib/claudeCode/bridge");
      const result = await checkClaudeInstallation();
      const cliOk = result.installed;
      initial[1] = {
        ...initial[1],
        status: cliOk ? "ok" : "fail",
        detail: cliOk
          ? result.version
            ? t("aiSettings.prereq.cliOkVersion", { version: result.version })
            : t("aiSettings.prereq.cliOk")
          : t("aiSettings.prereq.cliFail"),
      };
      setItems([...initial]);

      if (!cliOk) {
        initial[2] = {
          ...initial[2],
          status: "fail",
          detail: t("aiSettings.prereq.requiresCli"),
        };
        setItems([...initial]);
        setChecking(false);
        return;
      }
    } catch {
      initial[1] = {
        ...initial[1],
        status: "fail",
        detail: t("aiSettings.prereq.cliFail"),
      };
      initial[2] = {
        ...initial[2],
        status: "fail",
        detail: t("aiSettings.prereq.requiresCli"),
      };
      setItems([...initial]);
      setChecking(false);
      return;
    }

    try {
      const { claudeStatus } = await import("@/lib/claudeCode/bridge");
      const status = await claudeStatus();
      const sidecarOk = status.status === "idle" || status.status === "processing";
      initial[2] = {
        ...initial[2],
        status: sidecarOk ? "ok" : "fail",
        detail: sidecarOk ? t("aiSettings.prereq.sidecarOk") : t("aiSettings.prereq.sidecarFail"),
      };
    } catch {
      initial[2] = {
        ...initial[2],
        status: "fail",
        detail: t("aiSettings.prereq.sidecarFail"),
      };
    }

    setItems([...initial]);
    setChecking(false);
  }, [t]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const allOk = items.length > 0 && items.every((i) => i.status === "ok");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t("aiSettings.prereq.title")}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={runChecks}
          disabled={checking}
          className="h-7 gap-1 px-2 text-xs"
        >
          <RefreshCw className={cn("h-3 w-3", checking && "animate-spin")} />
          {t("aiSettings.prereq.recheck")}
        </Button>
      </div>

      <div className="divide-border divide-y rounded-lg border">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 p-3">
            <div className="mt-0.5 shrink-0">
              {item.status === "checking" ? (
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              ) : item.status === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="text-destructive h-4 w-4" />
              )}
            </div>
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                {item.icon}
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <p className="text-muted-foreground text-xs">{item.description}</p>
              {item.detail && (
                <p
                  className={cn(
                    "text-xs",
                    item.status === "ok" ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  {item.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {allOk && (
        <p className="text-xs text-green-600 dark:text-green-400">
          {t("aiSettings.prereq.allPassed")}
        </p>
      )}
    </div>
  );
}
