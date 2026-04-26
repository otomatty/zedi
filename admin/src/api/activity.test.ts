/**
 * activity API クライアントのテスト（adminFetch をモック）。
 * Tests for the activity API client (adminFetch mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { listActivity } from "./activity";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    adminFetch: vi.fn(),
  };
});

const { adminFetch } = await import("./client");

describe("listActivity", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("パラメータ無しなら /api/activity を呼ぶ / hits /api/activity without params", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ entries: [], total: 0, limit: 50 }), { status: 200 }),
    );
    await listActivity();
    expect(adminFetch).toHaveBeenCalledWith("/api/activity");
  });

  it("kind / actor / from / to / limit / offset を querystring に詰める", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ entries: [], total: 0, limit: 10 }), { status: 200 }),
    );

    await listActivity({
      kind: "lint_run",
      actor: "ai",
      from: "2026-01-01T00:00:00Z",
      to: "2026-02-01T00:00:00Z",
      limit: 10,
      offset: 20,
    });

    const calledWith = vi.mocked(adminFetch).mock.calls[0]?.[0];
    expect(calledWith).toContain("/api/activity?");
    const qs = new URLSearchParams((calledWith as string).split("?")[1] ?? "");
    expect(qs.get("kind")).toBe("lint_run");
    expect(qs.get("actor")).toBe("ai");
    expect(qs.get("from")).toBe("2026-01-01T00:00:00Z");
    expect(qs.get("to")).toBe("2026-02-01T00:00:00Z");
    expect(qs.get("limit")).toBe("10");
    expect(qs.get("offset")).toBe("20");
  });

  it("limit=0 は数値として扱う（offset 同様）/ accepts numeric 0 for limit and offset", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ entries: [], total: 0, limit: 0 }), { status: 200 }),
    );

    await listActivity({ limit: 0, offset: 0 });
    const calledWith = vi.mocked(adminFetch).mock.calls[0]?.[0] as string;
    const qs = new URLSearchParams(calledWith.split("?")[1] ?? "");
    expect(qs.get("limit")).toBe("0");
    expect(qs.get("offset")).toBe("0");
  });

  it("undefined のキーは付けない / omits keys when undefined", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ entries: [], total: 0, limit: 0 }), { status: 200 }),
    );

    await listActivity({ kind: "clip_ingest" });
    const calledWith = vi.mocked(adminFetch).mock.calls[0]?.[0] as string;
    const qs = new URLSearchParams(calledWith.split("?")[1] ?? "");
    expect(qs.get("kind")).toBe("clip_ingest");
    expect(qs.get("actor")).toBeNull();
    expect(qs.get("from")).toBeNull();
    expect(qs.get("limit")).toBeNull();
    expect(qs.get("offset")).toBeNull();
  });

  it("200 なら ActivityListResponse を返す / returns ActivityListResponse on success", async () => {
    const body = {
      entries: [
        {
          id: "a1",
          kind: "lint_run" as const,
          actor: "system" as const,
          target_page_ids: [],
          detail: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      total: 1,
      limit: 50,
    };
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    await expect(listActivity()).resolves.toEqual(body);
  });

  it("!res.ok なら getErrorMessage 由来の Error を投げる / throws when response is not ok", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }),
    );
    await expect(listActivity()).rejects.toThrow("Forbidden");
  });

  it("body が空でも fallback メッセージで Error を投げる / throws fallback when body is empty", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: "" }),
    );
    await expect(listActivity()).rejects.toThrow("Failed to fetch activity entries");
  });
});
