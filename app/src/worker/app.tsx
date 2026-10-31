/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import { getAuth, googleConfigured } from "./auth";
import { decodeCursor, encodeCursor } from "./db/cursor";
import { buildSearchPlan } from "./db/searchPlan";
import { isDevelopment, type Env } from "./env";
import { Landing } from "./landing";
import { createSseStream, mockMarkdownTokens, mockTokens } from "./mockStream";
import { secondFactorRoutes } from "./secondFactor/routes";
import { currentSession } from "./secondFactor/session";
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
 * Better Auth endpoints that need no check of the current session: starting and finishing the
 * Google (or test IdP) sign-in, which replaces it, signing out, and the error page.
 * 今のセッションを確かめなくてよい Better Auth の窓口（サインインの開始と完了、サインアウトなど）。
 */
const SIGN_IN_FLOW =
  /^\/api\/auth\/(?:sign-in\/(?:social|oauth2)|(?:oauth2\/)?callback\/[^/]+|sign-out|error|ok)$/;
const GET_SESSION = "/api/auth/get-session";

/** Page ids are UUIDs; clients may generate them when creating pages offline. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
/**
 * Parses a JSON request body as an object of unknown fields; a missing, malformed or non-object
 * body (`null`, an array, a number) reads as `{}`, so validation answers 400 rather than 500.
 * JSON 本文をオブジェクトとして読む。欠落・不正・オブジェクト以外は `{}` にして 400 で返せるようにする。
 */
async function readJsonObject(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

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
  // Better Auth. A session that has passed only Google may finish signing in, read itself or
  // sign out; its account endpoints (sessions, linked accounts, profile) wait for the second
  // factor. Once its ten minutes are up it is gone everywhere, get-session included.
  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    if (!SIGN_IN_FLOW.test(c.req.path)) {
      const current = await currentSession(c.env, c.req.raw);
      const getSession = c.req.path === GET_SESSION;
      if (current?.state === "expired") {
        return getSession ? c.json(null) : c.json({ error: "unauthorized" }, 401);
      }
      if (current?.state === "pending" && !getSession) {
        return c.json({ error: "second_factor_required" }, 403);
      }
    }
    return getAuth(c.env, c.req.url).handler(c.req.raw);
  });

  // Public: which sign-in buttons the sign-in page shows.
  app.get("/api/sign-in-options", (c) =>
    c.json({ google: googleConfigured(c.env), testIdp: Boolean(c.env.TEST_IDP) }),
  );

  // The test IdP's sign-in page, served on this origin so its redirect can only come back here.
  // Its token and userinfo endpoints stay reachable only over the service binding.
  app.on(["GET", "POST"], "/test-idp/authorize", (c) =>
    c.env.TEST_IDP ? c.env.TEST_IDP.fetch(c.req.raw) : c.notFound(),
  );

  // Registering and checking the second factor, open to sessions that have passed only Google.
  // Mounted before `api`, whose middleware would turn those sessions away.
  app.route("/api/second-factor", secondFactorRoutes());

  const api = new Hono<AppEnv>();
  api.use(async (c, next) => {
    const current = await currentSession(c.env, c.req.raw);
    if (!current || current.state === "expired") return c.json({ error: "unauthorized" }, 401);
    if (current.state === "pending") return c.json({ error: "second_factor_required" }, 403);
    c.set("user", current.user);
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
    const body = await readJsonObject(c);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length === 0 || title.length > 200) return c.json({ error: "invalid title" }, 400);
    // Optional client-generated id (offline creation); retries with the same id are safe.
    if (body.id !== undefined && !(typeof body.id === "string" && UUID.test(body.id))) {
      return c.json({ error: "invalid id" }, 400);
    }
    const cost = newCost();
    const result = await createPage(
      c.env.DB,
      access.noteId,
      title,
      cost,
      typeof body.id === "string" ? body.id.toLowerCase() : undefined,
    );
    withCost(c, cost);
    if ("conflict" in result) return c.json({ error: "id already in use" }, 409);
    return c.json({ id: result.id }, result.created ? 201 : 200);
  });

  api.post("/notes/:noteId/members", async (c) => {
    const access = await getNoteAccess(c.env.DB, c.get("user").id, c.req.param("noteId"));
    if (!access) return c.notFound();
    if (access.role !== "owner") return c.json({ error: "forbidden" }, 403);
    const body = await readJsonObject(c);
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
    const body = await readJsonObject(c);
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
    const tokens =
      c.req.query("format") === "markdown" ? mockMarkdownTokens(count, 1) : mockTokens(count, 1);
    return new Response(createSseStream(tokens, interval), {
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
