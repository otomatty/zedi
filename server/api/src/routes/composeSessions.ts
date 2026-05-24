/**
 * `/api/pages/:pageId/compose-sessions` — Wiki Compose session API.
 *
 * Wiki Compose の P0 ルートスケルトン。`wiki_compose_sessions` テーブルの CRUD と、
 * `GraphRunner` 経由でのスタブグラフ実行 (run / resume) を提供する。SSE 形式は
 * `agents/core/types/sseEvents.ts` の `SseEvent` に従う。
 *
 * - `POST   /api/pages/:pageId/compose-sessions`              — Create
 * - `GET    /api/pages/:pageId/compose-sessions/:id`          — Read
 * - `POST   /api/pages/:pageId/compose-sessions/:id/run`      — SSE
 * - `PATCH  /api/pages/:pageId/compose-sessions/:id/resume`   — Resume from interrupt
 * - `DELETE /api/pages/:pageId/compose-sessions/:id`          — Cancel
 *
 * Issue: otomatty/zedi#948
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { and, eq } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { assertPageEditAccess, assertPageViewAccess } from "../services/pageAccessService.js";
import { wikiComposeSessions } from "../schema/wikiComposeSessions.js";
import type { WikiComposeSessionStatus } from "../schema/wikiComposeSessions.js";
import { getUserTier } from "../services/subscriptionService.js";
import { GraphRunner } from "../agents/runner/graphRunner.js";
import {
  doneEvent,
  errorEvent,
  mapLangGraphEvent,
  startedEvent,
  statusEvent,
  type LangGraphRuntimeEvent,
} from "../agents/runner/sseMapper.js";
import { GraphNotRegisteredError, getRegisteredGraph } from "../agents/registry/graphRegistry.js";
import {
  assertSupportedBackendP0,
  UnsupportedBackendError,
} from "../agents/core/llm/modelFactory.js";
import { SSE_EVENT_NAMES, type SseEvent } from "../agents/core/types/sseEvents.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../agents/core/types/graphContext.js";
import { resolveCheckpointerForRun } from "../agents/core/checkpoint/index.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

/**
 * POST body — create session.
 *
 * @property graphId   Registry に登録されたグラフ ID。Registered graph id.
 * @property backend   Execution backend (省略時は `zedi_managed`)。Defaults to zedi_managed.
 * @property metadata  自由形式メタデータ。Free-form metadata.
 */
interface CreateSessionBody {
  graphId?: string;
  backend?: string;
  metadata?: Record<string, unknown>;
}

interface RunSessionBody {
  /** 初期入力（最初の messages 等）。任意。 */
  input?: unknown;
}

interface ResumeSessionBody {
  /** Interrupt に渡す再開値。HITL の場合は通常ユーザー応答。 */
  resume: unknown;
}

