/**
 * http.ts のテスト
 *
 * - /health は 200 + ok
 * - /mcp の Bearer 認証と MCP プロキシ処理
 *
 * Tests for the HTTP transport entry point — health, auth, and per-request MCP wiring.
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

import { createHttpApp } from "../http.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const API_URL = "https://api.example.com";
const MCP_BODY = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

function mcpPost(headers: Record<string, string> = {}) {
  const app = createHttpApp(API_URL);
  return app.request("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: MCP_BODY,
  });
}

describe("createHttpApp", () => {
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

  it("GET /health returns ok", async () => {
    const app = createHttpApp(API_URL);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; server: string; apiUrl: string };
    expect(body.ok).toBe(true);
    expect(body.server).toBe("zedi-mcp");
    expect(body.apiUrl).toBe(API_URL);
  });

  it("POST /mcp without Authorization returns 401", async () => {
    const res = await mcpPost();
    expect(res.status).toBe(401);
  });

  it("POST /mcp with malformed Bearer returns 401", async () => {
    const res = await mcpPost({ Authorization: "Basic xyz" });
    expect(res.status).toBe(401);
  });

  it("POST /mcp with Bearer empty string returns 401", async () => {
    const res = await mcpPost({ Authorization: "Bearer " });
    expect(res.status).toBe(401);
    expect(mockCreateMcpServer).not.toHaveBeenCalled();
  });

  it("POST /mcp with valid Bearer token returns 200 (proxied response)", async () => {
    const res = await mcpPost({ Authorization: "Bearer valid-token" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jsonrpc: string; id: number; result: unknown };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result).toEqual({});
  });

  it("createMcpServer called with HttpZediClient when token present", async () => {
    await mcpPost({ Authorization: "Bearer valid-token" });

    expect(mockHttpZediClient).toHaveBeenCalledWith({
      baseUrl: API_URL,
      token: "valid-token",
    });
    const clientInstance = mockHttpZediClient.mock.results[0]?.value;
    expect(mockCreateMcpServer).toHaveBeenCalledWith(clientInstance);
    expect(WebStandardStreamableHTTPServerTransport).toHaveBeenCalledWith({
      sessionIdGenerator: undefined,
    });
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it("server.close called after request (finally block)", async () => {
    await mcpPost({ Authorization: "Bearer valid-token" });
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("transport handleRequest error propagates", async () => {
    mockHandleRequest.mockRejectedValue(new Error("transport failed"));
    const res = await mcpPost({ Authorization: "Bearer valid-token" });
    expect(res.status).toBe(500);
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
