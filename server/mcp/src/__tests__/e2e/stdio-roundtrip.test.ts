/**
 * stdio + HTTP のラウンドトリップを実プロセスで検証する E2E テスト
 *
 * 既存の unit テストはモック ZediClient で MCP サーバー単体を検証するが、本テストは:
 *   1. テスト用 Hono サーバーを起動して Zedi REST API を模擬する。
 *   2. 子プロセスとして `src/stdio.ts` を `node --import tsx` で起動する。
 *   3. `ZEDI_API_URL` / `ZEDI_MCP_TOKEN` を環境変数経由で渡し、CLI ログイン後の状態を再現する。
 *   4. `StdioClientTransport` で接続し、`tools/list` と pages CRUD のラウンドトリップを検証する。
 *
 * これにより、`stdio.ts` の env 解釈・`HttpZediClient` の URL 組み立て・MCP の JSON-RPC
 * ハンドシェイク〜tools/call 配線が壊れた瞬間に CI で気付ける。
 *
 * End-to-end test that exercises the real `src/stdio.ts` entry point against a
 * mocked Zedi REST API to catch regressions across the full stdio + HTTP path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { Hono } from "hono";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { ALL_TOOL_NAMES } from "../../tools/index.js";

/** モック API が受け入れる固定 Bearer トークン / Fixed bearer token accepted by the mock API. */
const TEST_TOKEN = "test-mcp-token";
/** モック API が `/api/users/me` で返すユーザー ID / User id returned by the mock `/api/users/me`. */
const TEST_USER_ID = "user-test-1";

/** モック API が内部で保持するページ状態 / In-memory page state kept by the mock API. */
interface StoredPage {
  id: string;
  owner_id: string;
  title: string | null;
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  source_page_id: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  content_text: string | null;
  version: number;
}

/**
 * Zedi REST API の最小モックを構築する (本テストで使用するエンドポイントのみ)。
 * Builds a minimal Hono mock of the Zedi REST API covering only the endpoints used here.
 */
function buildMockApi(): Hono {
  const app = new Hono();
  const pages = new Map<string, StoredPage>();
  let pageSeq = 0;

  app.use("*", async (c, next) => {
    const auth = c.req.header("Authorization");
    if (auth !== `Bearer ${TEST_TOKEN}`) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    await next();
  });

  app.get("/api/users/me", (c) =>
    c.json({
      id: TEST_USER_ID,
      email: "test@example.com",
      name: "Test User",
      image: null,
    }),
  );

  app.post("/api/pages", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    pageSeq += 1;
    const id = `page-${pageSeq}`;
    const now = "2026-01-01T00:00:00.000Z";
    const page: StoredPage = {
      id,
      owner_id: TEST_USER_ID,
      title: typeof body.title === "string" ? body.title : null,
      content_preview: typeof body.content_preview === "string" ? body.content_preview : null,
      thumbnail_url: typeof body.thumbnail_url === "string" ? body.thumbnail_url : null,
      source_url: typeof body.source_url === "string" ? body.source_url : null,
      source_page_id: null,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      content_text: null,
      version: 0,
    };
    pages.set(id, page);
    // PageRow の形だけを返す (本文は public-content エンドポイントから取得)。
    // Return only the PageRow shape; rendered text lives on the public-content endpoint.
    return c.json({
      id: page.id,
      owner_id: page.owner_id,
      title: page.title,
      content_preview: page.content_preview,
      thumbnail_url: page.thumbnail_url,
      source_url: page.source_url,
      source_page_id: page.source_page_id,
      created_at: page.created_at,
      updated_at: page.updated_at,
      is_deleted: page.is_deleted,
    });
  });

  // Issue #889 Phase 5: MCP は read-only `public-content` エンドポイントから本文を取得する。
  // Y.Doc バイト列はサーバ側でも意図的に返さない。
  // Issue #889 Phase 5: MCP reads page bodies via the read-only `public-content`
  // endpoint. Y.Doc bytes are intentionally omitted server-side as well.
  app.get("/api/pages/:id/public-content", (c) => {
    const id = c.req.param("id");
    const page = pages.get(id);
    if (!page || page.is_deleted) return c.json({ message: "not found" }, 404);
    return c.json({
      id: page.id,
      title: page.title,
      content_text: page.content_text,
      content_preview: page.content_preview,
      version: page.version,
      updated_at: page.updated_at,
    });
  });

  app.delete("/api/pages/:id", (c) => {
    const id = c.req.param("id");
    const page = pages.get(id);
    if (!page) return c.json({ message: "not found" }, 404);
    page.is_deleted = true;
    return c.json({ id, deleted: true });
  });

  app.all("*", (c) =>
    c.json({ message: `mock api: ${c.req.method} ${c.req.path} not implemented` }, 404),
  );

  return app;
}

