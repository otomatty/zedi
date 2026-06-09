import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ToolExecution } from "../../types/aiChat";
import { cn } from "@zedi/ui";

/**
 * Maps known Claude Code tool names to user-friendly i18n keys.
 * Claude Code の既知ツール名をユーザーフレンドリーな i18n キーに対応付ける。
 */
function getToolI18nKey(toolName: string): string {
  switch (toolName) {
    case "Read":
      return "aiChat.toolStatus.read";
    case "Write":
      return "aiChat.toolStatus.write";
    case "Bash":
      return "aiChat.toolStatus.bash";
    case "WebSearch":
      return "aiChat.toolStatus.webSearch";
    case "Glob":
      return "aiChat.toolStatus.glob";
    case "Grep":
      return "aiChat.toolStatus.grep";
    case "LS":
      return "aiChat.toolStatus.ls";
    default:
      return "";
  }
}

interface ToolExecutionStatusProps {
  toolExecutions: ToolExecution[];
  className?: string;
}

/**
 * Displays a compact list of active/completed tool executions during Claude Code streaming.
 * Claude Code ストリーミング中のツール実行状況をコンパクトに表示する。
 */
export function ToolExecutionStatus({ toolExecutions, className }: ToolExecutionStatusProps) {
  const { t } = useTranslation();

  if (toolExecutions.length === 0) return null;

  return (
    <div className={cn("space-y-0.5", className)}>
      {toolExecutions.map((exec, idx) => {
        const isRunning = exec.status === "running";
        const i18nKey = getToolI18nKey(exec.toolName);
        const label = i18nKey ? t(i18nKey) : exec.toolName;

        return (
          <div
            key={`${exec.toolName}-${idx}`}
            className={cn(
              "flex items-center gap-1.5 text-[10px]",
              isRunning ? "text-muted-foreground" : "text-muted-foreground/60",
            )}
          >
            {isRunning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
