/**
 * `/api/pages/:pageId/compose-sessions` — Wiki Compose session API.
 *
 * Wiki Compose の P0 ルートスケルトン。`wiki_compose_sessions` テーブルの CRUD と、
 * `GraphRunner` 経由でのグラフ実行 (run / resume) を提供する。SSE 形式は
 * `agents/core/types/sseEvents.ts` の `SseEvent` に従う。本ファイル自体は graph
 * 中立で、入力 / 再開ペイロードの shape は各 graph のノードが zod で検証する。
 *
 * - `POST   /api/pages/:pageId/compose-sessions`              — Create
 * - `GET    /api/pages/:pageId/compose-sessions/:id`          — Read
 * - `POST   /api/pages/:pageId/compose-sessions/:id/run`      — SSE
 * - `PATCH  /api/pages/:pageId/compose-sessions/:id/resume`   — Resume from interrupt
 * - `DELETE /api/pages/:pageId/compose-sessions/:id`          — Cancel
 *
 * # Per-graph contracts
 *
 * `wiki-compose-research` (#949 / P1):
 * - `POST /run` body.input shapes:
 *   - Initial run: `{ messages?: [...], maxIterations?: number }` (or any
 *     object; the graph reads `state.messages` set by LangGraph from
 *     `body.input`).
 *   - Additional research (re-run on a *new* session of the same graph id):
 *     `{ kind: "additional_research", instruction: string, brief?: string,
 *        carryOverApprovedIds?: string[] }`
 *     The `plan_queries` node detects this shape, resets the loop, and seeds
 *     `pendingSources` from `carryOverApprovedIds`.
 * - `PATCH /resume` body.resume shape:
 *   `{ approvedSourceIds: string[], rejectedSourceIds?: string[], note?: string }`
 *   (validated by `researchResumeSchema`; ill-formed payload fails the run.)
 *
 * Issue: otomatty/zedi#948 (P0), otomatty/zedi#949 (P1)
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { and, eq, inArray } from "drizzle-orm";
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
  assertSupportedComposeBackend,
  UnsupportedBackendError,
} from "../agents/core/llm/modelFactory.js";
import { assertComposeBackendReady } from "../agents/core/composeBackendValidation.js";
import { SSE_EVENT_NAMES, type SseEvent } from "../agents/core/types/sseEvents.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../agents/core/types/graphContext.js";
import { resolveCheckpointerForRun } from "../agents/core/checkpoint/index.js";
import { RESEARCH_GRAPH_ID } from "../agents/subgraphs/research/index.js";
import { WIKI_COMPOSE_GRAPH_ID } from "../agents/graphs/wikiCompose/index.js";
import type { AppEnv } from "../types/index.js";
import { persistOutcomeIfStillRunning } from "./composeSessionPersistence.js";
import { loadComposeSessionProjection } from "./composeSessionProjection.js";

/**
 * Translate the documented `body.input.kind === "additional_research"` shape
 * into a state-compatible payload for the research graph. LangGraph's strict
 * state schema drops top-level input keys that have no annotation; without
 * this translation the `kind` / `instruction` / `carryOverApprovedIds` fields
 * would silently vanish and the loop would behave like a normal initial run.
 * (codex review #956 P1.)
 *
 * For graphs other than `wiki-compose-research`, the input passes through
 * unchanged.
 */
function translateGraphInput(graphId: string, raw: unknown): unknown {
  if (graphId !== RESEARCH_GRAPH_ID) return raw;
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as {
    kind?: unknown;
    instruction?: unknown;
    carryOverApprovedIds?: unknown;
    brief?: unknown;
  };
  if (r.kind !== "additional_research") return raw;
  const instruction = typeof r.instruction === "string" ? r.instruction : "";
  const carryOverApprovedIds = Array.isArray(r.carryOverApprovedIds)
    ? r.carryOverApprovedIds.filter((x): x is string => typeof x === "string")
    : undefined;
  const brief = typeof r.brief === "string" ? r.brief : undefined;
  return {
    additionalRequest: { instruction, carryOverApprovedIds, brief },
  };
}

/**
 * Per-graph recursion limit. LangGraph's default of 25 is enough for the stub
 * graph but tight for `wiki-compose-research`, which runs up to ~5 iterations
 * × ~6 nodes ≈ 30 node executions. The full `wiki-compose` orchestrator (#950)
 * adds Brief + Structure + Draft (up to ~10 sections × 1 node) on top of the
 * inlined research loop, so it needs a larger budget still.
 *
 * 調査ループは最大 5 イテレーション × 約 6 ノード = ~30 node 実行になり得るため、
 * 既定の 25 では不足する。orchestrator (`wiki-compose`) は更に Brief / Structure /
 * Draft フェーズ + 最大 10 セクションを足すので 120 に引き上げる。
 */
