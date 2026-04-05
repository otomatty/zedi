/**
 * MCP サーバーフォームの状態と保存ハンドラ（Issue #463）。
 * Form state and save handler for the MCP server dialog (Issue #463).
 */

import { useState, useCallback } from "react";
import type { McpServerConfig } from "@/types/mcp";
import { getMcpFormInitialSnapshot } from "./mcpServerFormInitialState";

/** Parameters for {@link useMcpServerFormState}. / {@link useMcpServerFormState} の引数 */
export interface UseMcpServerFormStateParams {
  initialName?: string;
  initialConfig?: McpServerConfig;
  onSave: (name: string, config: McpServerConfig) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * 親の `key` でリマウントされる前提で初期値のみ使用する。
 * Assumes parent remounts via `key` so initial values apply on each open.
 */
export function useMcpServerFormState({
  initialName,
  initialConfig,
  onSave,
  onOpenChange,
}: UseMcpServerFormStateParams) {
  const snap = getMcpFormInitialSnapshot(initialName, initialConfig);

  const [name, setName] = useState(snap.name);
  const [transport, setTransport] = useState(snap.transport);
  const [command, setCommand] = useState(snap.command);
  const [args, setArgs] = useState(snap.args);
  const [envVars, setEnvVars] = useState(snap.envVars);
  const [url, setUrl] = useState(snap.url);
  const [headers, setHeaders] = useState(snap.headers);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    let config: McpServerConfig;

    if (transport === "stdio") {
      const trimmedCmd = command.trim();
      if (!trimmedCmd) return;
      const parsedArgs = args.trim() ? args.trim().split(/\s+/) : undefined;
      const env = envVars.reduce<Record<string, string>>((acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value;
        return acc;
      }, {});
      config = {
        type: "stdio",
        command: trimmedCmd,
        args: parsedArgs,
        env: Object.keys(env).length > 0 ? env : undefined,
      };
    } else {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return;
      const hdrs = headers.reduce<Record<string, string>>((acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value;
        return acc;
      }, {});
      config = {
        type: transport,
        url: trimmedUrl,
        headers: Object.keys(hdrs).length > 0 ? hdrs : undefined,
      };
    }

    onSave(trimmedName, config);
    onOpenChange(false);
  }, [name, transport, command, args, envVars, url, headers, onSave, onOpenChange]);

  return {
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
  };
}
