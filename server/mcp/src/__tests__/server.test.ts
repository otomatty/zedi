/**
 * createMcpServer のエンドツーエンド近似テスト
 *
 * - InMemoryTransport で MCP クライアント ⇄ サーバを直結し、
 *   listTools / callTool が想定通り動くことを確認する
 * - ZediClient はモックして、tools が正しい引数で呼び出されるかも検証する
 *
 * Near end-to-end tests for createMcpServer using the in-memory transport.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server.js";
import { ALL_TOOL_NAMES } from "../tools/index.js";
import type { ZediClient } from "../client/ZediClient.js";
import { ZediApiError } from "../client/errors.js";

/** Build a fully-mocked ZediClient where every method is a vi.fn(). / 全メソッドをモック化した ZediClient を生成する */
function createMockClient(): ZediClient {
  return {
    getCurrentUser: vi.fn(),
    listPages: vi.fn(),
    getPageContent: vi.fn(),
    createPage: vi.fn(),
    updatePageContent: vi.fn(),
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

async function connectClientToServer(client: ZediClient): Promise<Client> {
  const server = createMcpServer(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
  await mcpClient.connect(clientTransport);
  return mcpClient;
}

describe("createMcpServer", () => {
  let mockClient: ZediClient;
  let mcpClient: Client;

  beforeEach(async () => {
    mockClient = createMockClient();
    mcpClient = await connectClientToServer(mockClient);
  });

  it("registers every tool listed in ALL_TOOL_NAMES", async () => {
    const list = await mcpClient.listTools();
    const names = list.tools.map((t) => t.name).sort();
    expect(names).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("zedi_get_current_user calls client.getCurrentUser and returns JSON content", async () => {
    vi.mocked(mockClient.getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "a@b.c",
      name: "Alice",
      image: null,
    });
    const result = await mcpClient.callTool({ name: "zedi_get_current_user", arguments: {} });
    expect(mockClient.getCurrentUser).toHaveBeenCalledOnce();
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.id).toBe("user-1");
  });

  it("zedi_list_pages forwards limit/offset/scope to client.listPages", async () => {
    vi.mocked(mockClient.listPages).mockResolvedValue([
      {
        id: "p1",
        title: "Hello",
        content_preview: null,
        updated_at: "2026-01-01T00:00:00Z",
        note_id: null,
      },
    ]);
    const result = await mcpClient.callTool({
      name: "zedi_list_pages",
      arguments: { limit: 5, offset: 0, scope: "shared" },
    });
    expect(result.isError).toBeFalsy();
    expect(mockClient.listPages).toHaveBeenCalledWith({
      limit: 5,
      offset: 0,
      scope: "shared",
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed[0].id).toBe("p1");
  });

  it("zedi_create_page forwards arguments to client.createPage", async () => {
    vi.mocked(mockClient.createPage).mockResolvedValue({
      id: "page-1",
      owner_id: "user-1",
      title: "Hello",
      content_preview: null,
      thumbnail_url: null,
      source_url: null,
      source_page_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      is_deleted: false,
    });
    const result = await mcpClient.callTool({
      name: "zedi_create_page",
      arguments: { title: "Hello" },
    });
    expect(result.isError).toBeFalsy();
    expect(mockClient.createPage).toHaveBeenCalledWith({ title: "Hello" });
  });

  it("zedi_search forwards query, scope, and limit", async () => {
    vi.mocked(mockClient.search).mockResolvedValue([
      {
        id: "p1",
        title: "match",
        content_preview: null,
        updated_at: "2026-01-01T00:00:00Z",
        note_id: null,
      },
    ]);
    const result = await mcpClient.callTool({
      name: "zedi_search",
      arguments: { query: "hello", scope: "shared", limit: 10 },
    });
    expect(result.isError).toBeFalsy();
    expect(mockClient.search).toHaveBeenCalledWith({
      query: "hello",
      scope: "shared",
      limit: 10,
    });
  });

  it("zedi_search forwards note_id to client.search as noteId", async () => {
    // MCP の tool 引数 (snake_case) は ZediClient の `noteId` (camelCase) に正しく
    // マップされる必要がある。クロスリーク対策として Phase 5-2 の note-scoped API
    // に届く経路を検証する。
    // The snake_case tool arg must map to the camelCase `noteId` option on
    // ZediClient so the Phase 5-2 note-scoped endpoint actually gets used.
    vi.mocked(mockClient.search).mockResolvedValue([
      {
        id: "p2",
        title: "in-note",
        content_preview: null,
        updated_at: "2026-01-01T00:00:00Z",
        note_id: "note-1",
      },
    ]);
    const result = await mcpClient.callTool({
      name: "zedi_search",
      arguments: { query: "hello", note_id: "note-1", limit: 5 },
    });
    expect(result.isError).toBeFalsy();
    expect(mockClient.search).toHaveBeenCalledWith({
      query: "hello",
      noteId: "note-1",
      limit: 5,
    });
  });

  it("zedi_update_page_content includes expected_version", async () => {
    vi.mocked(mockClient.updatePageContent).mockResolvedValue({ version: 5 });
    const result = await mcpClient.callTool({
      name: "zedi_update_page_content",
      arguments: {
        page_id: "p1",
        ydoc_state: "BASE64",
        expected_version: 4,
        content_text: "x",
      },
    });
    expect(result.isError).toBeFalsy();
    expect(mockClient.updatePageContent).toHaveBeenCalledWith("p1", {
      ydoc_state: "BASE64",
      expected_version: 4,
      content_text: "x",
    });
  });

  it("converts ZediApiError into an isError result", async () => {
    vi.mocked(mockClient.getCurrentUser).mockRejectedValue(new ZediApiError(404, "user not found"));
    const result = await mcpClient.callTool({ name: "zedi_get_current_user", arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text?: string }>;
    expect(content[0]?.text).toContain("HTTP 404");
    expect(content[0]?.text).toContain("user not found");
  });

  it("network errors (status=0) become an isError result with 'network' label", async () => {
    vi.mocked(mockClient.getCurrentUser).mockRejectedValue(new ZediApiError(0, "ECONNREFUSED"));
    const result = await mcpClient.callTool({ name: "zedi_get_current_user", arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text?: string }>;
    expect(content[0]?.text).toContain("network");
  });

  it("zedi_clip_url forwards URL to client.clipUrl", async () => {
    vi.mocked(mockClient.clipUrl).mockResolvedValue({ page_id: "p9", title: "X" });
    const result = await mcpClient.callTool({
      name: "zedi_clip_url",
      arguments: { url: "https://example.com/a" },
    });
    expect(result.isError).toBeFalsy();
    expect(mockClient.clipUrl).toHaveBeenCalledWith("https://example.com/a");
  });
});