function recursionLimitFor(graphId: string): number | undefined {
  if (graphId === RESEARCH_GRAPH_ID) return 60;
  if (graphId === WIKI_COMPOSE_GRAPH_ID) return 120;
  return undefined;
}

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
  /**
   * Interrupt に渡す再開値。HITL の場合は通常ユーザー応答。
   *
   * Per-graph contract (validated inside the graph's HITL node):
   * - `wiki-compose-research` (#949):
   *   `{ approvedSourceIds: string[], rejectedSourceIds?: string[], note?: string }`
   *
   * Per-graph contract; the graph node validates the shape and rejects on
   * mismatch. The route itself is shape-agnostic.
   */
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

  let backend: ReturnType<typeof assertSupportedComposeBackend>;
  try {
    backend = assertSupportedComposeBackend(body.backend ?? "zedi_managed");
  } catch (err) {
    if (err instanceof UnsupportedBackendError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }

  const tier = await getUserTier(userId, db);
  await assertComposeBackendReady({ backend, graphId, userId, tier, db });

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

  const tier = await getUserTier(userId, db);

  // Stale / unsupported backend rows must still be readable; skip projection
  // instead of turning GET into a 500 (CodeRabbit P1 on reload path).
  // 古い backend 行でもセッション行は返し、projection だけ省略する。
  let projection = null;
  try {
    const backend = assertSupportedComposeBackend(row.backend);
    projection = await loadComposeSessionProjection({
      sessionId: row.id,
      pageId: row.pageId,
      graphId: row.graphId,
      status: row.status,
      phase: row.phase,
      context: {
        threadId: row.id,
        sessionId: row.id,
        userId,
        userEmail: c.get("userEmail") ?? null,
        pageId: row.pageId,
        graphId: row.graphId,
        backend,
        tier,
        db,
        feature: `wiki_compose:${row.graphId}`,
      },
    });
  } catch (err) {
    if (!(err instanceof UnsupportedBackendError)) {
      throw err;
    }
  }

  return c.json({ session: row, projection });
});

// ── POST /:id/run — SSE run ─────────────────────────────────────────────────
app.post("/:pageId/compose-sessions/:id/run", authRequired, rateLimit(), async (c) => {
  const pageId = c.req.param("pageId");
  const id = c.req.param("id");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail") ?? null;
  const db = c.get("db");

  await assertPageEditAccess(db, pageId, userId);

  const [session] = await db
    .select()
    .from(wikiComposeSessions)
    .where(and(eq(wikiComposeSessions.id, id), eq(wikiComposeSessions.pageId, pageId)))
    .limit(1);
  if (!session) throw new HTTPException(404, { message: "Session not found" });

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
    assertSupportedComposeBackend(session.backend);
  } catch (err) {
    if (err instanceof UnsupportedBackendError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }

  // Atomically claim the session so concurrent POST /run cannot both pass a
  // read-then-write race and double-bill LLM usage.
  const [claimed] = await db
    .update(wikiComposeSessions)
    .set({ status: "running" satisfies WikiComposeSessionStatus, updatedAt: new Date() })
    .where(
      and(
        eq(wikiComposeSessions.id, id),
        eq(wikiComposeSessions.pageId, pageId),
        inArray(wikiComposeSessions.status, ["pending", "interrupted", "failed"]),
      ),
    )
    .returning();
  if (!claimed) {
    throw new HTTPException(409, {
      message:
        session.status === "running"
          ? "Session is already running"
          : `Session is ${session.status}`,
    });
  }

  return streamSSE(c, async (stream) => {
    const send = async (ev: SseEvent) => {
      await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
    };

    let finalStatus: WikiComposeSessionStatus = "failed";
    let lastError: string | null = null;
    let persisted = false;

    const persistSession = async () => {
      if (persisted) return;
      persisted = true;
      await persistOutcomeIfStillRunning(db, id, {
        status: finalStatus,
        lastError,
      });
    };

    stream.onAbort(() => {
      if (persisted) return;
      // Preserve terminal outcomes decided before the client disconnected.
      if (finalStatus !== "completed" && finalStatus !== "interrupted") {
        finalStatus = "failed";
        lastError = lastError ?? "Client disconnected";
      }
      void persistSession();
    });

    // `DATABASE_URL` が設定された本番経路では `PostgresSaver` を取得して
    // checkpoint 保存・再開を有効化する。テスト / CI では未設定なので `false`
    // を返し、LangGraph の checkpoint 機構を無効化したまま smoke-test で走る。
    const checkpointer = await resolveCheckpointerForRun();

    try {
      await send(startedEvent(id, session.graphId, session.phase));

      const recursionLimit = recursionLimitFor(session.graphId);
      const events = runner.streamEvents(
        {
          graphId: session.graphId,
          checkpointer,
          ...(recursionLimit !== undefined ? { recursionLimit } : {}),
          context: {
            threadId: id,
            sessionId: id,
            userId,
            userEmail,
            pageId,
            graphId: session.graphId,
            backend: assertSupportedComposeBackend(session.backend),
            tier,
            db,
            feature: `wiki_compose:${session.graphId}`,
          },
        },
        { kind: "input", value: translateGraphInput(session.graphId, body.input ?? {}) },
      );

      for await (const raw of events) {
        const ev = raw as LangGraphRuntimeEvent;
        for (const mapped of mapLangGraphEvent(ev)) {
          // LangGraph ≥ 1.x emits interrupts as a `__interrupt__` field on the
          // final `on_chain_end` event rather than as a throw; sseMapper turns
          // those into `SseInterruptEvent` rows. Treat any emitted interrupt
          // event as terminal — flip status to "interrupted" so the route
          // persists `closedAt=null` and surfaces resume affordance.
          // LangGraph 1.x では interrupt は throw されず on_chain_end の output
          // 内で来る。sseMapper が interrupt SSE に変換するので、ここでは
          // emitted した時点で finalStatus を interrupted にする。
          if (mapped.type === "interrupt") {
            finalStatus = "interrupted";
          }
          await send(mapped);
        }
      }

      // Only promote to "completed" if the stream did NOT emit an interrupt
      // event above. Without this guard, an interrupt detected inside the
      // for-await loop would be silently overwritten to "completed" once the
      // stream drains (codex review #956 / coderabbit critical finding).
      // ストリーム完走時点で interrupted を上書きしないよう、明示的にガードする。
      if (finalStatus !== "interrupted") {
        finalStatus = "completed";
      }
    } catch (err) {
      // Legacy throw path (LangGraph might re-introduce, version skew etc.).
      // 古い throw 経路の保険として残す。
      if (isInterruptError(err)) {
        finalStatus = "interrupted";
        await send({ type: "interrupt", payload: extractInterruptPayload(err) });
      } else {
        finalStatus = "failed";
        lastError = err instanceof Error ? err.message : String(err);
        await send(errorEvent(lastError));
      }
    } finally {
      if (finalStatus === "completed") {
        await send(statusEvent("completed"));
      }
      await send(doneEvent(finalStatus));
      await persistSession();

      // Hush unused-import warning when running without exporting names; keeps the
      // import grouped with the SSE writes for readability.
      void SSE_EVENT_NAMES;
      void GRAPH_CONTEXT_CONFIG_KEY;
    }
  });
});

