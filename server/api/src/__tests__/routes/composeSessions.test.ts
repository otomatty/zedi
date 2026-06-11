/**
 * composeSessions ルートのテスト（認可・CRUD・backend ガード）。
 *
 * Tests for `/api/pages/:pageId/compose-sessions[/:id]`. Focuses on the parts
 * that have to be right before a real graph is wired up: input validation,
 * page access enforcement (issue #823 note-role only), DB row shape, and the
 * backend whitelist.
 *
 * `run` / `resume` の SSE 経路は LangGraph 実体に依存するため、本テストでは
 * CRUD と 4xx パスに絞っている。SSE の整合性は `sseMapper` 単体テストと
 * `graphRunner` 単体テストでカバー済み。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

vi.mock("../../middleware/rateLimit.js", () => ({
  rateLimit: () => async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

vi.mock("../../services/subscriptionService.js", () => ({
  getUserTier: async () => "free" as const,
}));

const mockGetUserAiCredentialPlaintext = vi.fn();

const mockValidateModelAccess = vi.fn();

vi.mock("../../services/usageService.js", () => ({
  validateModelAccess: (...args: unknown[]) => mockValidateModelAccess(...args),
}));

vi.mock("../../services/userAiCredentialService.js", () => ({
  getUserAiCredentialPlaintext: (...args: unknown[]) => mockGetUserAiCredentialPlaintext(...args),
}));

const { mockLoadComposeSessionProjection, mockGraphRunnerStreamEvents, mockGraphRunnerResume } =
  vi.hoisted(() => ({
    mockLoadComposeSessionProjection: vi.fn(),
    mockGraphRunnerStreamEvents: vi.fn(),
    mockGraphRunnerResume: vi.fn(),
  }));

vi.mock("../../routes/composeSessionProjection.js", () => ({
  loadComposeSessionProjection: (...args: unknown[]) => mockLoadComposeSessionProjection(...args),
  projectComposeStateValues: vi.fn(),
}));

vi.mock("../../agents/runner/graphRunner.js", () => ({
  GraphRunner: class {
    streamEvents = (...args: unknown[]) => mockGraphRunnerStreamEvents(...args);
    invoke = vi.fn();
    resume = (...args: unknown[]) => mockGraphRunnerResume(...args);
  },
}));

vi.mock("../../agents/core/checkpoint/index.js", () => ({
  resolveCheckpointerForRun: vi.fn().mockResolvedValue(false),
}));

import { Hono } from "hono";
import composeSessionRoutes from "../../routes/composeSessions.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createMockDb } from "../createMockDb.js";
import {
  __resetRegistryForTests,
  GraphNotRegisteredError,
  registerGraph,
} from "../../agents/registry/graphRegistry.js";

const OWNER_ID = "owner-1";
const OTHER_USER_ID = "other-user-99";
const PAGE_ID = "page-1";
const NOTE_ID = "note-1";
const GRAPH_ID = "test-graph";

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-default",
    pageId: PAGE_ID,
    userId: OWNER_ID,
    graphId: GRAPH_ID,
    phase: "init",
    backend: "zedi_managed",
    status: "pending",
    metadata: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null,
    ...overrides,
  };
}

function authHeaders(userId: string = OWNER_ID) {
  return {
    "x-test-user-id": userId,
    "Content-Type": "application/json",
  };
}

function mockNote() {
  return {
    id: NOTE_ID,
    ownerId: OWNER_ID,
    title: "n",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  };
}

/**
 * assertPageEditAccess の SELECT 並び:
 *   1: pages row, 2: caller email, 3: findActiveNoteById.
 * assertPageViewAccess も同じ並びだが、editPermission のチェックが追加で発生する。
 */
function pageAccessPrefix() {
  return [
    [{ id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID }],
    [{ email: "owner@example.com" }],
    [mockNote()],
  ];
}

function createComposeApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/pages", composeSessionRoutes);
  return { app, chains };
}

