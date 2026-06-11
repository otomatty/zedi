import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import {
  stripSensitiveConfigForPersist,
  getMcpServersForQuery,
  useMcpConfigStore,
} from "./mcpConfigStore";
import type { McpServerConfig, McpServerEntry } from "../types/mcp";

const STDIO_CONFIG: McpServerConfig = {
  type: "stdio",
  command: "npx",
  args: ["-y", "mcp"],
  env: { TOKEN: "secret" },
};

const HTTP_CONFIG: McpServerConfig = {
  type: "http",
  url: "https://example.com/mcp",
  headers: { Authorization: "Bearer secret" },
};

function resetStore(): void {
  act(() => {
    useMcpConfigStore.setState({ servers: [] });
  });
}

function makeEntry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    name: "server-a",
    config: STDIO_CONFIG,
    enabled: true,
    status: "unknown",
    ...overrides,
  };
}

describe("stripSensitiveConfigForPersist", () => {
  it("drops env for stdio", () => {
    const c = stripSensitiveConfigForPersist({
      type: "stdio",
      command: "npx",
      args: ["a"],
      env: { TOKEN: "secret" },
    });
    expect(c).toEqual({ type: "stdio", command: "npx", args: ["a"] });
  });

  it("drops headers for http", () => {
    const c = stripSensitiveConfigForPersist({
      type: "http",
      url: "https://x/mcp",
      headers: { h: "v" },
    });
    expect(c).toEqual({ type: "http", url: "https://x/mcp" });
  });

  it("drops headers for sse", () => {
    const c = stripSensitiveConfigForPersist({
      type: "sse",
      url: "https://x/sse",
      headers: { h: "v" },
    });
    expect(c).toEqual({ type: "sse", url: "https://x/sse" });
  });
});

describe("getMcpServersForQuery", () => {
  it("returns undefined for an empty list", () => {
    expect(getMcpServersForQuery([])).toBeUndefined();
  });

  it("returns undefined when every server is disabled", () => {
    expect(
      getMcpServersForQuery([
        makeEntry({ name: "a", enabled: false }),
        makeEntry({ name: "b", enabled: false }),
      ]),
    ).toBeUndefined();
  });

  it("returns a record of enabled servers with raw config", () => {
    const record = getMcpServersForQuery([
      makeEntry({ name: "enabled", enabled: true, config: STDIO_CONFIG }),
      makeEntry({ name: "disabled", enabled: false, config: HTTP_CONFIG }),
    ]);

    expect(record).toEqual({
      enabled: STDIO_CONFIG,
    });
  });
});

