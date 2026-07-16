/**
 * worker.ts のテスト — Cloudflare Workers エントリポイント (#1092)
 *
 * - Workers の env バインディング (`ZEDI_API_URL`) からバックエンド API URL を解決する
 * - 未設定時は `DEFAULT_API_URL` にフォールバックする
 * - `/health` は `GIT_COMMIT_SHA` var をデプロイ検証用に公開する
 * - `/mcp` は Node エントリと同じ Bearer 認証配線を共有する
 *
 * Tests for the Cloudflare Workers entry point: env-based API URL resolution,
 * health metadata for deploy verification, and shared /mcp auth wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConnect = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockHandleRequest = vi.hoisted(() => vi.fn());
const mockCreateMcpServer = vi.hoisted(() => vi.fn());
const mockHttpZediClient = vi.hoisted(() => vi.fn());

vi.mock("../server.js", () => ({
  createMcpServer: mockCreateMcpServer,
}));

vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
  WebStandardStreamableHTTPServerTransport: vi.fn(
    function MockWebStandardStreamableHTTPServerTransport() {
      return { handleRequest: mockHandleRequest };
    },
  ),
}));

vi.mock("../client/httpClient.js", () => ({
  HttpZediClient: mockHttpZediClient,
}));

import worker from "../worker.js";
import { DEFAULT_API_URL } from "../app.js";

const ENV = { ZEDI_API_URL: "https://api.dev.example.com", GIT_COMMIT_SHA: "abc123def456" };
const MCP_BODY = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

interface HealthBody {
  ok: boolean;
  server: string;
  apiUrl: string;
  git_commit_sha: string | null;
}

describe("worker (Cloudflare Workers entry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMcpServer.mockReturnValue({
      connect: mockConnect,
      close: mockClose,
    });
    mockHandleRequest.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mockHttpZediClient.mockImplementation(function MockHttpZediClient(opts: {
      baseUrl: string;
      token: string;
    }) {
      return { baseUrl: opts.baseUrl, token: opts.token };
    });
  });

  it("GET /health resolves apiUrl from env binding ZEDI_API_URL", async () => {
    const res = await worker.request("/health", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.ok).toBe(true);
    expect(body.server).toBe("zedi-mcp");
    expect(body.apiUrl).toBe("https://api.dev.example.com");
  });

  it("GET /health falls back to DEFAULT_API_URL when ZEDI_API_URL is unset", async () => {
    const res = await worker.request("/health", {}, {});
    const body = (await res.json()) as HealthBody;
    expect(body.apiUrl).toBe(DEFAULT_API_URL);
  });

  it("GET /health treats empty ZEDI_API_URL as unset", async () => {
    const res = await worker.request("/health", {}, { ZEDI_API_URL: "" });
    const body = (await res.json()) as HealthBody;
    expect(body.apiUrl).toBe(DEFAULT_API_URL);
  });

  it("GET /health exposes git_commit_sha from env binding", async () => {
    const res = await worker.request("/health", {}, ENV);
    const body = (await res.json()) as HealthBody;
    expect(body.git_commit_sha).toBe("abc123def456");
  });

  it("GET /health returns git_commit_sha null when GIT_COMMIT_SHA is unset", async () => {
    const res = await worker.request("/health", {}, { ZEDI_API_URL: "https://x.example.com" });
    const body = (await res.json()) as HealthBody;
    expect(body.git_commit_sha).toBeNull();
  });

  it("POST /mcp without Authorization returns 401", async () => {
    const res = await worker.request(
      "/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: MCP_BODY,
      },
      ENV,
    );
    expect(res.status).toBe(401);
    expect(mockCreateMcpServer).not.toHaveBeenCalled();
  });

  it("POST /mcp with Bearer token builds client against env apiUrl", async () => {
    const res = await worker.request(
      "/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
        body: MCP_BODY,
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(mockHttpZediClient).toHaveBeenCalledWith({
      baseUrl: "https://api.dev.example.com",
      token: "valid-token",
    });
    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