beforeEach(() => {
  mockGetUserAiCredentialPlaintext.mockReset();
  mockValidateModelAccess.mockReset();
  mockValidateModelAccess.mockResolvedValue({
    provider: "anthropic",
    apiModelId: "claude-3-5-haiku",
    inputCostUnits: 1,
    outputCostUnits: 2,
  });
  mockLoadComposeSessionProjection.mockReset().mockResolvedValue(null);
  mockGraphRunnerStreamEvents.mockReset().mockImplementation(async function* () {
    yield { event: "on_chain_end", data: {} };
  });
  mockGraphRunnerResume.mockReset().mockRejectedValue(new GraphNotRegisteredError("graph-removed"));
  __resetRegistryForTests();
  // Register a graph the routes can resolve. Body is irrelevant for CRUD tests.
  registerGraph({
    id: GRAPH_ID,
    version: "0.0.0",
    phase: "test",
    description: "test graph",
    factory: () => ({
      invoke: async () => ({}),
      stream: async () => undefined,
      streamEvents: () => undefined,
    }),
  });
});

describe("POST /api/pages/:pageId/compose-sessions", () => {
  it("rejects requests without auth", async () => {
    const { app } = createComposeApp([]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graphId: GRAPH_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when graphId is missing", async () => {
    const { app } = createComposeApp([
      ...pageAccessPrefix(),
      // No further DB chains; route fails before insert.
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when graphId is unknown", async () => {
    const { app } = createComposeApp([...pageAccessPrefix()]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ graphId: "never-registered" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported backend (legacy byok name)", async () => {
    const { app } = createComposeApp([...pageAccessPrefix()]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ graphId: GRAPH_ID, backend: "byok" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for user_openai when credential is missing", async () => {
    mockGetUserAiCredentialPlaintext.mockResolvedValue(null);
    mockValidateModelAccess.mockResolvedValue({
      provider: "openai",
      apiModelId: "gpt-4o-mini",
      inputCostUnits: 1,
      outputCostUnits: 2,
    });
    const { app } = createComposeApp([...pageAccessPrefix()]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ graphId: GRAPH_ID, backend: "user_openai" }),
    });
    expect(res.status).toBe(400);
    expect(mockGetUserAiCredentialPlaintext).toHaveBeenCalledWith(
      OWNER_ID,
      "openai",
      expect.anything(),
    );
  });

  it("creates a session with user_openai when credential exists", async () => {
    mockGetUserAiCredentialPlaintext.mockResolvedValue("sk-user");
    mockValidateModelAccess.mockResolvedValue({
      provider: "openai",
      apiModelId: "gpt-4o-mini",
      inputCostUnits: 1,
      outputCostUnits: 2,
    });
    const createdRow = {
      id: "sess-byok",
      pageId: PAGE_ID,
      userId: OWNER_ID,
      graphId: GRAPH_ID,
      phase: "init",
      backend: "user_openai",
      status: "pending",
      metadata: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    };
    const { app } = createComposeApp([...pageAccessPrefix(), [createdRow]]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ graphId: GRAPH_ID, backend: "user_openai" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { session: { backend: string } };
    expect(body.session.backend).toBe("user_openai");
  });

  it("creates a session row with the resolved backend defaulting to zedi_managed", async () => {
    const createdRow = {
      id: "sess-1",
      pageId: PAGE_ID,
      userId: OWNER_ID,
      graphId: GRAPH_ID,
      phase: "init",
      backend: "zedi_managed",
      status: "pending",
      metadata: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    };
    const { app, chains } = createComposeApp([
      ...pageAccessPrefix(),
      [createdRow], // insert().values().returning()
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ graphId: GRAPH_ID }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { session: { id: string; backend: string } };
    expect(body.session.id).toBe("sess-1");
    expect(body.session.backend).toBe("zedi_managed");
    // 4 DB chains: 3 access checks + 1 insert.
    expect(chains.length).toBe(4);
    expect(chains[3]?.startMethod).toBe("insert");
  });
});

describe("GET /api/pages/:pageId/compose-sessions/:id", () => {
  it("returns 401 without auth", async () => {
    const { app } = createComposeApp([]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-2`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller has no role on the note (private note, non-member)", async () => {
    const privateNote = {
      id: NOTE_ID,
      ownerId: OTHER_USER_ID,
      title: "n",
      visibility: "private" as const,
      editPermission: "owner_only" as const,
      isOfficial: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    const { app } = createComposeApp([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: NOTE_ID }],
      [{ email: "owner@example.com" }],
      [privateNote],
      [],
      [],
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-2`, {
      headers: authHeaders(OWNER_ID),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the session row is not found", async () => {
    const { app } = createComposeApp([
      ...pageAccessPrefix(),
      [], // select() returning no rows
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/missing`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("returns the session row when found", async () => {
    const row = {
      id: "sess-2",
      pageId: PAGE_ID,
      userId: OWNER_ID,
      graphId: GRAPH_ID,
      phase: "init",
      backend: "zedi_managed",
      status: "pending",
      metadata: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    };
    const { app } = createComposeApp([...pageAccessPrefix(), [row]]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-2`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { id: string } };
    expect(body.session.id).toBe("sess-2");
  });

  it("returns session without projection when backend is unsupported (stale row)", async () => {
    const row = sessionRow({ id: "sess-byok-read", backend: "byok", status: "interrupted" });
    const { app } = createComposeApp([...pageAccessPrefix(), [row]]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-byok-read`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { backend: string }; projection: null };
    expect(body.session.backend).toBe("byok");
    expect(body.projection).toBeNull();
    expect(mockLoadComposeSessionProjection).not.toHaveBeenCalled();
  });

  it("includes projection for interrupted sessions", async () => {
    const row = sessionRow({ id: "sess-int", status: "interrupted", phase: "brief:await_user" });
    mockLoadComposeSessionProjection.mockResolvedValue({
      phase: "brief",
      briefQuestions: [{ id: "q1" }],
    });
    const { app } = createComposeApp([...pageAccessPrefix(), [row]]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-int`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { status: string };
      projection: { phase: string };
    };
    expect(body.session.status).toBe("interrupted");
    expect(body.projection.phase).toBe("brief");
    expect(mockLoadComposeSessionProjection).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-int", graphId: GRAPH_ID }),
    );
  });
});

describe("POST /api/pages/:pageId/compose-sessions/:id/run", () => {
  it("returns 401 without auth", async () => {
    const { app } = createComposeApp([]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-run/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when session is missing", async () => {
    const { app } = createComposeApp([...pageAccessPrefix(), []]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/missing/run`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when session is interrupted", async () => {
    const row = sessionRow({ id: "sess-int", status: "interrupted" });
    const { app } = createComposeApp([...pageAccessPrefix(), [row]]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-int/run`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/PATCH \/resume/i);
  });

  it("returns 409 when session is already completed", async () => {
    const row = sessionRow({ id: "sess-done", status: "completed" });
    const { app } = createComposeApp([...pageAccessPrefix(), [row]]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-done/run`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("returns 400 when session backend is unsupported at run time", async () => {
    const row = sessionRow({ id: "sess-byok-run", status: "pending", backend: "byok" });
    const { app } = createComposeApp([...pageAccessPrefix(), [row]]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-byok-run/run`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("marks session interrupted when stream emits interrupt events", async () => {
    mockGraphRunnerStreamEvents.mockImplementation(async function* () {
      yield {
        event: "on_chain_end",
        data: { output: { __interrupt__: [{ value: { kind: "human_review_brief" } }] } },
      };
    });
    const row = sessionRow({ id: "sess-interrupt", status: "pending" });
    const claimed = { ...row, status: "running" };
    const { app } = createComposeApp([
      ...pageAccessPrefix(),
      [row],
      [claimed],
      [{ id: "sess-interrupt" }],
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-interrupt/run`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ input: {} }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/interrupt|done/);
  });

  it("streams SSE events for a pending session", async () => {
    const row = sessionRow({ id: "sess-run", status: "pending" });
    const claimed = { ...row, status: "running" };
    const { app } = createComposeApp([
      ...pageAccessPrefix(),
      [row],
      [claimed],
      [{ id: "sess-run" }],
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-run/run`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ input: {} }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event:");
    expect(mockGraphRunnerStreamEvents).toHaveBeenCalled();
  });
});

describe("PATCH /api/pages/:pageId/compose-sessions/:id/resume", () => {
  it("returns 200 when resume completes successfully", async () => {
    mockGraphRunnerResume.mockResolvedValue({
      status: "completed",
      output: { markdown: "## Done" },
    });
    const row = sessionRow({ id: "sess-resume-ok", status: "interrupted" });
    const { app } = createComposeApp([
      ...pageAccessPrefix(),
      [row],
      [{ ...row, status: "running" }],
      [{ id: "sess-resume-ok" }],
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-resume-ok/resume`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ resume: { approvedSourceIds: ["s1"] } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; output: unknown };
    expect(body.status).toBe("completed");
    expect(body.output).toEqual({ markdown: "## Done" });
    expect(mockGraphRunnerResume).toHaveBeenCalled();
  });

  it("returns 409 when session is not interrupted", async () => {
    const row = sessionRow({ id: "sess-pending", status: "pending" });
    const { app } = createComposeApp([...pageAccessPrefix(), [row]]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-pending/resume`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ resume: { ok: true } }),
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/pages/:pageId/compose-sessions/:id", () => {
  it("returns 404 when the session does not exist", async () => {
    const { app } = createComposeApp([...pageAccessPrefix(), []]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/none`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("is a no-op when the session is already completed", async () => {
    const { app, chains } = createComposeApp([
      ...pageAccessPrefix(),
      [{ id: "sess-x", status: "completed" }],
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-x`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("completed");
    // 4 chains: 3 page-access + 1 select. No update chain triggered.
    expect(chains.filter((c) => c.startMethod === "update").length).toBe(0);
  });

  it("returns 400 when resume revalidates an unsupported backend", async () => {
    const interruptedRow = {
      id: "sess-resume-backend",
      pageId: PAGE_ID,
      userId: OWNER_ID,
      graphId: GRAPH_ID,
      phase: "init",
      backend: "byok",
      status: "interrupted",
      metadata: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    };
    const { app, chains } = createComposeApp([...pageAccessPrefix(), [interruptedRow]]);

    const res = await app.request(
      `/api/pages/${PAGE_ID}/compose-sessions/sess-resume-backend/resume`,
      {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ resume: { ok: true } }),
      },
    );
    expect(res.status).toBe(400);
    expect(chains.filter((c) => c.startMethod === "update").length).toBe(0);
  });

  it("marks session failed when resume throws GraphNotRegisteredError", async () => {
    const interruptedRow = {
      id: "sess-resume-fail",
      pageId: PAGE_ID,
      userId: OWNER_ID,
      graphId: "graph-removed",
      phase: "init",
      backend: "zedi_managed",
      status: "interrupted",
      metadata: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    };
    const { app, chains } = createComposeApp([
      ...pageAccessPrefix(),
      [interruptedRow],
      [interruptedRow], // atomic claim → running
      [], // GraphNotRegisteredError recovery → failed update (no row if already terminal)
    ]);

    const res = await app.request(
      `/api/pages/${PAGE_ID}/compose-sessions/sess-resume-fail/resume`,
      {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ resume: { ok: true } }),
      },
    );
    expect(res.status).toBe(400);

    const failedUpdate = chains
      .filter((c) => c.startMethod === "update")
      .map((c) => c.ops.find((op) => op.method === "set")?.args[0] as { status?: string })
      .find((set) => set?.status === "failed");
    expect(failedUpdate?.status).toBe("failed");
  });

  it("cancels an active session", async () => {
    const { app, chains } = createComposeApp([
      ...pageAccessPrefix(),
      [{ id: "sess-y", status: "running" }],
      [{ status: "cancelled" }], // guarded update → returning
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-y`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("cancelled");
    const updateChain = chains.find((c) => c.startMethod === "update");
    const setOp = updateChain?.ops.find((op) => op.method === "set");
    expect((setOp?.args[0] as { status?: string })?.status).toBe("cancelled");
  });

  it("does not overwrite completed when cancel races with graph finish", async () => {
    const { app, chains } = createComposeApp([
      ...pageAccessPrefix(),
      [{ id: "sess-race", status: "running" }],
      [], // guarded cancel update — no row (status already completed)
      [{ status: "completed" }], // re-read after failed cancel
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-race`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("completed");
    expect(chains.filter((c) => c.startMethod === "update").length).toBe(1);
  });
});
