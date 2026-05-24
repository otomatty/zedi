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

import { Hono } from "hono";
import composeSessionRoutes from "../../routes/composeSessions.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createMockDb } from "../createMockDb.js";
import { __resetRegistryForTests, registerGraph } from "../../agents/registry/graphRegistry.js";

const OWNER_ID = "owner-1";
const PAGE_ID = "page-1";
const NOTE_ID = "note-1";
const GRAPH_ID = "test-graph";

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

  it("returns 400 for unsupported backend (BYOK forward-compat)", async () => {
    const { app } = createComposeApp([...pageAccessPrefix()]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ graphId: GRAPH_ID, backend: "byok" }),
    });
    expect(res.status).toBe(400);
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

  it("cancels an active session", async () => {
    const { app, chains } = createComposeApp([
      ...pageAccessPrefix(),
      [{ id: "sess-y", status: "running" }],
      undefined, // update chain
    ]);
    const res = await app.request(`/api/pages/${PAGE_ID}/compose-sessions/sess-y`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("cancelled");
    // Update chain set status to "cancelled".
    const updateChain = chains.find((c) => c.startMethod === "update");
    const setOp = updateChain?.ops.find((op) => op.method === "set");
    expect((setOp?.args[0] as { status?: string })?.status).toBe("cancelled");
  });
});
