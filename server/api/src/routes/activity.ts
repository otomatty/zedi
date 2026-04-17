/**
 * /api/activity — Wiki activity log endpoints (P4, otomatty/zedi#598).
 *
 * GET  /api/activity             — list entries for the authenticated user
 *                                  (filterable by kind / actor / date range).
 * POST /api/activity/index/rebuild — rebuild the `__index__` special page
 *                                     for the authenticated user.
 *
 * 認証ユーザー自身の活動ログを参照するエンドポイントと、
 * `__index__` 特殊ページを手動再構築するエンドポイント。
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../middleware/auth.js";
import {
  listActivityForOwner,
  recordActivity,
  ACTIVITY_LIST_DEFAULT_LIMIT,
  ACTIVITY_LIST_MAX_LIMIT,
} from "../services/activityLogService.js";
import type { ActivityActor, ActivityKind } from "../schema/activityLog.js";
import { rebuildIndexForOwner } from "../services/indexBuilder.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();
app.use("*", authRequired);

const VALID_KINDS: ReadonlyArray<ActivityKind> = [
  "clip_ingest",
  "chat_promote",
  "lint_run",
  "wiki_generate",
  "index_build",
  "wiki_schema_update",
];
const VALID_ACTORS: ReadonlyArray<ActivityActor> = ["user", "ai", "system"];

/**
 * ISO 8601 風の日付文字列をパースし、不正値は null を返す。
 * Parse an ISO-ish date, returning null on invalid input.
 */
function parseDate(raw: string | undefined): { date: Date | null; invalid: boolean } {
  if (raw === undefined) return { date: null, invalid: false };
  const trimmed = raw.trim();
  if (!trimmed) return { date: null, invalid: false };
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return { date: null, invalid: true };
  return { date: d, invalid: false };
}

/**
 * `kind` / `actor` クエリを検証する。不正な値は HTTPException を投げる。
 * Validates the `kind` / `actor` query strings; throws on invalid values.
 */
function parseKindAndActor(kindRaw: string | undefined, actorRaw: string | undefined) {
  const kind =
    kindRaw && VALID_KINDS.includes(kindRaw as ActivityKind)
      ? (kindRaw as ActivityKind)
      : undefined;
  const actor =
    actorRaw && VALID_ACTORS.includes(actorRaw as ActivityActor)
      ? (actorRaw as ActivityActor)
      : undefined;
  if (kindRaw && !kind) {
    throw new HTTPException(400, { message: `invalid kind: ${kindRaw}` });
  }
  if (actorRaw && !actor) {
    throw new HTTPException(400, { message: `invalid actor: ${actorRaw}` });
  }
  return { kind, actor };
}

/**
 * `from` / `to` クエリを検証し Date を返す。不正な組み合わせは HTTPException を投げる。
 * Validates the `from` / `to` query strings; throws on invalid / inverted range.
 */
function parseDateRange(fromRaw: string | undefined, toRaw: string | undefined) {
  const from = parseDate(fromRaw);
  if (from.invalid) {
    throw new HTTPException(400, { message: "invalid 'from' date (ISO 8601 required)" });
  }
  const to = parseDate(toRaw);
  if (to.invalid) {
    throw new HTTPException(400, { message: "invalid 'to' date (ISO 8601 required)" });
  }
  if (from.date && to.date && from.date > to.date) {
    throw new HTTPException(400, { message: "'from' must be earlier than or equal to 'to'" });
  }
  return { from: from.date ?? undefined, to: to.date ?? undefined };
}

/**
 * GET /api/activity
 *
 * Query params: `kind`, `actor`, `from`, `to`, `limit`, `offset`.
 * クエリ: `kind`・`actor`・`from`・`to`・`limit`・`offset`。
 */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const { kind, actor } = parseKindAndActor(
    c.req.query("kind")?.trim(),
    c.req.query("actor")?.trim(),
  );
  const { from, to } = parseDateRange(c.req.query("from"), c.req.query("to"));

  const limitRaw = Number(c.req.query("limit") ?? ACTIVITY_LIST_DEFAULT_LIMIT);
  const offsetRaw = Number(c.req.query("offset") ?? 0);
  const limit = Number.isFinite(limitRaw) ? limitRaw : ACTIVITY_LIST_DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;

  const { rows, total } = await listActivityForOwner(db, userId, {
    kind,
    actor,
    from,
    to,
    limit,
    offset,
  });

  return c.json({
    entries: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      actor: r.actor,
      target_page_ids: r.targetPageIds,
      detail: r.detail,
      created_at: r.createdAt.toISOString(),
    })),
    total,
    limit: Math.min(Math.max(limit, 1), ACTIVITY_LIST_MAX_LIMIT),
  });
});

/**
 * POST /api/activity/index/rebuild — rebuild the `__index__` special page
 * for the authenticated user and return its ID plus category summary.
 *
 * `__index__` 特殊ページを再構築し、カテゴリ概要を返す。
 */
app.post("/index/rebuild", async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const { pageId, created, document } = await rebuildIndexForOwner(db, userId);

  await recordActivity(db, {
    ownerId: userId,
    kind: "index_build",
    actor: "user",
    targetPageIds: [pageId],
    detail: {
      created,
      totalPages: document.totalPages,
      categoryCount: document.categories.length,
    },
  });

  return c.json({
    pageId,
    created,
    totalPages: document.totalPages,
    categories: document.categories.map((cat) => ({
      label: cat.label,
      count: cat.entries.length,
    })),
    generatedAt: document.generatedAt,
  });
});

export default app;
