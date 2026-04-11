/**
 * http.ts のテスト
 *
 * - /health は 200 + ok
 * - /mcp に Authorization なしで POST すると 401
 *
 * Tests for the HTTP transport entry point — health and unauthorized handling.
 * Full MCP-over-HTTP smoke test is intentionally deferred to manual verification
 * to keep the test suite hermetic.
 */
import { describe, it, expect } from "vitest";
import { createHttpApp } from "../http.js";

describe("createHttpApp", () => {
  it("GET /health returns ok", async () => {
    const app = createHttpApp("https://api.example.com");
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; server: string; apiUrl: string };
    expect(body.ok).toBe(true);
    expect(body.server).toBe("zedi-mcp");
    expect(body.apiUrl).toBe("https://api.example.com");
  });

  it("POST /mcp without Authorization returns 401", async () => {
    const app = createHttpApp("https://api.example.com");
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /mcp with malformed Bearer returns 401", async () => {
    const app = createHttpApp("https://api.example.com");
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic xyz" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /mcp with empty Bearer token (only whitespace) returns 401", async () => {
    const app = createHttpApp("https://api.example.com");
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer   " },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /health reflects the configured apiUrl", async () => {
    const custom = "https://internal.api.example.com";
    const app = createHttpApp(custom);
    const res = await app.request("/health");
    const body = (await res.json()) as { apiUrl: string };
    expect(body.apiUrl).toBe(custom);
  });

  it("GET /health returns server name 'zedi-mcp'", async () => {
    const app = createHttpApp("https://api.example.com");
    const res = await app.request("/health");
    const body = (await res.json()) as { server: string };
    expect(body.server).toBe("zedi-mcp");
  });

  it("GET /unknown-path returns 404", async () => {
    const app = createHttpApp("https://api.example.com");
    const res = await app.request("/not-found");
    expect(res.status).toBe(404);
  });
});