/**
 * tools/index.ts のユニットテスト
 *
 * `server.test.ts` は MCP クライアント経由で end-to-end の挙動を見ているのに対し、
 * このテストは `registerAllTools` と `ALL_TOOL_NAMES` のメタ情報の整合性を直接検証する。
 *
 * - `ALL_TOOL_NAMES` は重複なく zedi_ 接頭辞のみで構成されること
 * - `registerAllTools(server, client)` は `ALL_TOOL_NAMES` の各要素を 1 度ずつ登録すること
 * - 既存ツール定義の一覧と完全に一致すること（追加・削除のたぶん漏れを検知する）
 *
 * Unit tests for the registry contract: `registerAllTools` registers exactly the tools
 * advertised in `ALL_TOOL_NAMES`. Catches silent additions or removals.
 */
import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZediClient } from "../../client/ZediClient.js";
import { ALL_TOOL_NAMES, registerAllTools } from "../../tools/index.js";

/** Build a fully-mocked ZediClient. Tools call only the methods we register, so types are safe. /
 *  全メソッドをモック化した ZediClient。 */
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

/** Captures registerTool calls so we can assert which tools were registered. / 登録呼び出しを記録するスタブ */
function createServerStub(): {
  server: Pick<McpServer, "registerTool">;
  registered: string[];
} {
  const registered: string[] = [];
  const server = {
    registerTool: ((name: string) => {
      registered.push(name);
      // Real `registerTool` returns a `RegisteredTool`, but tools/index.ts does not
      // consume the return value, so a no-op stub is sufficient.
      // 実装の戻り値は `RegisteredTool` だが、tools/index.ts は無視するため空 object を返す。
      return {} as unknown;
    }) as unknown as McpServer["registerTool"],
  };
  return { server: server as Pick<McpServer, "registerTool">, registered };
}

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
    // 仕様凍結のため必須ツールを明示的に列挙する。/ Lock the canonical surface in tests so silent removals are caught.
    const required = [
      "zedi_get_current_user",
      "zedi_list_pages",
      "zedi_get_page",
      "zedi_create_page",
      "zedi_update_page_content",
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
