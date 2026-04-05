/**
 * MCP サーバー追加/編集フォームダイアログ（Issue #463）。
 * MCP server add/edit form dialog (Issue #463).
 */

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@zedi/ui";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { McpServerConfig, McpServerTransport } from "@/types/mcp";
import { McpServerFormRemoteFields } from "./McpServerFormRemoteFields";
import { McpServerFormStdioFields } from "./McpServerFormStdioFields";
import { useMcpServerFormState } from "./useMcpServerFormState";

interface McpServerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, config: McpServerConfig) => void;
  initialName?: string;
  initialConfig?: McpServerConfig;
}

/**
 * MCP サーバーの追加/編集ダイアログ。
 * 親で `key` を変えてリマウントし、初期値を反映する。
 * Dialog for adding or editing an MCP server. Parent should change `key` to reset fields.
 */
export const McpServerForm: React.FC<McpServerFormProps> = ({
  open,
  onOpenChange,
  onSave,
  initialName,
  initialConfig,
}) => {
  const { t } = useTranslation();
  const isEditing = !!initialName;

  const {
    name,
    setName,
    transport,
    setTransport,
    command,
    setCommand,
    args,
    setArgs,
    envVars,
    setEnvVars,
    url,
    setUrl,
    headers,
    setHeaders,
    handleSave,
  } = useMcpServerFormState({ initialName, initialConfig, onSave, onOpenChange });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("aiSettings.mcp.editServer") : t("aiSettings.mcp.addServer")}
          </DialogTitle>
          <DialogDescription>{t("aiSettings.mcp.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="mcp-server-name">{t("aiSettings.mcp.serverName")}</Label>
            <Input
              id="mcp-server-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("aiSettings.mcp.serverNamePlaceholder")}
              disabled={isEditing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-transport">{t("aiSettings.mcp.transport")}</Label>
            <Select value={transport} onValueChange={(v) => setTransport(v as McpServerTransport)}>
              <SelectTrigger id="mcp-transport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">{t("aiSettings.mcp.transportStdio")}</SelectItem>
                <SelectItem value="http">{t("aiSettings.mcp.transportHttp")}</SelectItem>
                <SelectItem value="sse">{t("aiSettings.mcp.transportSse")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {transport === "stdio" && (
            <McpServerFormStdioFields
              t={t}
              command={command}
              onCommandChange={setCommand}
              args={args}
              onArgsChange={setArgs}
              envVars={envVars}
              onEnvVarsChange={setEnvVars}
            />
          )}

          {(transport === "http" || transport === "sse") && (
            <McpServerFormRemoteFields
              t={t}
              url={url}
              onUrlChange={setUrl}
              headers={headers}
              onHeadersChange={setHeaders}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("aiSettings.mcp.cancel")}
          </Button>
          <Button onClick={handleSave}>{t("aiSettings.mcp.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
