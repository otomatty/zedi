/**
 * MCP サーバー接続状態インジケーター（Issue #463）。
 * MCP server connection status indicator (Issue #463).
 *
 * AI チャットヘッダーに表示し、接続中のサーバー数をバッジで示す。
 * Shown in the AI chat header with a badge indicating connected server count.
 */

import { Plug } from "lucide-react";
import {
  Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useMcpConfigStore } from "@/stores/mcpConfigStore";
import type { McpConnectionStatus } from "@/types/mcp";

/**
 * MCP ステータスのドット色を返す。
 * Returns a dot color class for MCP status.
 */
function statusDotClass(status: McpConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-green-500";
    case "pending":
      return "bg-yellow-500";
    case "failed":
    case "needs-auth":
      return "bg-red-500";
    case "disabled":
      return "bg-gray-400";
    case "unknown":
    default:
      return "bg-gray-300";
  }
}

/**
 * MCP サーバー接続状態インジケーター。サーバーが 1 つ以上あるときのみ表示。
 * MCP server connection status indicator. Only renders when at least one server exists.
 */
export function McpStatusIndicator() {
  const { t } = useTranslation();
  const servers = useMcpConfigStore((s) => s.servers);

  if (servers.length === 0) return null;

  const enabledServers = servers.filter((s) => s.enabled);
  const connectedCount = enabledServers.filter((s) => s.status === "connected").length;
  const totalEnabled = enabledServers.length;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="hover:bg-muted flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors"
              aria-label={`${t("aiSettings.mcp.title")}: ${connectedCount}/${totalEnabled}`}
            >
              <Plug className="h-3 w-3" />
              <Badge
                variant={connectedCount > 0 ? "default" : "outline"}
                className="h-4 min-w-4 px-1 text-[9px]"
              >
                {connectedCount}/{totalEnabled}
              </Badge>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("aiSettings.mcp.title")}</TooltipContent>
      </Tooltip>

      <PopoverContent className="w-64 p-2" align="start">
        <p className="mb-2 text-xs font-medium">{t("aiSettings.mcp.title")}</p>
        <div className="space-y-1">
          {servers.map((server) => (
            <div key={server.name} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(server.status)}`} />
              <span className="flex-1 truncate">{server.name}</span>
              <span className="text-muted-foreground">
                {t(`aiSettings.mcp.status.${server.status}`)}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
