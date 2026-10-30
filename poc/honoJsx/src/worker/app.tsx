/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import { getAuth } from "./auth";
import { decodeCursor, encodeCursor } from "./db/cursor";
import { buildSearchPlan } from "./db/searchPlan";
import { isDevelopment, type Env } from "./env";
import { Landing } from "./landing";
import { createSseStream, mockTokens } from "./mockStream";
import { canEdit, getNoteAccess, getPageAccess } from "./services/access";
import { getDefaultNoteId, upsertMember } from "./services/notes";
import {
  createPage,
  listPages,
  newCost,
  searchPages,
  seedPages,
  type D1Cost,
} from "./services/pages";

/** Signed-in user attached to the request by `requireUser`. */
interface SessionUser {
  id: string;
  email: string;
  name: string;
}

type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };

/**
 * Routes realtime (`/parties/*`) requests to a Durable Object; injected so the app does
 * not import `cloudflare:workers`-only modules directly.
 * `/parties/*` を DO へ振り分ける関数（workerd 専用モジュールを直接読み込まないため注入）。
 */
export type RealtimeRouter = (request: Request, env: Env) => Promise<Response | null>;

function parseIntParam(raw: string | undefined, fallback: number, max: number): number | null {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= max ? value : null;
}

/** Exposes D1's own accounting so measurements can compare query plans across runs. */
function withCost(c: Context, cost: D1Cost) {
  c.header("x-d1-rows-read", String(cost.rowsRead));
  c.header("x-d1-rows-written", String(cost.rowsWritten));
  c.header("server-timing", `d1;dur=${cost.durationMs.toFixed(2)}`);
}

/**
 * Builds the single Hono app: public SSR page, Better Auth, the authorized API and realtime routing.
 * 公開ページ・認証・認可付き API・リアルタイム振り分けを 1 つの Hono アプリで提供する。
 */
export function createApp({ routeRealtime }: { routeRealtime?: RealtimeRouter } = {}) {
  const app = new Hono<AppEnv>();

  app.get("/", (c) => c.html(`<!DOCTYPE html>${(<Landing />).toString()}`));
  app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth(c.env, c.req.url).handler(c.req.raw));

  // Development only: read the magic link that would have been e-mailed.
  app.get("/api/dev/outbox", async (c) => {
    if (!isDevelopment(c.env)) return c.notFound();
    const row = await c.env.DB.prepare(
      "SELECT url FROM dev_outbox WHERE email = ?1 ORDER BY id DESC LIMIT 1",
    )
      .bind(c.req.query("email") ?? "")
      .first<{ url: string }>();
    return row ? c.json(row) : c.notFound();
  });

  const api = new Hono<AppEnv>();
  api.use(async (c, next) => {
    const session = await getAuth(c.env, c.req.url).api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("user", { id: session.user.id, email: session.user.email, name: session.user.name });
    await next();
  });

  api.get("/me", async (c) => {
    const user = c.get("user");
    const cost = newCost();
    const defaultNoteId = await getDefaultNoteId(c.env.DB, user.id, cost);
    withCost(c, cost);
    return c.json({ user, defaultNoteId });
  });

  api.get("/notes/:noteId/pages", async (c) => {
    const limit = parseIntParam(c.req.query("limit"), 50, 200);
    const rawCursor = c.req.query("cursor");
    const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);
    if (limit === null || (rawCursor !== undefined && cursor === null))
      return c.json({ error: "invalid query" }, 400);
    const cost = newCost();
    const access = await getNoteAccess(c.env.DB, c.get("user").id, c.req.param("noteId"), cost);
    if (!access) return c.notFound();
    const { items, next } = await listPages(c.env.DB, access.noteId, cursor, limit, cost);
    withCost(c, cost);
    return c.json({
      items,
      nextCursor: next ? encodeCursor(next) : null,
      total: access.pageCount,
      role: access.role,
    });
  });

  api.post("/notes/:noteId/pages", async (c) => {
    const access = await getNoteAccess(c.env.DB, c.get("user").id, c.req.param("noteId"));
    if (!access) return c.notFound();
    if (!canEdit(access.role)) return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json<{ title?: unknown }>().catch(() => ({}) as { title?: unknown });
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length === 0 || title.length > 200) return c.json({ error: "invalid title" }, 400);
    const cost = newCost();
    const id = await createPage(c.env.DB, access.noteId, title, cost);
    withCost(c, cost);
    return c.json({ id }, 201);
  });

  api.post("/notes/:noteId/members", async (c) => {
    const access = await getNoteAccess(c.env.DB, c.get("user").id, c.req.param("noteId"));
    if (!access) return c.notFound();
    if (access.role !== "owner") return c.json({ error: "forbidden" }, 403);
    const body = await c.req
      .json<{ email?: unknown; role?: unknown }>()
      .catch(() => ({}) as Record<string, unknown>);
    if (typeof body.email !== "string" || (body.role !== "viewer" && body.role !== "editor")) {
      return c.json({ error: "invalid member" }, 400);
    }
    const added = await upsertMember(c.env.DB, access.noteId, body.email, body.role);
    return added ? c.body(null, 204) : c.json({ error: "user not found" }, 404);
  });

  api.get("/pages/:id", async (c) => {
    const cost = newCost();
    const page = await getPageAccess(c.env.DB, c.get("user").id, c.req.param("id"), cost);
    withCost(c, cost);
    return page ? c.json(page) : c.notFound();
  });

  api.get("/search", async (c) => {
    const plan = buildSearchPlan(c.req.query("q") ?? "");
    if (!plan) return c.json({ items: [] });
    const cost = newCost();
    const items = await searchPages(c.env.DB, c.get("user").id, plan, cost);
    withCost(c, cost);
    return c.json({ items });
  });

  api.post("/dev/seed", async (c) => {
    if (!isDevelopment(c.env)) return c.notFound();
    const body = await c.req.json<{ count?: unknown }>().catch(() => ({}) as { count?: unknown });
    const count = typeof body.count === "number" && Number.isInteger(body.count) ? body.count : 0;
    if (count < 1 || count > 50_000) return c.json({ error: "count must be 1..50000" }, 400);
    const noteId = await getDefaultNoteId(c.env.DB, c.get("user").id);
    const cost = newCost();
    const started = Date.now();
    const inserted = await seedPages(c.env.DB, noteId, count, cost);
    withCost(c, cost);
    return c.json({ inserted, ms: Date.now() - started, rowsWritten: cost.rowsWritten });
  });

  api.get("/ai/chat", (c) => {
    const count = Math.min(Number(c.req.query("tokens") ?? 400) || 400, 20_000);
    const interval = Math.min(Number(c.req.query("interval") ?? 10) || 0, 1_000);
    return new Response(createSseStream(mockTokens(count, 1), interval), {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
    });
  });

  app.route("/api", api);

  app.all("/parties/*", async (c) => {
    const res = routeRealtime ? await routeRealtime(c.req.raw, c.env) : null;
    return res ?? c.notFound();
  });

  return app;
}