// ── POST / — create ─────────────────────────────────────────────────────────
app.post("/:pageId/compose-sessions", authRequired, rateLimit(), async (c) => {
  const pageId = c.req.param("pageId");
  const userId = c.get("userId");
  const db = c.get("db");

  await assertPageEditAccess(db, pageId, userId);

  let body: CreateSessionBody;
  try {
    body = await c.req.json<CreateSessionBody>();
  } catch {
    body = {};
  }

  const graphId =
    typeof body.graphId === "string" && body.graphId.trim() ? body.graphId.trim() : undefined;
  if (!graphId) {
    throw new HTTPException(400, { message: "graphId is required" });
  }
  if (!getRegisteredGraph(graphId)) {
    throw new HTTPException(400, { message: `Unknown graphId: ${graphId}` });
  }

  let backend: ReturnType<typeof assertSupportedBackendP0>;
  try {
    backend = assertSupportedBackendP0(body.backend ?? "zedi_managed");
  } catch (err) {
    if (err instanceof UnsupportedBackendError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }

  const [row] = await db
    .insert(wikiComposeSessions)
    .values({
      pageId,
      userId,
      graphId,
      backend,
      status: "pending",
      metadata: body.metadata ?? null,
    })
    .returning();
  if (!row) throw new HTTPException(500, { message: "Failed to create session" });

  return c.json({ session: row }, 201);
});

// ── GET /:id — read ─────────────────────────────────────────────────────────
app.get("/:pageId/compose-sessions/:id", authRequired, async (c) => {
  const pageId = c.req.param("pageId");
  const id = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  await assertPageViewAccess(db, pageId, userId);

  const [row] = await db
    .select()
    .from(wikiComposeSessions)
    .where(and(eq(wikiComposeSessions.id, id), eq(wikiComposeSessions.pageId, pageId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Session not found" });

  return c.json({ session: row });
});

// ── POST /:id/run — SSE run ─────────────────────────────────────────────────
app.post("/:pageId/compose-sessions/:id/run", authRequired, rateLimit(), async (c) => {
  const pageId = c.req.param("pageId");
  const id = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  await assertPageEditAccess(db, pageId, userId);

  const [session] = await db
    .select()
    .from(wikiComposeSessions)
    .where(and(eq(wikiComposeSessions.id, id), eq(wikiComposeSessions.pageId, pageId)))
    .limit(1);
  if (!session) throw new HTTPException(404, { message: "Session not found" });

  if (session.status === "running") {
    throw new HTTPException(409, { message: "Session is already running" });
  }
  if (session.status === "completed" || session.status === "cancelled") {
    throw new HTTPException(409, { message: `Session is ${session.status}` });
  }

  let body: RunSessionBody;
  try {
    body = await c.req.json<RunSessionBody>();
  } catch {
    body = {};
  }

  const tier = await getUserTier(userId, db);
  const runner = new GraphRunner();

  // Backend revalidation: row may have been created under a backend that is
  // no longer permitted (future BYOK downgrade scenarios). Fail fast here.
  // 行作成後に backend サポートが変わった場合への保険。
  try {
    assertSupportedBackendP0(session.backend);
  } catch (err) {
    if (err instanceof UnsupportedBackendError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }

  await db
    .update(wikiComposeSessions)
    .set({ status: "running" satisfies WikiComposeSessionStatus, updatedAt: new Date() })
    .where(eq(wikiComposeSessions.id, id));

  return streamSSE(c, async (stream) => {
    const send = async (ev: SseEvent) => {
      await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
    };

    await send(startedEvent(id, session.graphId, session.phase));

    let finalStatus: WikiComposeSessionStatus = "completed";
    let lastError: string | null = null;

    // `DATABASE_URL` が設定された本番経路では `PostgresSaver` を取得して
    // checkpoint 保存・再開を有効化する。テスト / CI では未設定なので `false`
    // を返し、LangGraph の checkpoint 機構を無効化したまま smoke-test で走る。
    // In production we hand the run a `PostgresSaver` so the LangGraph
    // checkpointer persists per-thread state; in test / CI environments
    // `resolveCheckpointerForRun` returns `false` to keep the path runnable
    // without DDL.
    const checkpointer = await resolveCheckpointerForRun();

    try {
      const events = runner.streamEvents(
        {
          graphId: session.graphId,
          checkpointer,
          context: {
            threadId: id,
            sessionId: id,
            userId,
            pageId,
            graphId: session.graphId,
            backend: assertSupportedBackendP0(session.backend),
            tier,
            db,
            feature: `wiki_compose:${session.graphId}`,
          },
        },
        { kind: "input", value: body.input ?? {} },
      );

      for await (const raw of events) {
        const ev = raw as LangGraphRuntimeEvent;
        for (const mapped of mapLangGraphEvent(ev)) {
          await send(mapped);
        }
      }
    } catch (err) {
      if (isInterruptError(err)) {
        finalStatus = "interrupted";
        await send({ type: "interrupt", payload: extractInterruptPayload(err) });
      } else {
        finalStatus = "failed";
        lastError = err instanceof Error ? err.message : String(err);
        await send(errorEvent(lastError));
      }
    }

    if (finalStatus === "completed") {
      await send(statusEvent("completed"));
    }
    await send(doneEvent(finalStatus));

    // Both branches of the run loop set finalStatus to a terminal value
    // (completed / interrupted / failed); always stamp `closedAt`.
    await db
      .update(wikiComposeSessions)
      .set({
        status: finalStatus,
        lastError: finalStatus === "failed" ? lastError : null,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wikiComposeSessions.id, id));

    // Hush unused-import warning when running without exporting names; keeps the
    // import grouped with the SSE writes for readability.
    void SSE_EVENT_NAMES;
    void GRAPH_CONTEXT_CONFIG_KEY;
  });
});

// ── PATCH /:id/resume ───────────────────────────────────────────────────────
app.patch("/:pageId/compose-sessions/:id/resume", authRequired, rateLimit(), async (c) => {
  const pageId = c.req.param("pageId");
  const id = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  await assertPageEditAccess(db, pageId, userId);

  const [session] = await db
    .select()
    .from(wikiComposeSessions)
    .where(and(eq(wikiComposeSessions.id, id), eq(wikiComposeSessions.pageId, pageId)))
    .limit(1);
  if (!session) throw new HTTPException(404, { message: "Session not found" });
  if (session.status !== "interrupted") {
    throw new HTTPException(409, { message: "Session is not interrupted" });
  }

  let body: ResumeSessionBody;
  try {
    body = await c.req.json<ResumeSessionBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const tier = await getUserTier(userId, db);
  const runner = new GraphRunner();

  await db
    .update(wikiComposeSessions)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(wikiComposeSessions.id, id));

  // Resume relies on the checkpointer to fetch the suspended thread; production
  // routes load `PostgresSaver` here, tests/smoke runs get `false`.
  // resume は checkpoint から thread を引き直すため、本番では PostgresSaver を渡す。
  const checkpointer = await resolveCheckpointerForRun();

  let result;
  try {
    result = await runner.resume(
      {
        graphId: session.graphId,
        checkpointer,
        context: {
          threadId: id,
          sessionId: id,
          userId,
          pageId,
          graphId: session.graphId,
          backend: assertSupportedBackendP0(session.backend),
          tier,
          db,
          feature: `wiki_compose:${session.graphId}`,
        },
      },
      body.resume,
    );
  } catch (err) {
    if (err instanceof GraphNotRegisteredError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }

  const status: WikiComposeSessionStatus =
    result.status === "completed"
      ? "completed"
      : result.status === "interrupted"
        ? "interrupted"
        : "failed";

  await db
    .update(wikiComposeSessions)
    .set({
      status,
      lastError: status === "failed" ? (result.error ?? null) : null,
      closedAt: status === "interrupted" ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wikiComposeSessions.id, id));

  return c.json({ status, output: result.output ?? null });
});

// ── DELETE /:id — cancel ────────────────────────────────────────────────────
app.delete("/:pageId/compose-sessions/:id", authRequired, async (c) => {
  const pageId = c.req.param("pageId");
  const id = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  await assertPageEditAccess(db, pageId, userId);

  const [row] = await db
    .select({ id: wikiComposeSessions.id, status: wikiComposeSessions.status })
    .from(wikiComposeSessions)
    .where(and(eq(wikiComposeSessions.id, id), eq(wikiComposeSessions.pageId, pageId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Session not found" });

  if (row.status === "completed" || row.status === "cancelled") {
    return c.json({ status: row.status });
  }

  await db
    .update(wikiComposeSessions)
    .set({
      status: "cancelled" satisfies WikiComposeSessionStatus,
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wikiComposeSessions.id, id));

  return c.json({ status: "cancelled" });
});

function isInterruptError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" && /Interrupt/.test(name);
}

function extractInterruptPayload(err: unknown): unknown {
  if (!err || typeof err !== "object") return undefined;
  return (
    (err as { value?: unknown; payload?: unknown }).payload ?? (err as { value?: unknown }).value
  );
}

export default app;