// ── PATCH /:id/resume ───────────────────────────────────────────────────────
app.patch("/:pageId/compose-sessions/:id/resume", authRequired, rateLimit(), async (c) => {
  const pageId = c.req.param("pageId");
  const id = c.req.param("id");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail") ?? null;
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

  try {
    assertSupportedComposeBackend(session.backend);
  } catch (err) {
    if (err instanceof UnsupportedBackendError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }

  const [claimed] = await db
    .update(wikiComposeSessions)
    .set({ status: "running", updatedAt: new Date() })
    .where(
      and(
        eq(wikiComposeSessions.id, id),
        eq(wikiComposeSessions.pageId, pageId),
        eq(wikiComposeSessions.status, "interrupted"),
      ),
    )
    .returning();
  if (!claimed) {
    throw new HTTPException(409, { message: "Session is not interrupted" });
  }

  // Resume relies on the checkpointer to fetch the suspended thread; production
  // routes load `PostgresSaver` here, tests/smoke runs get `false`.
  const checkpointer = await resolveCheckpointerForRun();

  let result;
  try {
    const recursionLimit = recursionLimitFor(session.graphId);
    result = await runner.resume(
      {
        graphId: session.graphId,
        checkpointer,
        ...(recursionLimit !== undefined ? { recursionLimit } : {}),
        context: {
          threadId: id,
          sessionId: id,
          userId,
          userEmail,
          pageId,
          graphId: session.graphId,
          backend: assertSupportedComposeBackend(session.backend),
          tier,
          db,
          feature: `wiki_compose:${session.graphId}`,
        },
      },
      body.resume,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await persistOutcomeIfStillRunning(db, id, {
      status: "failed",
      lastError: message,
    });
    if (err instanceof GraphNotRegisteredError || err instanceof UnsupportedBackendError) {
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

  await persistOutcomeIfStillRunning(db, id, {
    status,
    lastError: status === "failed" ? (result.error ?? null) : null,
  });

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

  const cancellable: WikiComposeSessionStatus[] = ["pending", "running", "interrupted", "failed"];

  const [cancelled] = await db
    .update(wikiComposeSessions)
    .set({
      status: "cancelled" satisfies WikiComposeSessionStatus,
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(wikiComposeSessions.id, id), inArray(wikiComposeSessions.status, cancellable)))
    .returning({ status: wikiComposeSessions.status });

  if (cancelled) {
    return c.json({ status: "cancelled" });
  }

  // Graph may have finished (e.g. `completed`) between the initial read and this update.
  const [latest] = await db
    .select({ status: wikiComposeSessions.status })
    .from(wikiComposeSessions)
    .where(and(eq(wikiComposeSessions.id, id), eq(wikiComposeSessions.pageId, pageId)))
    .limit(1);

  return c.json({ status: latest?.status ?? row.status });
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
