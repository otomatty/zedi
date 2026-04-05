/**
 * MCP サーバー設定の永続化ストア（Issue #463）。
 * Zustand store for persisting MCP server configurations (Issue #463).
 *
 * 有効なサーバーを SDK 形式に変換する `getMcpServersForQuery()` を提供する。
 * Provides `getMcpServersForQuery()` to convert enabled servers to SDK format.
 *
 * 機密（env / HTTP headers）は localStorage に保存しない（partialize で除外）。
 * Secrets (env / HTTP headers) are not persisted to localStorage (stripped in partialize).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  McpServerEntry,
  McpServerConfig,
  McpServersRecord,
  McpConnectionStatus,
  McpServerTool,
} from "../types/mcp";

interface McpConfigState {
  /** 登録済み MCP サーバー一覧 / Registered MCP servers */
  servers: McpServerEntry[];

  // ── Actions ──

  /**
   * サーバーを追加する。同名がある場合は上書き。
   * Add a server. Overwrites if a server with the same name exists.
   */
  addServer: (name: string, config: McpServerConfig) => void;

  /**
   * サーバーを削除する。
   * Remove a server by name.
   */
  removeServer: (name: string) => void;

  /**
   * サーバー設定を更新する。
   * Update a server's config.
   */
  updateServer: (name: string, config: McpServerConfig) => void;

  /**
   * サーバーの有効/無効を切り替える。
   * Toggle a server's enabled state.
   */
  toggleServer: (name: string, enabled: boolean) => void;

  /**
   * サーバーの接続ステータスを更新する。
   * Update a server's connection status.
   */
  setServerStatus: (
    name: string,
    status: McpConnectionStatus,
    error?: string,
    tools?: McpServerTool[],
  ) => void;

  /**
   * 複数のサーバーのステータスを一括更新する。
   * Batch update statuses for multiple servers.
   */
  updateStatuses: (
    statuses: Array<{
      name: string;
      status: McpConnectionStatus;
      error?: string;
      tools?: McpServerTool[];
    }>,
  ) => void;

  /**
   * 外部設定（Claude Code の claude_desktop_config.json 等）からインポートする。
   * Import servers from external config (e.g. Claude Code's claude_desktop_config.json).
   *
   * 既存のサーバーと名前が重複するものはスキップする。
   * Skips servers whose names already exist.
   */
  importServers: (entries: Array<{ name: string; config: McpServerConfig }>) => void;

  /**
   * 全サーバーをクリアする。
   * Clear all servers.
   */
  clearAll: () => void;
}

/** partialize / migrate で保存するスライスの型。Type for persisted slice. */
type McpPersistedSlice = Pick<McpConfigState, "servers">;

/**
 * 永続化時に env / headers を除いた設定を返す（localStorage に機密を載せない）。
 * Returns config without env/headers for persistence (no secrets in localStorage).
 */
export function stripSensitiveConfigForPersist(config: McpServerConfig): McpServerConfig {
  if (config.type === "stdio") {
    return {
      type: "stdio",
      command: config.command,
      args: config.args,
    };
  }
  if (config.type === "http") {
    return {
      type: "http",
      url: config.url,
    };
  }
  return {
    type: "sse",
    url: config.url,
  };
}

/**
 * 有効なサーバーを SDK の `options.mcpServers` に渡す Record 形式に変換する。
 * Converts enabled servers to the Record format expected by SDK's `options.mcpServers`.
 */
export function getMcpServersForQuery(servers: McpServerEntry[]): McpServersRecord | undefined {
  const enabled = servers.filter((s) => s.enabled);
  if (enabled.length === 0) return undefined;

  const record: McpServersRecord = {};
  for (const entry of enabled) {
    record[entry.name] = entry.config;
  }
  return record;
}

/**
 * MCP サーバー設定の Zustand ストア（永続化あり）。
 * Zustand store for MCP server settings (persisted).
 */
export const useMcpConfigStore = create<McpConfigState>()(
  persist(
    (set) => ({
      servers: [],

      addServer: (name, config) =>
        set((state) => {
          const existing = state.servers.findIndex((s) => s.name === name);
          const entry: McpServerEntry = {
            name,
            config,
            enabled: true,
            status: "unknown",
          };
          if (existing >= 0) {
            const updated = [...state.servers];
            updated[existing] = entry;
            return { servers: updated };
          }
          return { servers: [...state.servers, entry] };
        }),

      removeServer: (name) =>
        set((state) => ({
          servers: state.servers.filter((s) => s.name !== name),
        })),

      updateServer: (name, config) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.name === name ? { ...s, config, status: "unknown" as const } : s,
          ),
        })),

      toggleServer: (name, enabled) =>
        set((state) => ({
          servers: state.servers.map((s) => (s.name === name ? { ...s, enabled } : s)),
        })),

      setServerStatus: (name, status, error, tools) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.name === name ? { ...s, status, error, tools: tools ?? s.tools } : s,
          ),
        })),

      updateStatuses: (statuses) =>
        set((state) => {
          const statusMap = new Map(statuses.map((s) => [s.name, s]));
          return {
            servers: state.servers.map((s) => {
              const update = statusMap.get(s.name);
              if (!update) return s;
              return {
                ...s,
                status: update.status,
                error: update.error,
                tools: update.tools ?? s.tools,
              };
            }),
          };
        }),

      importServers: (entries) =>
        set((state) => {
          const existingNames = new Set(state.servers.map((s) => s.name));
          const newEntries: McpServerEntry[] = entries
            .filter((e) => !existingNames.has(e.name))
            .map((e) => ({
              name: e.name,
              config: e.config,
              enabled: true,
              status: "unknown" as const,
            }));
          return { servers: [...state.servers, ...newEntries] };
        }),

      clearAll: () => set({ servers: [] }),
    }),
    {
      name: "mcp-config-storage",
      version: 2,
      migrate: (persistedState, fromVersion) => {
        if (
          fromVersion < 2 &&
          persistedState &&
          typeof persistedState === "object" &&
          "servers" in persistedState
        ) {
          const ps = persistedState as { servers: McpServerEntry[] };
          return {
            servers: ps.servers.map((s) => ({
              ...s,
              config: stripSensitiveConfigForPersist(s.config),
            })),
          } satisfies McpPersistedSlice;
        }
        return persistedState as McpPersistedSlice;
      },
      partialize: (state) => ({
        servers: state.servers.map((s) => ({
          name: s.name,
          config: stripSensitiveConfigForPersist(s.config),
          enabled: s.enabled,
          status: "unknown" as McpConnectionStatus,
        })),
      }),
    },
  ),
);
