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
  getUsers,
  patchUserRole,
  suspendUser,
  unsuspendUser,
  getUserImpact,
  deleteUser,
  getAuditLogs,
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
    const rowNeedsEncoding = {
      ...sampleErrorRow,
      id: "550e8400-e29b-41d4-a716-446655440000/with+reserved",
    };
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ apiError: rowNeedsEncoding }), { status: 200 }),
    );
    const out = await getApiErrorById(rowNeedsEncoding.id);
    expect(out).toEqual(rowNeedsEncoding);
    expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/errors/${encodeURIComponent(rowNeedsEncoding.id)}`,
    );
  });
});

describe("patchApiErrorStatus", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("PATCH に status を載せ、更新後の row を返す", async () => {
    const updated = { ...sampleErrorRow, status: "investigating" as const };
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ apiError: updated }), { status: 200 }),
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

const sampleUser = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  role: "user" as const,
  status: "active" as const,
  suspendedAt: null,
  suspendedReason: null,
  suspendedBy: null,
  createdAt: "2026-01-01T00:00:00Z",
  pageCount: 3,
};

describe("getUsers", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら users と total を返す", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [sampleUser], total: 1 }), { status: 200 }),
    );
    const result = await getUsers({ search: "test", status: "active", limit: 10, offset: 0 });
    expect(result.users).toEqual([sampleUser]);
    expect(result.total).toBe(1);
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/users?search=test&status=active&limit=10&offset=0",
    );
  });

  it("!res.ok なら throw する", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "users failed" }), { status: 500 }),
    );
    await expect(getUsers()).rejects.toThrow("users failed");
  });
});

describe("patchUserRole", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら更新後 user を返す", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { ...sampleUser, role: "admin" } }), { status: 200 }),
    );
    const result = await patchUserRole("user-1", "admin");
    expect(result.user.role).toBe("admin");
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/users/user-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "admin" }),
      }),
    );
  });

  it("!res.ok なら throw する", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "role failed" }), { status: 400 }),
    );
    await expect(patchUserRole("user-1", "admin")).rejects.toThrow("role failed");
  });
});

describe("suspendUser", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら suspended user を返す", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ user: { ...sampleUser, status: "suspended", suspendedReason: "spam" } }),
        { status: 200 },
      ),
    );
    const result = await suspendUser("user-1", "spam");
    expect(result.user.status).toBe("suspended");
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/users/user-1/suspend",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "spam" }),
      }),
    );
  });

  it("!res.ok なら throw する", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "suspend failed" }), { status: 500 }),
    );
    await expect(suspendUser("user-1")).rejects.toThrow("suspend failed");
  });
});

describe("unsuspendUser", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら active user を返す", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ user: sampleUser }), { status: 200 }),
    );
    const result = await unsuspendUser("user-1");
    expect(result.user.status).toBe("active");
    expect(adminFetch).toHaveBeenCalledWith("/api/admin/users/user-1/unsuspend", {
      method: "POST",
    });
  });

  it("!res.ok なら throw する", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "unsuspend failed" }), { status: 500 }),
    );
    await expect(unsuspendUser("user-1")).rejects.toThrow("unsuspend failed");
  });
});

describe("getUserImpact", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら impact を返す", async () => {
    const impact = {
      notesCount: 2,
      sessionsCount: 1,
      activeSubscription: true,
      lastAiUsageAt: "2026-01-01T00:00:00Z",
    };
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(impact), { status: 200 }),
    );
    const result = await getUserImpact("user-1");
    expect(result).toEqual(impact);
    expect(adminFetch).toHaveBeenCalledWith("/api/admin/users/user-1/impact");
  });

  it("!res.ok なら throw する", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "impact failed" }), { status: 500 }),
    );
    await expect(getUserImpact("user-1")).rejects.toThrow("impact failed");
  });
});

describe("deleteUser", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら deleted user を返す", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { ...sampleUser, status: "deleted" } }), {
        status: 200,
      }),
    );
    const result = await deleteUser("user-1");
    expect(result.user.status).toBe("deleted");
    expect(adminFetch).toHaveBeenCalledWith("/api/admin/users/user-1", { method: "DELETE" });
  });

  it("!res.ok なら throw する", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "delete failed" }), { status: 500 }),
    );
    await expect(deleteUser("user-1")).rejects.toThrow("delete failed");
  });
});

describe("getAuditLogs", () => {
  beforeEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("200 なら logs と total を返す", async () => {
    const logs = [
      {
        id: "log-1",
        actorUserId: "admin-1",
        actorEmail: "admin@example.com",
        actorName: "Admin",
        action: "user.role.update",
        targetType: "user",
        targetId: "user-1",
        targetEmail: "user@example.com",
        targetName: "User",
        before: { role: "user" },
        after: { role: "admin" },
        ipAddress: null,
        userAgent: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ logs, total: 1 }), { status: 200 }),
    );
    const result = await getAuditLogs({
      actorUserId: "admin-1",
      action: "user.role.update",
      targetType: "user",
      targetId: "user-1",
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
      limit: 20,
      offset: 0,
    });
    expect(result.logs).toEqual(logs);
    expect(result.total).toBe(1);
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/audit-logs?actorUserId=admin-1&action=user.role.update&targetType=user&targetId=user-1&from=2026-01-01T00%3A00%3A00Z&to=2026-01-02T00%3A00%3A00Z&limit=20&offset=0",
    );
  });

  it("!res.ok なら throw する", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "audit failed" }), { status: 500 }),
    );
    await expect(getAuditLogs()).rejects.toThrow("audit failed");
  });
});
