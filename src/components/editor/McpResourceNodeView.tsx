/**
 * MCP リソース埋め込みのノードビュー（Issue #463）。
 * Node view for MCP resource embeds (Issue #463).
 *
 * 未解決: プレースホルダーカード（サーバー名 + リソースパス + 取得ボタン）
 * 解決済み: 構造化されたコンテンツ表示
 * エラー: エラーメッセージ + リトライ
 *
 * Pending: placeholder card with server name + resource path + fetch button.
 * Resolved: structured content display.
 * Error: error message + retry.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Plug, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { Badge } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useMcpConfigStore, getMcpServersForQuery } from "@/stores/mcpConfigStore";
import { isTauriDesktop } from "@/lib/platform";
import type { ClaudeErrorPayload, ClaudeStreamCompletePayload } from "@/lib/claudeCode/types";

/**
 * MCP リソースのノードビューコンポーネント。
 * MCP resource node view component.
 */
export const McpResourceNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Unsubscribes Tauri listeners for the in-flight fetch, if any. / 進行中フェッチの Tauri リスナーを解除 */
  const activeUnlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      activeUnlistenRef.current?.();
      activeUnlistenRef.current = null;
    };
  }, []);

  const { server, resource, params, resolvedContent, status } = node.attrs as {
    server: string;
    resource: string;
    params: string;
    resolvedContent: string;
    status: "pending" | "resolved" | "error";
  };

  const handleFetch = useCallback(async () => {
    if (!isTauriDesktop()) {
      setError(t("editor.mcpResourceEmbed.desktopOnly"));
      return;
    }

    const registeredNames = new Set(
      useMcpConfigStore
        .getState()
        .servers.filter((s) => s.enabled)
        .map((s) => s.name),
    );
    const trimmedServer = server.trim();
    const trimmedResource = resource.trim();
    if (!trimmedServer || !registeredNames.has(trimmedServer)) {
      setError(t("editor.mcpResourceEmbed.unknownServer"));
      return;
    }
    if (!trimmedResource) {
      setError(t("editor.mcpResourceEmbed.resourceRequired"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { claudeQuery, onClaudeStreamComplete, onClaudeError } =
        await import("@/lib/claudeCode/bridge");

      const mcpServers = getMcpServersForQuery(useMcpConfigStore.getState().servers);
      const safeResource = trimmedResource.slice(0, 2000);
      const safeParams = params.trim().slice(0, 2000);
      const prompt = `Use the MCP server "${trimmedServer}" to fetch the resource "${safeResource}"${safeParams ? ` with parameters: ${safeParams}` : ""}. Return ONLY the raw data/content, no explanation or formatting. If it's structured data, return it as a formatted code block.`;

      let requestId: string | null = null;
      const bufferedComplete: ClaudeStreamCompletePayload[] = [];
      const bufferedError: ClaudeErrorPayload[] = [];

      let cleaned = false;
      let unlistenComplete: () => void = () => {};
      let unlistenError: () => void = () => {};
      let cleanup: () => void = () => {};

      const processComplete = (payload: ClaudeStreamCompletePayload): void => {
        updateAttributes({
          resolvedContent: payload.result.content,
          status: "resolved",
        });
        setIsLoading(false);
        cleanup();
      };

      const processError = (payload: ClaudeErrorPayload): void => {
        setError(payload.error);
        updateAttributes({ status: "error" });
        setIsLoading(false);
        cleanup();
      };

      unlistenComplete = await onClaudeStreamComplete((payload) => {
        if (requestId === null) {
          bufferedComplete.push(payload);
          return;
        }
        if (payload.id !== requestId) return;
        processComplete(payload);
      });

      unlistenError = await onClaudeError((payload) => {
        if (requestId === null) {
          bufferedError.push(payload);
          return;
        }
        if (payload.id !== requestId) return;
        processError(payload);
      });

      cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        activeUnlistenRef.current = null;
        unlistenComplete();
        unlistenError();
      };

      activeUnlistenRef.current = cleanup;

      requestId = await claudeQuery(prompt, {
        mcpServers: mcpServers as Record<string, Record<string, unknown>> | undefined,
      });

      for (const p of bufferedComplete) {
        if (p.id === requestId) processComplete(p);
      }
      for (const p of bufferedError) {
        if (p.id === requestId) processError(p);
      }
    } catch (err) {
      activeUnlistenRef.current?.();
      activeUnlistenRef.current = null;
      setError(err instanceof Error ? err.message : String(err));
      updateAttributes({ status: "error" });
      setIsLoading(false);
    }
  }, [server, resource, params, updateAttributes, t]);

  return (
    <NodeViewWrapper className={`my-2 rounded-lg border ${selected ? "ring-primary ring-2" : ""}`}>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-medium">{server}</span>
            <Badge variant="outline" className="text-[10px]">
              {resource}
            </Badge>
            {params && <span className="text-muted-foreground text-xs">{params}</span>}
          </div>
          <div className="flex items-center gap-1">
            {status === "pending" && (
              <Button variant="outline" size="sm" onClick={handleFetch} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                {t("common.fetch", "Fetch")}
              </Button>
            )}
            {status === "resolved" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleFetch}
                disabled={isLoading}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={deleteNode}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("editor.mcpResourceEmbed.loadingFrom", { server })}</span>
          </div>
        )}

        {error && (
          <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
            <Button
              variant="link"
              size="sm"
              className="ml-2 h-auto p-0 text-xs"
              onClick={handleFetch}
            >
              {t("common.retry", "Retry")}
            </Button>
          </div>
        )}

        {status === "resolved" && resolvedContent && (
          <div className="mt-2 max-h-64 overflow-auto rounded bg-gray-50 p-2 dark:bg-gray-900">
            <pre className="text-xs whitespace-pre-wrap">{resolvedContent}</pre>
          </div>
        )}

        {status === "pending" && !isLoading && !error && (
          <p className="text-muted-foreground mt-2 text-xs">
            {t("editor.mcpResourceEmbed.fetchHint")}
          </p>
        )}
      </div>
    </NodeViewWrapper>
  );
};
