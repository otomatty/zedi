/**
 * middleware/mcpAuth.ts のユニットテスト
 * Tests for mcpReadRequired / mcpWriteRequired Hono middleware.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";

const mockVerifyMcpToken = vi.fn();
vi.mock("../../lib/mcpAuth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/mcpAuth.js")>();
  return {
    ...actual,
    verifyMcpToken: (...args: unknown[]) => mockVerifyMcpToken(...args),
  };
});

import { mcpReadRequired, mcpWriteRequired } from "../../middleware/mcpAuth.js";
import { MCP_JWT_AUDIENCE, MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../lib/mcpAuth.js";

function createApp() {
  const app = new Hono<AppEnv>();
  app.get("/read", mcpReadRequired, (c) => c.json({ ok: true, userId: c.get("userId") }));
  app.get("/write", mcpWriteRequired, (c) => c.json({ ok: true, userId: c.get("userId") }));
  return app;
}

beforeEach(() => {
  mockVerifyMcpToken.mockReset();
});

describe("mcpReadRequired", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await createApp().request("/read");
    expect(res.status).toBe(401);
  });

  it("returns 401 when scheme is not Bearer", async () => {
    const res = await createApp().request("/read", { headers: { Authorization: "Basic xyz" } });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token verification fails", async () => {
    mockVerifyMcpToken.mockResolvedValue(null);
    const res = await createApp().request("/read", {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when token lacks mcp:read scope", async () => {
    mockVerifyMcpToken.mockResolvedValue({
      sub: "user-1",
      scope: ["unrelated"],
      aud: MCP_JWT_AUDIENCE,
      exp: 0,
    });
    const res = await createApp().request("/read", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(403);
  });

  it("calls handler with userId set when token has mcp:read", async () => {
    mockVerifyMcpToken.mockResolvedValue({
      sub: "user-42",
      scope: [MCP_SCOPE_READ],
      aud: MCP_JWT_AUDIENCE,
      exp: 0,
    });
    const res = await createApp().request("/read", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe("user-42");
  });

  it("accepts a token that has only mcp:write (write implies read)", async () => {
    mockVerifyMcpToken.mockResolvedValue({
      sub: "user-42",
      scope: [MCP_SCOPE_WRITE],
      aud: MCP_JWT_AUDIENCE,
      exp: 0,
    });
    const res = await createApp().request("/read", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
  });
});

describe("mcpWriteRequired", () => {
  it("returns 403 when token has only mcp:read", async () => {
    mockVerifyMcpToken.mockResolvedValue({
      sub: "user-1",
      scope: [MCP_SCOPE_READ],
      aud: MCP_JWT_AUDIENCE,
      exp: 0,
    });
    const res = await createApp().request("/write", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(403);
  });

  it("calls handler when token has mcp:write", async () => {
    mockVerifyMcpToken.mockResolvedValue({
      sub: "user-7",
      scope: [MCP_SCOPE_READ, MCP_SCOPE_WRITE],
      aud: MCP_JWT_AUDIENCE,
      exp: 0,
    });
    const res = await createApp().request("/write", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe("user-7");
  });
});

// ── Additional boundary / regression tests ─────────────────────────────────

describe("mcpReadRequired – additional edge cases", () => {
  it("returns 401 when token verification returns null for a whitespace-only token", async () => {
    // "Bearer   " — token is all whitespace; verifyMcpToken returns null → 401
    mockVerifyMcpToken.mockResolvedValue(null);
    const res = await createApp().request("/read", {
      headers: { Authorization: "Bearer    " },
    });
    expect(res.status).toBe(401);
  });

  it("accepts token that has both mcp:read and mcp:write on the read endpoint", async () => {
    mockVerifyMcpToken.mockResolvedValue({
      sub: "user-both",
      scope: [MCP_SCOPE_READ, MCP_SCOPE_WRITE],
      aud: MCP_JWT_AUDIENCE,
      exp: 0,
    });
    const res = await createApp().request("/read", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe("user-both");
  });
});

describe("mcpWriteRequired – additional edge cases", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const res = await createApp().request("/write");
    expect(res.status).toBe(401);
  });

  it("returns 401 when token verification returns null (invalid JWT)", async () => {
    mockVerifyMcpToken.mockResolvedValue(null);
    const res = await createApp().request("/write", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });

  it("calls handler when token has only mcp:write (without explicit mcp:read)", async () => {
    mockVerifyMcpToken.mockResolvedValue({
      sub: "user-write-only",
      scope: [MCP_SCOPE_WRITE],
      aud: MCP_JWT_AUDIENCE,
      exp: 0,
    });
    const res = await createApp().request("/write", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe("user-write-only");
  });
});