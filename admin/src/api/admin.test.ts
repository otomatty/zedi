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
} from "./admin";

vi.mock("./client", () => ({
  adminFetch: vi.fn(),
}));

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
