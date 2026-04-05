/**
 * MCP サーバー管理設定コンポーネント（Issue #463）。
 * MCP server management settings component (Issue #463).
 */

import React, { useState, useCallback } from "react";
import { Plus, Download, Plug } from "lucide-react";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useMcpConfigStore } from "@/stores/mcpConfigStore";
import { McpServerForm } from "./McpServerForm";
import { McpServerRow } from "./McpServerRow";
import type { McpServerConfig, McpServerEntry } from "@/types/mcp";
import { isTauriDesktop } from "@/lib/platform";
import { useToast } from "@zedi/ui";
import { normalizeImportedConfig } from "@/lib/mcpServerImportHelpers";

/**
 * MCP サーバー設定セクション。Claude Code モード時に AI 設定内に表示される。
 * MCP server settings section. Shown within AI settings when Claude Code mode is active.
 */
export const McpServerSettings: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { servers, addServer, removeServer, updateServer, toggleServer, importServers } =
    useMcpConfigStore();

  const [formOpen, setFormOpen] = useState(false);
  const [formSessionKey, setFormSessionKey] = useState(0);
  const [editingServer, setEditingServer] = useState<McpServerEntry | null>(null);

  const handleAdd = useCallback(() => {
    setEditingServer(null);
    setFormSessionKey((k) => k + 1);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((server: McpServerEntry) => {
    setEditingServer(server);
    setFormSessionKey((k) => k + 1);
    setFormOpen(true);
  }, []);

  const handleSave = useCallback(
    (name: string, config: McpServerConfig) => {
      if (editingServer) {
        updateServer(name, config);
      } else {
        addServer(name, config);
      }
    },
    [editingServer, addServer, updateServer],
  );

  const handleImport = useCallback(async () => {
    if (!isTauriDesktop()) return;

    try {
      const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");

      let configText: string | null = null;
      try {
        configText = await readTextFile(".claude/claude_desktop_config.json", {
          baseDir: BaseDirectory.Home,
        });
      } catch {
        try {
          configText = await readTextFile(".claude.json", {
            baseDir: BaseDirectory.Home,
          });
        } catch {
          // Neither file found
        }
      }

      if (!configText) {
        toast({
          title: t("aiSettings.mcp.importFromClaude"),
          description: t("aiSettings.mcp.importNone"),
        });
        return;
      }

      const parsed = JSON.parse(configText) as {
        mcpServers?: Record<string, Record<string, unknown>>;
      };
      const mcpServers = parsed.mcpServers;
      if (!mcpServers || Object.keys(mcpServers).length === 0) {
        toast({
          title: t("aiSettings.mcp.importFromClaude"),
          description: t("aiSettings.mcp.importNone"),
        });
        return;
      }

      const entries = Object.entries(mcpServers).map(([name, raw]) => ({
        name,
        config: normalizeImportedConfig(raw),
      }));

      const beforeCount = servers.length;
      importServers(entries);
      const afterCount = useMcpConfigStore.getState().servers.length;
      const imported = afterCount - beforeCount;

      if (imported > 0) {
        toast({
          title: t("aiSettings.mcp.importFromClaude"),
          description: t("aiSettings.mcp.importSuccess", { count: imported }),
        });
      } else {
        toast({
          title: t("aiSettings.mcp.importFromClaude"),
          description: t("aiSettings.mcp.importNone"),
        });
      }
    } catch (err) {
      toast({
        title: t("aiSettings.mcp.importFromClaude"),
        description: String(err),
        variant: "destructive",
      });
    }
  }, [servers.length, importServers, toast, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Plug className="h-4 w-4" />
            {t("aiSettings.mcp.title")}
          </h3>
          <p className="text-muted-foreground text-xs">{t("aiSettings.mcp.description")}</p>
        </div>
        <div className="flex gap-2">
          {isTauriDesktop() && (
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Download className="mr-1 h-3 w-3" />
              {t("aiSettings.mcp.importFromClaude")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3 w-3" />
            {t("aiSettings.mcp.addServer")}
          </Button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          <p className="font-medium">{t("aiSettings.mcp.noServers")}</p>
          <p className="mt-1 text-xs">{t("aiSettings.mcp.noServersDescription")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <McpServerRow
              key={server.name}
              server={server}
              onEdit={() => handleEdit(server)}
              onDelete={() => removeServer(server.name)}
              onToggle={(enabled) => toggleServer(server.name, enabled)}
            />
          ))}
        </div>
      )}

      <McpServerForm
        key={formSessionKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={handleSave}
        initialName={editingServer?.name}
        initialConfig={editingServer?.config}
      />
    </div>
  );
};
