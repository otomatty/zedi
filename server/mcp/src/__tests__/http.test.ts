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

  it("POST /mcp with 'Bearer ' and only whitespace returns 401", async () => {
    // Empty token (spaces after "Bearer ") should be treated as missing.
    const app = createHttpApp("https://api.example.com");
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer   " },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /health reflects the apiUrl that was passed to createHttpApp", async () => {
    const customApiUrl = "https://custom-api.internal/v2";
    const app = createHttpApp(customApiUrl);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { apiUrl?: string };
    expect(body.apiUrl).toBe(customApiUrl);
  });

  it("401 response body is valid JSON with error field", async () => {
    const app = createHttpApp("https://api.example.com");
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe("unauthorized");
    expect(typeof body.message).toBe("string");
  });
});