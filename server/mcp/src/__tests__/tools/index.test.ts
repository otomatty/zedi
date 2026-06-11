/**
 * tools/index.ts のユニットテスト
 *
 * `server.test.ts` は MCP クライアント経由で end-to-end の挙動を見ているのに対し、
 * このテストは `registerAllTools` と各ツールハンドラを直接検証する。
 *
 * - `ALL_TOOL_NAMES` のメタ情報整合性
 * - 各ツールハンドラが `ZediClient` を正しい引数で呼び出すこと
 * - 成功時は JSON content、API 失敗時は `isError` になること
 *
 * Unit tests for the registry contract and per-tool handler wiring.
 */
import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer } from "../../server.js";
import type { ZediClient } from "../../client/ZediClient.js";
import { ZediApiError } from "../../client/errors.js";
import { jsonResult, textResult, type ToolResult } from "../../tools/helpers.js";
import { ALL_TOOL_NAMES, registerAllTools } from "../../tools/index.js";

/** Tools already exercised end-to-end in `server.test.ts`. / server.test.ts で e2e 済みのツール */
const TOOLS_COVERED_IN_SERVER_TEST = new Set<string>([
  "zedi_get_current_user",
  "zedi_list_pages",
  "zedi_get_page",
  "zedi_create_page",
  "zedi_search",
  "zedi_clip_url",
]);

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Build a fully-mocked ZediClient. Tools call only the methods we register, so types are safe.
 * 全メソッドをモック化した ZediClient。
 */
function createMockClient(): ZediClient {
  return {
    getCurrentUser: vi.fn(),
    listPages: vi.fn(),
    getPageContent: vi.fn(),
    createPage: vi.fn(),
    deletePage: vi.fn(),
    listNotes: vi.fn(),
    getNote: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    addPageToNote: vi.fn(),
    removePageFromNote: vi.fn(),
    reorderNotePages: vi.fn(),
    listNotePages: vi.fn(),
    listNoteMembers: vi.fn(),
    addNoteMember: vi.fn(),
    updateNoteMember: vi.fn(),
    removeNoteMember: vi.fn(),
    search: vi.fn(),
    clipUrl: vi.fn(),
  };
}

/** Captures registerTool calls including handler functions. / 登録呼び出しとハンドラを記録するスタブ */
function createServerStub(): {
  server: Pick<McpServer, "registerTool">;
  registered: string[];
  handlers: Map<string, ToolHandler>;
} {
  const registered: string[] = [];
  const handlers = new Map<string, ToolHandler>();
  const server = {
    registerTool: ((name: string, _config: unknown, handler: ToolHandler) => {
      registered.push(name);
      handlers.set(name, handler);
      return {} as unknown;
    }) as unknown as McpServer["registerTool"],
  };
  return { server: server as Pick<McpServer, "registerTool">, registered, handlers };
}

function expectJsonContent(result: ToolResult): unknown {
  expect(result.isError).toBeFalsy();
  expect(result.content[0]?.type).toBe("text");
  return JSON.parse(result.content[0]?.text ?? "");
}

interface ToolHandlerCase {
  name: (typeof ALL_TOOL_NAMES)[number];
  args: Record<string, unknown>;
  setup: (client: ZediClient) => void;
  assertClient: (client: ZediClient) => void;
  expectedPayload?: unknown;
}

