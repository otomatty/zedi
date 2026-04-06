/**
 * MCP サーバーフォームの stdio フィールド（Issue #463）。
 * Stdio fields for the MCP server form (Issue #463).
 */

import type { TFunction } from "i18next";
import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";

/** Props for stdio transport fields. / stdio 用フィールドの props */
export interface McpServerFormStdioFieldsProps {
  /** i18n translate function / i18n 翻訳関数 */
  t: TFunction;
  command: string;
  onCommandChange: (value: string) => void;
  args: string;
  onArgsChange: (value: string) => void;
  envVars: Array<{ key: string; value: string }>;
  onEnvVarsChange: (next: Array<{ key: string; value: string }>) => void;
}

/**
 * stdio トランスポート用フィールド。
 * Fields for stdio transport.
 */
export function McpServerFormStdioFields({
  t,
  command,
  onCommandChange,
  args,
  onArgsChange,
  envVars,
  onEnvVarsChange,
}: McpServerFormStdioFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="mcp-command">{t("aiSettings.mcp.command")}</Label>
        <Input
          id="mcp-command"
          value={command}
          onChange={(e) => onCommandChange(e.target.value)}
          placeholder={t("aiSettings.mcp.commandPlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mcp-args">{t("aiSettings.mcp.args")}</Label>
        <Input
          id="mcp-args"
          value={args}
          onChange={(e) => onArgsChange(e.target.value)}
          placeholder={t("aiSettings.mcp.argsPlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("aiSettings.mcp.envVars")}</Label>
        {envVars.map((ev, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={ev.key}
              onChange={(e) => {
                const updated = [...envVars];
                updated[i] = { ...ev, key: e.target.value };
                onEnvVarsChange(updated);
              }}
              placeholder={t("aiSettings.mcp.envKey")}
              className="flex-1"
            />
            <Input
              value={ev.value}
              onChange={(e) => {
                const updated = [...envVars];
                updated[i] = { ...ev, value: e.target.value };
                onEnvVarsChange(updated);
              }}
              placeholder={t("aiSettings.mcp.envValue")}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEnvVarsChange(envVars.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEnvVarsChange([...envVars, { key: "", value: "" }])}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("aiSettings.mcp.addEnvVar")}
        </Button>
      </div>
    </>
  );
}
