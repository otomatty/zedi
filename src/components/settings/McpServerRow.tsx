/**
 * MCP サーバー一覧の 1 行表示（Issue #463）。
 * Single row in the MCP server list (Issue #463).
 */

import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { Badge } from "@zedi/ui";
import { Switch } from "@zedi/ui";
import { Label } from "@zedi/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { McpServerEntry, McpConnectionStatus } from "@/types/mcp";

/**
 * MCP サーバーの接続ステータスに応じた Badge variant を返す。
 * Returns a Badge variant based on MCP server connection status.
 */
function statusVariant(
  status: McpConnectionStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "connected":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
    case "needs-auth":
      return "destructive";
    case "disabled":
    case "unknown":
    default:
      return "outline";
  }
}

/**
 *
 */
export interface McpServerRowProps {
  server: McpServerEntry;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

/**
 * MCP サーバー一覧の 1 行。
 * One row in the MCP server list.
 */
export function McpServerRow({ server, onEdit, onDelete, onToggle }: McpServerRowProps) {
  const { t } = useTranslation();
  const transportLabel =
    server.config.type === "http" ? "HTTP" : server.config.type === "sse" ? "SSE" : "stdio";

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{server.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {transportLabel}
          </Badge>
          <Badge variant={statusVariant(server.status)} className="text-[10px]">
            {t(`aiSettings.mcp.status.${server.status}`)}
          </Badge>
        </div>
        {server.config.type === "stdio" || !server.config.type ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {(server.config as { command: string }).command}
          </p>
        ) : (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {(server.config as { url: string }).url}
          </p>
        )}
        {server.error && <p className="text-destructive mt-0.5 truncate text-xs">{server.error}</p>}
      </div>

      <div className="flex items-center gap-1">
        <Label htmlFor={`mcp-toggle-${server.name}`} className="sr-only">
          {t("aiSettings.mcp.enabled")}
        </Label>
        <Switch
          id={`mcp-toggle-${server.name}`}
          checked={server.enabled}
          onCheckedChange={onToggle}
        />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("aiSettings.mcp.deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("aiSettings.mcp.deleteConfirmDescription", { name: server.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("aiSettings.mcp.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>
                {t("aiSettings.mcp.deleteServer")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