const TOOL_HANDLER_CASES: ToolHandlerCase[] = [
  {
    name: "zedi_get_current_user",
    args: {},
    setup: (client) => {
      vi.mocked(client.getCurrentUser).mockResolvedValue({
        id: "user-1",
        email: "a@b.c",
        name: "Alice",
        image: null,
      });
    },
    assertClient: (client) => {
      expect(client.getCurrentUser).toHaveBeenCalledOnce();
    },
    expectedPayload: { id: "user-1", email: "a@b.c", name: "Alice", image: null },
  },
  {
    name: "zedi_list_pages",
    args: { limit: 5, offset: 0, scope: "shared" },
    setup: (client) => {
      vi.mocked(client.listPages).mockResolvedValue([
        {
          id: "p1",
          title: "Page",
          content_preview: null,
          updated_at: "2026-01-01T00:00:00Z",
          note_id: null,
        },
      ]);
    },
    assertClient: (client) => {
      expect(client.listPages).toHaveBeenCalledWith({ limit: 5, offset: 0, scope: "shared" });
    },
  },
  {
    name: "zedi_get_page",
    args: { page_id: "p1" },
    setup: (client) => {
      vi.mocked(client.getPageContent).mockResolvedValue({
        id: "p1",
        title: "Hello",
        content_text: "body",
        content_preview: "Hello",
        version: 1,
        updated_at: "2026-01-01T00:00:00Z",
      });
    },
    assertClient: (client) => {
      expect(client.getPageContent).toHaveBeenCalledWith("p1");
    },
  },
  {
    name: "zedi_create_page",
    args: { title: "New page" },
    setup: (client) => {
      vi.mocked(client.createPage).mockResolvedValue({
        id: "page-1",
        owner_id: "user-1",
        title: "New page",
        content_preview: null,
        thumbnail_url: null,
        source_url: null,
        source_page_id: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        is_deleted: false,
      });
    },
    assertClient: (client) => {
      expect(client.createPage).toHaveBeenCalledWith({ title: "New page" });
    },
  },
  {
    name: "zedi_delete_page",
    args: { page_id: "p1" },
    setup: (client) => {
      vi.mocked(client.deletePage).mockResolvedValue({ id: "p1", deleted: true });
    },
    assertClient: (client) => {
      expect(client.deletePage).toHaveBeenCalledWith("p1");
    },
    expectedPayload: { id: "p1", deleted: true },
  },
  {
    name: "zedi_list_notes",
    args: {},
    setup: (client) => {
      vi.mocked(client.listNotes).mockResolvedValue([
        {
          id: "n1",
          title: "Note",
          visibility: "private",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ]);
    },
    assertClient: (client) => {
      expect(client.listNotes).toHaveBeenCalledOnce();
    },
  },
  {
    name: "zedi_get_note",
    args: { note_id: "n1" },
    setup: (client) => {
      vi.mocked(client.getNote).mockResolvedValue({
        id: "n1",
        title: "Note",
        visibility: "private",
        edit_permission: "owner_only",
        is_official: false,
        owner_id: "user-1",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        role: "owner",
        pages: [],
      });
    },
    assertClient: (client) => {
      expect(client.getNote).toHaveBeenCalledWith("n1");
    },
  },
  {
    name: "zedi_create_note",
    args: { title: "Draft" },
    setup: (client) => {
      vi.mocked(client.createNote).mockResolvedValue({
        id: "n1",
        title: "Draft",
        visibility: "private",
        edit_permission: "owner_only",
        is_official: false,
        owner_id: "user-1",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      });
    },
    assertClient: (client) => {
      expect(client.createNote).toHaveBeenCalledWith({ title: "Draft" });
    },
  },
  {
    name: "zedi_update_note",
    args: { note_id: "n1", title: "Renamed" },
    setup: (client) => {
      vi.mocked(client.updateNote).mockResolvedValue({
        id: "n1",
        title: "Renamed",
        visibility: "private",
        edit_permission: "owner_only",
        is_official: false,
        owner_id: "user-1",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      });
    },
    assertClient: (client) => {
      expect(client.updateNote).toHaveBeenCalledWith("n1", { title: "Renamed" });
    },
  },
  {
    name: "zedi_delete_note",
    args: { note_id: "n1" },
    setup: (client) => {
      vi.mocked(client.deleteNote).mockResolvedValue({ deleted: true });
    },
    assertClient: (client) => {
      expect(client.deleteNote).toHaveBeenCalledWith("n1");
    },
    expectedPayload: { deleted: true },
  },
  {
    name: "zedi_list_note_pages",
    args: { note_id: "n1" },
    setup: (client) => {
      vi.mocked(client.listNotePages).mockResolvedValue([
        {
          id: "p1",
          title: "In note",
          content_preview: null,
          updated_at: "2026-01-01T00:00:00Z",
          note_id: "n1",
        },
      ]);
    },
    assertClient: (client) => {
      expect(client.listNotePages).toHaveBeenCalledWith("n1");
    },
  },
  {
    name: "zedi_add_page_to_note",
    args: { note_id: "n1", title: "Attached" },
    setup: (client) => {
      vi.mocked(client.addPageToNote).mockResolvedValue({
        id: "p1",
        title: "Attached",
        note_id: "n1",
      });
    },
    assertClient: (client) => {
      expect(client.addPageToNote).toHaveBeenCalledWith("n1", { title: "Attached" });
    },
  },
  {
    name: "zedi_remove_page_from_note",
    args: { note_id: "n1", page_id: "p1" },
    setup: (client) => {
      vi.mocked(client.removePageFromNote).mockResolvedValue({ removed: true });
    },
    assertClient: (client) => {
      expect(client.removePageFromNote).toHaveBeenCalledWith("n1", "p1");
    },
    expectedPayload: { removed: true },
  },
  {
    name: "zedi_reorder_note_pages",
    args: { note_id: "n1", page_ids: ["p2", "p1"] },
    setup: (client) => {
      vi.mocked(client.reorderNotePages).mockResolvedValue({ reordered: true });
    },
    assertClient: (client) => {
      expect(client.reorderNotePages).toHaveBeenCalledWith("n1", ["p2", "p1"]);
    },
    expectedPayload: { reordered: true },
  },
  {
    name: "zedi_list_note_members",
    args: { note_id: "n1" },
    setup: (client) => {
      vi.mocked(client.listNoteMembers).mockResolvedValue([
        { email: "a@b.c", role: "viewer", accepted: true },
      ]);
    },
    assertClient: (client) => {
      expect(client.listNoteMembers).toHaveBeenCalledWith("n1");
    },
  },
  {
    name: "zedi_add_note_member",
    args: { note_id: "n1", email: "guest@example.com", role: "viewer" },
    setup: (client) => {
      vi.mocked(client.addNoteMember).mockResolvedValue({
        email: "guest@example.com",
        role: "viewer",
        accepted: false,
      });
    },
    assertClient: (client) => {
      expect(client.addNoteMember).toHaveBeenCalledWith("n1", {
        email: "guest@example.com",
        role: "viewer",
      });
    },
  },
  {
    name: "zedi_update_note_member",
    args: { note_id: "n1", email: "guest@example.com", role: "editor" },
    setup: (client) => {
      vi.mocked(client.updateNoteMember).mockResolvedValue({
        email: "guest@example.com",
        role: "editor",
        accepted: true,
      });
    },
    assertClient: (client) => {
      expect(client.updateNoteMember).toHaveBeenCalledWith("n1", "guest@example.com", "editor");
    },
  },
  {
    name: "zedi_remove_note_member",
    args: { note_id: "n1", email: "guest@example.com" },
    setup: (client) => {
      vi.mocked(client.removeNoteMember).mockResolvedValue({ removed: true });
    },
    assertClient: (client) => {
      expect(client.removeNoteMember).toHaveBeenCalledWith("n1", "guest@example.com");
    },
    expectedPayload: { removed: true },
  },
  {
    name: "zedi_search",
    args: { query: "hello", scope: "own", limit: 3, note_id: "n1" },
    setup: (client) => {
      vi.mocked(client.search).mockResolvedValue([
        {
          id: "p1",
          title: "match",
          content_preview: null,
          updated_at: "2026-01-01T00:00:00Z",
          note_id: "n1",
        },
      ]);
    },
    assertClient: (client) => {
      expect(client.search).toHaveBeenCalledWith({
        query: "hello",
        scope: "own",
        limit: 3,
        noteId: "n1",
      });
    },
  },
  {
    name: "zedi_clip_url",
    args: { url: "https://example.com/article" },
    setup: (client) => {
      vi.mocked(client.clipUrl).mockResolvedValue({ page_id: "p9", title: "Clipped" });
    },
    assertClient: (client) => {
      expect(client.clipUrl).toHaveBeenCalledWith("https://example.com/article");
    },
    expectedPayload: { page_id: "p9", title: "Clipped" },
  },
];

describe("ALL_TOOL_NAMES", () => {
  it("contains no duplicates", () => {
    const set = new Set(ALL_TOOL_NAMES);
    expect(set.size).toBe(ALL_TOOL_NAMES.length);
  });

  it("uses the zedi_ prefix consistently", () => {
    for (const name of ALL_TOOL_NAMES) {
      expect(name).toMatch(/^zedi_[a-z0-9_]+$/);
    }
  });

  it("includes the canonical user / pages / notes / search / clip surface", () => {
    const required = [
      "zedi_get_current_user",
      "zedi_list_pages",
      "zedi_get_page",
      "zedi_create_page",
      "zedi_delete_page",
      "zedi_list_notes",
      "zedi_get_note",
      "zedi_create_note",
      "zedi_update_note",
      "zedi_delete_note",
      "zedi_list_note_pages",
      "zedi_add_page_to_note",
      "zedi_remove_page_from_note",
      "zedi_reorder_note_pages",
      "zedi_list_note_members",
      "zedi_add_note_member",
      "zedi_update_note_member",
      "zedi_remove_note_member",
      "zedi_search",
      "zedi_clip_url",
    ];
    for (const name of required) {
      expect(ALL_TOOL_NAMES).toContain(name);
    }
  });

  it("does not re-introduce retired write tools (read-only contract after #889 Phase 5)", () => {
    const retired = ["zedi_update_page_content"];
    for (const name of retired) {
      expect(ALL_TOOL_NAMES).not.toContain(name);
    }
  });
});

describe("registerAllTools", () => {
  it("registers exactly the tools listed in ALL_TOOL_NAMES (no extras, no missing)", () => {
    const { server, registered } = createServerStub();
    registerAllTools(server as unknown as McpServer, createMockClient());

    expect(registered.sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("registers each tool exactly once (no double registration)", () => {
    const { server, registered } = createServerStub();
    registerAllTools(server as unknown as McpServer, createMockClient());

    const counts = new Map<string, number>();
    for (const name of registered) counts.set(name, (counts.get(name) ?? 0) + 1);
    for (const [name, count] of counts) {
      expect(count, `tool ${name} should be registered once`).toBe(1);
    }
  });

  it("registers ALL_TOOL_NAMES.length tools total", () => {
    const { server, registered } = createServerStub();
    registerAllTools(server as unknown as McpServer, createMockClient());

    expect(registered).toHaveLength(ALL_TOOL_NAMES.length);
  });
});

describe("registerAllTools tool handlers", () => {
  it.each(TOOL_HANDLER_CASES.filter(({ name }) => !TOOLS_COVERED_IN_SERVER_TEST.has(name)))(
    "$name invokes client and returns JSON content",
    async ({ name, args, setup, assertClient, expectedPayload }) => {
      const client = createMockClient();
      setup(client);
      const { server, handlers } = createServerStub();
      registerAllTools(server as unknown as McpServer, client);

      const handler = handlers.get(name);
      expect(handler, `handler for ${name} should be registered`).toBeDefined();
      if (!handler) {
        throw new Error(`handler for ${name} should be registered`);
      }

      const result = await handler(args);
      assertClient(client);
      const parsed = expectJsonContent(result);
      if (expectedPayload !== undefined) {
        expect(parsed).toEqual(expectedPayload);
      }
    },
  );

  it("zedi_delete_note returns isError when the API rejects the call", async () => {
    const client = createMockClient();
    vi.mocked(client.deleteNote).mockRejectedValue(new ZediApiError(403, "forbidden"));
    const { server, handlers } = createServerStub();
    registerAllTools(server as unknown as McpServer, client);

    const deleteHandler = handlers.get("zedi_delete_note");
    expect(deleteHandler).toBeDefined();
    if (!deleteHandler) {
      throw new Error("zedi_delete_note handler should be registered");
    }
    const result = await deleteHandler({ note_id: "n1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("HTTP 403");
    expect(result.content[0]?.text).toContain("forbidden");
  });

  it("rejects invalid tool arguments via MCP schema validation", async () => {
    const client = createMockClient();
    const server = createMcpServer(client);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const mcpClient = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await mcpClient.connect(clientTransport);

    const result = await mcpClient.callTool({
      name: "zedi_add_note_member",
      arguments: { note_id: "n1", email: "not-an-email", role: "viewer" },
    });

    expect(result.isError).toBe(true);
    expect(client.addNoteMember).not.toHaveBeenCalled();
  });
});

describe("jsonResult / textResult helpers", () => {
  it("jsonResult serializes data as formatted JSON text content", () => {
    const result = jsonResult({ ok: true, count: 2 });
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ ok: true, count: 2 }, null, 2) },
    ]);
  });

  it("textResult wraps plain text in a single content item", () => {
    const result = textResult("hello");
    expect(result).toEqual({ content: [{ type: "text", text: "hello" }] });
  });
});
