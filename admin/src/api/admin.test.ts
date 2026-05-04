/**
 * admin API クライアントのテスト（adminFetch をモック）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAdminMe,
  getAiModels,
  patchAiModel,
  patchAiModelsBulk,
  previewSyncAiModels,
  syncAiModels,
  getApiErrors,
  getApiErrorById,
  patchApiErrorStatus,
  type ApiErrorRow,
} from "./admin";

// `adminFetch` だけモックし、`getErrorMessage` は実装をそのまま使う
// （admin.ts が getErrorMessage をインポートしているため、mock 不在だと
// "No 'getErrorMessage' export is defined on the './client' mock" になる）。
// Mock only `adminFetch` and reuse the real `getErrorMessage` implementation
// (admin.ts imports it; without this we'd hit "No 'getErrorMessage' export
// is defined on the './client' mock").
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    adminFetch: vi.fn(),
  };
});

const { adminFetch } = await import("./client");

describe("getAdminMe", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら AdminMe を返す", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "u1", email: "a@b.com", role: "admin" }), {
        status: 200,
      }),
    );
    const result = await getAdminMe();
    expect(result).toEqual({ id: "u1", email: "a@b.com", role: "admin" });
    expect(adminFetch).toHaveBeenCalledWith("/api/admin/me");
  });

  it("401 なら null", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(new Response("", { status: 401 }));
    const result = await getAdminMe();
    expect(result).toBeNull();
  });

  it("403 なら null", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(new Response("", { status: 403 }));
    const result = await getAdminMe();
    expect(result).toBeNull();
  });

  it("500 なら throw", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Server error" }), { status: 500 }),
    );
    await expect(getAdminMe()).rejects.toThrow("Server error");
  });
});

describe("getAiModels", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら models 配列を返す", async () => {
    const models = [
      {
        id: "openai:gpt-4",
        provider: "openai",
        modelId: "gpt-4",
        displayName: "GPT-4",
        tierRequired: "pro",
        inputCostUnits: 100,
        outputCostUnits: 100,
        isActive: true,
        sortOrder: 0,
        createdAt: "2024-01-01T00:00:00Z",
      },
    ];
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ models }), { status: 200 }),
    );
    const result = await getAiModels();
    expect(result).toEqual(models);
    expect(adminFetch).toHaveBeenCalledWith("/api/ai/admin/models");
  });

  it("models が無い場合は空配列", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const result = await getAiModels();
    expect(result).toEqual([]);
  });

  it("!res.ok なら throw", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }),
    );
    await expect(getAiModels()).rejects.toThrow("Forbidden");
  });
});

describe("patchAiModel", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら更新後の model を返す", async () => {
    const model = {
      id: "openai:gpt-4",
      provider: "openai",
      modelId: "gpt-4",
      displayName: "GPT-4 Updated",
      tierRequired: "pro",
      inputCostUnits: 100,
      outputCostUnits: 100,
      isActive: true,
      sortOrder: 0,
      createdAt: "2024-01-01T00:00:00Z",
    };
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ model }), { status: 200 }),
    );
    const result = await patchAiModel("openai:gpt-4", { displayName: "GPT-4 Updated" });
    expect(result).toEqual(model);
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/ai/admin/models/openai%3Agpt-4",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ displayName: "GPT-4 Updated" }),
      }),
    );
  });
});

describe("patchAiModelsBulk", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら { updated, models } を返す", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ updated: 2, models: [] }), { status: 200 }),
    );
    const result = await patchAiModelsBulk([
      { id: "openai:gpt-4", sortOrder: 0 },
      { id: "openai:gpt-4o", sortOrder: 1 },
    ]);
    expect(result).toEqual({ updated: 2, models: [] });
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/ai/admin/models/bulk",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          updates: [
            { id: "openai:gpt-4", sortOrder: 0 },
            { id: "openai:gpt-4o", sortOrder: 1 },
          ],
        }),
      }),
    );
  });
});

describe("previewSyncAiModels", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら results を返す", async () => {
    const results = [
      {
        provider: "openai",
        toAdd: [{ id: "openai:gpt-5", displayName: "GPT-5", tierRequired: "pro", isActive: true }],
        toDeactivate: [],
        error: undefined,
      },
    ];
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ results }), { status: 200 }),
    );
    const out = await previewSyncAiModels();
    expect(out).toEqual(results);
    expect(adminFetch).toHaveBeenCalledWith("/api/ai/admin/sync-models/preview", {
      method: "POST",
    });
  });

  it("results が無い場合は空配列", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const result = await previewSyncAiModels();
    expect(result).toEqual([]);
  });
});

describe("syncAiModels", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら results を返す", async () => {
    const results = [{ provider: "openai", fetched: 10, upserted: 2, error: undefined }];
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ results }), { status: 200 }),
    );
    const out = await syncAiModels();
    expect(out).toEqual(results);
    expect(adminFetch).toHaveBeenCalledWith("/api/ai/admin/sync-models", {
      method: "POST",
    });
  });
});

const sampleErrorRow: ApiErrorRow = {
  id: "00000000-0000-0000-0000-000000000001",
  sentryIssueId: "sentry-1",
  fingerprint: null,
  title: "TypeError",
  route: "GET /api/x",
  statusCode: 500,
  occurrences: 1,
  firstSeenAt: "2026-05-01T00:00:00Z",
  lastSeenAt: "2026-05-04T00:00:00Z",
  severity: "high",
  status: "open",
  aiSummary: null,
  aiSuspectedFiles: null,
  aiRootCause: null,
  aiSuggestedFix: null,
  githubIssueNumber: null,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-04T00:00:00Z",
};

describe("getApiErrors", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("status / severity / limit / offset をクエリ文字列に渡す", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [sampleErrorRow], total: 1, limit: 10, offset: 0 }), {
        status: 200,
      }),
    );
    const out = await getApiErrors({ status: "open", severity: "high", limit: 10, offset: 0 });
    expect(out.errors).toHaveLength(1);
    expect(out.total).toBe(1);
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/errors?status=open&severity=high&limit=10&offset=0",
    );
  });

  it("パラメータ無しのときはクエリ文字列を付けない", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [], total: 0, limit: 50, offset: 0 }), {
        status: 200,
      }),
    );
    const out = await getApiErrors();
    expect(out.errors).toEqual([]);
    expect(out.total).toBe(0);
    expect(adminFetch).toHaveBeenCalledWith("/api/admin/errors");
  });

  it("!res.ok なら throw する", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "boom" }), { status: 500 }),
    );
    await expect(getApiErrors()).rejects.toThrow(/boom/);
  });
});

describe("getApiErrorById", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら row を返し、id を URL エンコードする", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: sampleErrorRow }), { status: 200 }),
    );
    const out = await getApiErrorById(sampleErrorRow.id);
    expect(out).toEqual(sampleErrorRow);
    expect(adminFetch).toHaveBeenCalledWith(`/api/admin/errors/${sampleErrorRow.id}`);
  });
});

describe("patchApiErrorStatus", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("PATCH に status を載せ、更新後の row を返す", async () => {
    const updated = { ...sampleErrorRow, status: "investigating" as const };
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: updated }), { status: 200 }),
    );
    const out = await patchApiErrorStatus(sampleErrorRow.id, "investigating");
    expect(out.status).toBe("investigating");
    expect(adminFetch).toHaveBeenCalledWith(`/api/admin/errors/${sampleErrorRow.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "investigating" }),
    });
  });

  it("409 で throw する（並行更新競合）", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "status changed concurrently; refetch and retry" }), {
        status: 409,
      }),
    );
    await expect(patchApiErrorStatus(sampleErrorRow.id, "resolved")).rejects.toThrow(
      /status changed concurrently/,
    );
  });
});