const here = dirname(fileURLToPath(import.meta.url));
// `server/mcp/src/__tests__/e2e/` から `server/mcp/src/stdio.ts` を解決する。
// Resolve `server/mcp/src/stdio.ts` from this file's location.
const STDIO_ENTRY = resolve(here, "../../stdio.ts");
// `server/mcp/` (`tsx` を `node_modules` から解決させる作業ディレクトリ)。
// Working directory used so Node can resolve the local `tsx` loader.
const SERVER_MCP_DIR = resolve(here, "../../..");

describe("stdio MCP roundtrip", () => {
  // beforeAll で必ず代入される変数として宣言する (definite assignment)。
  // Declared with definite-assignment assertion; populated in beforeAll.
  let server: ServerType;
  let client: Client;
  let baseUrl = "";

  beforeAll(async () => {
    const app = buildMockApi();
    server = await new Promise<ServerType>((resolveSrv) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolveSrv(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // 環境変数は string のみ許容されるため、undefined を取り除いてコピーする。
    // Filter undefined entries because StdioClientTransport requires Record<string, string>.
    const childEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") childEnv[key] = value;
    }
    childEnv.ZEDI_API_URL = baseUrl;
    childEnv.ZEDI_MCP_TOKEN = TEST_TOKEN;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", STDIO_ENTRY],
      env: childEnv,
      cwd: SERVER_MCP_DIR,
      stderr: "inherit",
    });
    client = new Client({ name: "stdio-roundtrip-test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close().catch(() => undefined);
    if (server) {
      const srv = server;
      await new Promise<void>((res, rej) => {
        srv.close((err) => (err ? rej(err) : res()));
      });
    }
  });

  it("tools/list exposes every tool in ALL_TOOL_NAMES", async () => {
    const list = await client.listTools();
    const names = list.tools.map((t) => t.name).sort();
    expect(names).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("zedi_get_current_user reaches the mock API and returns the seeded profile", async () => {
    const result = await client.callTool({
      name: "zedi_get_current_user",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.id).toBe(TEST_USER_ID);
    expect(parsed.email).toBe("test@example.com");
  });

  it("create -> get -> delete page roundtrip via stdio (MCP is read-only after #889 Phase 5)", async () => {
    const created = await client.callTool({
      name: "zedi_create_page",
      arguments: { title: "E2E Page", content_preview: "preview" },
    });
    expect(created.isError).toBeFalsy();
    const createdParsed = JSON.parse(
      (created.content as Array<{ text?: string }>)[0]?.text ?? "",
    ) as { id: string; title: string | null; owner_id: string };
    expect(createdParsed.title).toBe("E2E Page");
    expect(createdParsed.owner_id).toBe(TEST_USER_ID);
    const pageId = createdParsed.id;
    expect(pageId).toMatch(/^page-/);

    // Issue #889 Phase 5: 取得は read-only `public-content` 経路。Y.Doc バイト列は
    // 含まれず、`id / title / content_text / content_preview / version / updated_at`
    // のみが返る。
    // Issue #889 Phase 5: reads flow through the read-only `public-content`
    // endpoint, which never exposes the Y.Doc bytes.
    const got = await client.callTool({
      name: "zedi_get_page",
      arguments: { page_id: pageId },
    });
    expect(got.isError).toBeFalsy();
    const gotParsed = JSON.parse((got.content as Array<{ text?: string }>)[0]?.text ?? "") as {
      id: string;
      title: string | null;
      content_text: string | null;
      content_preview: string | null;
      version: number;
      updated_at: string;
    };
    expect(gotParsed.id).toBe(pageId);
    expect(gotParsed.title).toBe("E2E Page");
    expect(gotParsed.content_text).toBeNull();
    expect(gotParsed.content_preview).toBe("preview");
    expect(gotParsed.version).toBe(0);
    expect(gotParsed).not.toHaveProperty("ydoc_state");

    // Issue #889 Phase 5 で MCP 経由のページ更新ツールは廃止された。
    // Issue #889 Phase 5 retired the page-update tool from the MCP surface.
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).not.toContain("zedi_update_page_content");

    const deleted = await client.callTool({
      name: "zedi_delete_page",
      arguments: { page_id: pageId },
    });
    expect(deleted.isError).toBeFalsy();
    const deletedParsed = JSON.parse(
      (deleted.content as Array<{ text?: string }>)[0]?.text ?? "",
    ) as { id: string; deleted: boolean };
    expect(deletedParsed.id).toBe(pageId);
    expect(deletedParsed.deleted).toBe(true);
  }, 30_000);
});