describe("useMcpConfigStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it("starts with an empty server list", () => {
    expect(useMcpConfigStore.getState().servers).toEqual([]);
  });

  describe("addServer", () => {
    it("appends a new server with enabled=true and status=unknown", () => {
      useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);

      expect(useMcpConfigStore.getState().servers).toEqual([
        {
          name: "alpha",
          config: STDIO_CONFIG,
          enabled: true,
          status: "unknown",
        },
      ]);
    });

    it("overwrites an existing server in place and resets enabled/status", () => {
      act(() => {
        useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
        useMcpConfigStore.getState().toggleServer("alpha", false);
        useMcpConfigStore
          .getState()
          .setServerStatus("alpha", "connected", undefined, [{ name: "tool", description: "d" }]);
        useMcpConfigStore.getState().addServer("alpha", HTTP_CONFIG);
      });

      const [entry] = useMcpConfigStore.getState().servers;
      expect(entry).toEqual({
        name: "alpha",
        config: HTTP_CONFIG,
        enabled: true,
        status: "unknown",
      });
      expect(useMcpConfigStore.getState().servers).toHaveLength(1);
    });
  });

  describe("removeServer", () => {
    it("removes an existing server", () => {
      useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
      useMcpConfigStore.getState().removeServer("alpha");

      expect(useMcpConfigStore.getState().servers).toEqual([]);
    });

    it("is a no-op for unknown names", () => {
      useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
      useMcpConfigStore.getState().removeServer("missing");

      expect(useMcpConfigStore.getState().servers).toHaveLength(1);
    });
  });

  describe("updateServer", () => {
    it("updates config and resets status to unknown while keeping enabled/error/tools", () => {
      act(() => {
        useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
        useMcpConfigStore.getState().toggleServer("alpha", false);
        useMcpConfigStore
          .getState()
          .setServerStatus("alpha", "failed", "boom", [{ name: "tool", description: "d" }]);
        useMcpConfigStore.getState().updateServer("alpha", HTTP_CONFIG);
      });

      expect(useMcpConfigStore.getState().servers[0]).toEqual({
        name: "alpha",
        config: HTTP_CONFIG,
        enabled: false,
        status: "unknown",
        error: "boom",
        tools: [{ name: "tool", description: "d" }],
      });
    });

    it("does not add a server when the name is missing", () => {
      useMcpConfigStore.getState().updateServer("missing", HTTP_CONFIG);

      expect(useMcpConfigStore.getState().servers).toEqual([]);
    });
  });

  describe("toggleServer", () => {
    it("toggles enabled without touching status or config", () => {
      useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
      useMcpConfigStore.getState().setServerStatus("alpha", "connected");
      useMcpConfigStore.getState().toggleServer("alpha", false);

      expect(useMcpConfigStore.getState().servers[0]?.enabled).toBe(false);
      expect(useMcpConfigStore.getState().servers[0]?.status).toBe("connected");
      expect(useMcpConfigStore.getState().servers[0]?.config).toEqual(STDIO_CONFIG);
    });
  });

  describe("setServerStatus", () => {
    it("updates status, error, and tools", () => {
      const tools = [{ name: "search", description: "search" }];
      useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
      useMcpConfigStore.getState().setServerStatus("alpha", "connected", undefined, tools);

      expect(useMcpConfigStore.getState().servers[0]).toMatchObject({
        status: "connected",
        error: undefined,
        tools,
      });
    });

    it("keeps existing tools when tools argument is undefined", () => {
      const tools = [{ name: "search", description: "search" }];
      act(() => {
        useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
        useMcpConfigStore.getState().setServerStatus("alpha", "connected", undefined, tools);
        useMcpConfigStore.getState().setServerStatus("alpha", "pending");
      });

      expect(useMcpConfigStore.getState().servers[0]?.tools).toEqual(tools);
    });

    it("clears error when error is explicitly undefined", () => {
      act(() => {
        useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
        useMcpConfigStore.getState().setServerStatus("alpha", "failed", "boom");
        useMcpConfigStore.getState().setServerStatus("alpha", "connected", undefined);
      });

      expect(useMcpConfigStore.getState().servers[0]?.error).toBeUndefined();
    });
  });

  describe("updateStatuses", () => {
    it("batch-updates only matching servers", () => {
      act(() => {
        useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
        useMcpConfigStore.getState().addServer("beta", HTTP_CONFIG);
        useMcpConfigStore.getState().updateStatuses([
          { name: "alpha", status: "connected" },
          { name: "missing", status: "failed", error: "x" },
        ]);
      });

      const servers = useMcpConfigStore.getState().servers;
      expect(servers.find((s) => s.name === "alpha")?.status).toBe("connected");
      expect(servers.find((s) => s.name === "beta")?.status).toBe("unknown");
    });

    it("is a no-op for an empty batch", () => {
      useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
      useMcpConfigStore.getState().updateStatuses([]);

      expect(useMcpConfigStore.getState().servers[0]?.status).toBe("unknown");
    });
  });

  describe("importServers", () => {
    it("is a no-op for an empty import list", () => {
      useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
      useMcpConfigStore.getState().importServers([]);

      expect(useMcpConfigStore.getState().servers).toHaveLength(1);
    });

    it("appends only new names", () => {
      useMcpConfigStore.getState().addServer("existing", STDIO_CONFIG);
      useMcpConfigStore.getState().importServers([
        { name: "existing", config: HTTP_CONFIG },
        { name: "new-one", config: HTTP_CONFIG },
      ]);

      const servers = useMcpConfigStore.getState().servers;
      expect(servers).toHaveLength(2);
      expect(servers.find((s) => s.name === "existing")?.config).toEqual(STDIO_CONFIG);
      expect(servers.find((s) => s.name === "new-one")).toEqual({
        name: "new-one",
        config: HTTP_CONFIG,
        enabled: true,
        status: "unknown",
      });
    });
  });

  describe("clearAll", () => {
    it("removes every server", () => {
      useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
      useMcpConfigStore.getState().clearAll();

      expect(useMcpConfigStore.getState().servers).toEqual([]);
    });
  });

  describe("persist + partialize", () => {
    it("persists only stripped config and normalizes status to unknown", () => {
      act(() => {
        useMcpConfigStore.getState().addServer("alpha", STDIO_CONFIG);
        useMcpConfigStore
          .getState()
          .setServerStatus("alpha", "connected", "err", [{ name: "tool", description: "d" }]);
        useMcpConfigStore.getState().toggleServer("alpha", false);
      });

      const raw = localStorage.getItem("mcp-config-storage");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string) as {
        state: { servers: Array<Record<string, unknown>> };
      };

      expect(parsed.state.servers).toEqual([
        {
          name: "alpha",
          config: { type: "stdio", command: "npx", args: ["-y", "mcp"] },
          enabled: false,
          status: "unknown",
        },
      ]);
      expect(parsed.state.servers[0]).not.toHaveProperty("error");
      expect(parsed.state.servers[0]).not.toHaveProperty("tools");
    });

    it("rehydrates persisted servers", async () => {
      localStorage.setItem(
        "mcp-config-storage",
        JSON.stringify({
          version: 2,
          state: {
            servers: [
              {
                name: "alpha",
                config: { type: "http", url: "https://example.com/mcp" },
                enabled: true,
                status: "unknown",
              },
            ],
          },
        }),
      );

      await useMcpConfigStore.persist.rehydrate();

      expect(useMcpConfigStore.getState().servers).toEqual([
        {
          name: "alpha",
          config: { type: "http", url: "https://example.com/mcp" },
          enabled: true,
          status: "unknown",
        },
      ]);
    });

    it("leaves v2 persisted data unchanged on rehydrate", async () => {
      const persisted = {
        name: "alpha",
        config: { type: "http" as const, url: "https://example.com/mcp" },
        enabled: false,
        status: "unknown" as const,
      };
      localStorage.setItem(
        "mcp-config-storage",
        JSON.stringify({
          version: 2,
          state: { servers: [persisted] },
        }),
      );

      await useMcpConfigStore.persist.rehydrate();

      expect(useMcpConfigStore.getState().servers[0]).toEqual(persisted);
    });

    it("migrates v1 persisted configs by stripping secrets", async () => {
      localStorage.setItem(
        "mcp-config-storage",
        JSON.stringify({
          version: 1,
          state: {
            servers: [
              {
                name: "alpha",
                config: STDIO_CONFIG,
                enabled: true,
                status: "connected",
              },
            ],
          },
        }),
      );

      await useMcpConfigStore.persist.rehydrate();

      expect(useMcpConfigStore.getState().servers[0]?.config).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "mcp"],
      });
    });
  });
});
