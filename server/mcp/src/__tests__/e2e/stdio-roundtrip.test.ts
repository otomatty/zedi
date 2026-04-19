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
  ydoc_state: string;
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
      ydoc_state: "",
      content_text: null,
      version: 0,
    };
    pages.set(id, page);
    // PageRow の形だけを返す (ydoc_state / version は別エンドポイント) /
    // Return only the PageRow shape; ydoc_state / version live on the content endpoint.
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

  app.get("/api/pages/:id/content", (c) => {
    const id = c.req.param("id");
    const page = pages.get(id);
    if (!page || page.is_deleted) return c.json({ message: "not found" }, 404);
    return c.json({
      ydoc_state: page.ydoc_state,
      version: page.version,
      content_text: page.content_text,
      updated_at: page.updated_at,
    });
  });

  app.put("/api/pages/:id/content", async (c) => {
    const id = c.req.param("id");
    const page = pages.get(id);
    if (!page || page.is_deleted) return c.json({ message: "not found" }, 404);
    const body = (await c.req.json()) as {
      ydoc_state?: unknown;
      expected_version?: unknown;
      content_text?: unknown;
      content_preview?: unknown;
      title?: unknown;
    };
    if (typeof body.ydoc_state !== "string" || typeof body.expected_version !== "number") {
      return c.json({ message: "invalid body" }, 400);
    }
    if (body.expected_version !== page.version) {
      return c.json({ message: "version conflict" }, 409);
    }
    page.ydoc_state = body.ydoc_state;
    if (typeof body.content_text === "string") page.content_text = body.content_text;
    if (typeof body.content_preview === "string") page.content_preview = body.content_preview;
    if (typeof body.title === "string") page.title = body.title;
    page.version += 1;
    page.updated_at = new Date().toISOString();
    return c.json({ version: page.version });
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

  it("create -> get -> update -> delete page roundtrip via stdio", async () => {
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

    const got = await client.callTool({
      name: "zedi_get_page",
      arguments: { page_id: pageId },
    });
    expect(got.isError).toBeFalsy();
    const gotParsed = JSON.parse((got.content as Array<{ text?: string }>)[0]?.text ?? "") as {
      version: number;
      ydoc_state: string;
    };
    expect(gotParsed.version).toBe(0);
    expect(gotParsed.ydoc_state).toBe("");

    const updated = await client.callTool({
      name: "zedi_update_page_content",
      arguments: {
        page_id: pageId,
        ydoc_state: "BASE64-STATE",
        expected_version: 0,
        content_text: "hello world",
      },
    });
    expect(updated.isError).toBeFalsy();
    const updatedParsed = JSON.parse(
      (updated.content as Array<{ text?: string }>)[0]?.text ?? "",
    ) as { version: number };
    expect(updatedParsed.version).toBe(1);

    // 楽観ロック: 古い expected_version を渡すと 409 → isError として届くこと。
    // Optimistic locking: stale expected_version surfaces as an isError result.
    const conflicted = await client.callTool({
      name: "zedi_update_page_content",
      arguments: {
        page_id: pageId,
        ydoc_state: "BASE64-STATE-2",
        expected_version: 0,
        content_text: "stale",
      },
    });
    expect(conflicted.isError).toBe(true);
    const conflictedText = (conflicted.content as Array<{ text?: string }>)[0]?.text ?? "";
    expect(conflictedText).toContain("HTTP 409");

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
