/**
 * MCP サーバーフォームの HTTP/SSE フィールド（Issue #463）。
 * HTTP/SSE fields for the MCP server form (Issue #463).
 */

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import type { TFunction } from "i18next";

/** Props for HTTP/SSE transport fields. / HTTP・SSE 用フィールドの props */
export interface McpServerFormRemoteFieldsProps {
  /** i18n translate function / i18n 翻訳関数 */
  t: TFunction;
  url: string;
  onUrlChange: (value: string) => void;
  headers: Array<{ key: string; value: string }>;
  onHeadersChange: (next: Array<{ key: string; value: string }>) => void;
}

/**
 * HTTP / SSE トランスポート用フィールド。
 * Fields for HTTP/SSE transport.
 */
export function McpServerFormRemoteFields({
  t,
  url,
  onUrlChange,
  headers,
  onHeadersChange,
}: McpServerFormRemoteFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="mcp-url">{t("aiSettings.mcp.url")}</Label>
        <Input
          id="mcp-url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder={t("aiSettings.mcp.urlPlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("aiSettings.mcp.headers")}</Label>
        {headers.map((h, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={h.key}
              onChange={(e) => {
                const updated = [...headers];
                updated[i] = { ...h, key: e.target.value };
                onHeadersChange(updated);
              }}
              placeholder={t("aiSettings.mcp.headerKey")}
              className="flex-1"
            />
            <Input
              value={h.value}
              onChange={(e) => {
                const updated = [...headers];
                updated[i] = { ...h, value: e.target.value };
                onHeadersChange(updated);
              }}
              placeholder={t("aiSettings.mcp.headerValue")}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onHeadersChange(headers.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onHeadersChange([...headers, { key: "", value: "" }])}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("aiSettings.mcp.addHeader")}
        </Button>
      </div>
    </>
  );
}
