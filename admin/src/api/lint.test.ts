/**
 * lint API クライアントのテスト（adminFetch をモック）。
 * Tests for the lint API client (adminFetch mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLint, getLintFindings, resolveLintFinding } from "./lint";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    adminFetch: vi.fn(),
  };
});

const { adminFetch } = await import("./client");

describe("runLint", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("POST /api/lint/run を呼んで結果を返す / posts to /api/lint/run", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ summary: [{ rule: "orphan", count: 2 }], total: 2 }), {
        status: 200,
      }),
    );
    const result = await runLint();
    expect(result.total).toBe(2);
    expect(result.summary[0]).toEqual({ rule: "orphan", count: 2 });
    expect(adminFetch).toHaveBeenCalledWith("/api/lint/run", { method: "POST" });
  });

  it("!res.ok なら fallback で Error を投げる / throws on failure", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: "" }),
    );
    await expect(runLint()).rejects.toThrow("Failed to run lint");
  });
});

describe("getLintFindings", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("findings と total を返す / returns findings and total", async () => {
    const findings = [
      {
        id: "f1",
        rule: "orphan" as const,
        severity: "warn" as const,
        page_ids: ["p1"],
        detail: { reason: "no inbound link" },
        created_at: "2026-01-01T00:00:00Z",
        resolved_at: null,
      },
    ];
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ findings, total: 1 }), { status: 200 }),
    );
    const out = await getLintFindings();
    expect(out).toEqual({ findings, total: 1 });
    expect(adminFetch).toHaveBeenCalledWith("/api/lint/findings");
  });

  it("!res.ok なら body の message でエラーになる / surfaces server error message", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }),
    );
    await expect(getLintFindings()).rejects.toThrow("Forbidden");
  });
});

describe("resolveLintFinding", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("id を URL エンコードして POST する / encodes id and POSTs", async () => {
    const finding = {
      id: "lint:1/2",
      rule: "ghost_many" as const,
      severity: "info" as const,
      page_ids: [],
      detail: {},
      created_at: "2026-01-01T00:00:00Z",
      resolved_at: "2026-01-02T00:00:00Z",
    };
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ finding }), { status: 200 }),
    );
    const out = await resolveLintFinding("lint:1/2");
    expect(out.finding).toEqual(finding);
    expect(adminFetch).toHaveBeenCalledWith("/api/lint/findings/lint%3A1%2F2/resolve", {
      method: "POST",
    });
  });

  it("!res.ok なら fallback で Error を投げる / throws on failure", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: "" }),
    );
    await expect(resolveLintFinding("x")).rejects.toThrow("Failed to resolve finding");
  });
});
