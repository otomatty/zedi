/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { Landing } from "./landing";
import { createSseStream, mockTokens } from "./mockStream";
import { MAX_LIST_LIMIT, type NoteStore } from "./fakeNotes";

/** Worker bindings used by the PoC. */
export interface Env {
  PageRoom: DurableObjectNamespace;
}

function parseIntParam(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined) return fallback;
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/**
 * Routes realtime (`/parties/*`) requests to a Durable Object; injected so the app stays
 * testable outside workerd (partyserver imports `cloudflare:workers`).
 * `/parties/*` を DO へ振り分ける関数。workerd 外でもテストできるよう注入する。
 */
export type RealtimeRouter = (request: Request, env: Env) => Promise<Response | null>;

/**
 * Builds the single Hono app that serves the landing page, the API and realtime routing.
 * 公開ページ・API・リアルタイム接続の振り分けを 1 つの Hono アプリで提供する。
 */
export function createApp({
  notes,
  routeRealtime,
}: {
  notes: NoteStore;
  routeRealtime?: RealtimeRouter;
}) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", (c) => c.html(`<!DOCTYPE html>${(<Landing />).toString()}`));

  app.get("/api/notes", (c) => {
    const limit = parseIntParam(c.req.query("limit"), 50);
    const offset = parseIntParam(c.req.query("offset"), 0);
    if (limit === null || offset === null || limit < 1 || limit > MAX_LIST_LIMIT) {
      return c.json({ error: "invalid limit/offset" }, 400);
    }
    return c.json(notes.list({ offset, limit, query: c.req.query("q") }));
  });

  app.get("/api/notes/:id", (c) => {
    const note = notes.get(c.req.param("id"));
    return note ? c.json(note) : c.json({ error: "not found" }, 404);
  });

  app.get("/api/ai/chat", (c) => {
    const count = Math.min(parseIntParam(c.req.query("tokens"), 400) ?? 400, 20_000);
    const interval = Math.min(parseIntParam(c.req.query("interval"), 10) ?? 10, 1_000);
    return new Response(createSseStream(mockTokens(count, 1), interval), {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
    });
  });

  app.all("/parties/*", async (c) => {
    const res = routeRealtime ? await routeRealtime(c.req.raw, c.env) : null;
    return res ?? c.notFound();
  });

  return app;
}
