/**
 * `GET /api/admin/errors`, `GET /api/admin/errors/:id`,
 * `PATCH /api/admin/errors/:id` — 管理画面用 API エラー一覧 / 詳細 / 状態更新。
 *
 * Admin-only API for the `api_errors` workflow board (Epic #616 Phase 1).
 * Authentication & admin role enforcement happen at the parent
 * `/api/admin/*` mount; this router only handles request shaping and
 * delegates to `apiErrorService` for DB access.
 *
 * @see ../../services/apiErrorService.ts
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/803
 */
import { Hono } from "hono";
import {
  ApiErrorStatusConflictError,
  API_ERROR_LIST_DEFAULT_LIMIT,
  API_ERROR_LIST_MAX_LIMIT,
  getApiErrorById,
  listApiErrors,
  updateApiErrorStatus,
} from "../../services/apiErrorService.js";
import type { ApiErrorSeverity, ApiErrorStatus } from "../../schema/apiErrors.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

const VALID_STATUSES = ["open", "investigating", "resolved", "ignored"] as const;
const VALID_SEVERITIES = ["high", "medium", "low", "unknown"] as const;

/**
 * クエリ文字列を `ApiErrorStatus` に変換する。空 / 不正値は `null`。
 * Parse a query value into a valid `ApiErrorStatus`, returning `null` for
 * missing or unrecognized inputs.
 */
function parseStatus(raw: string | undefined): ApiErrorStatus | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return (VALID_STATUSES as readonly string[]).includes(trimmed)
    ? (trimmed as ApiErrorStatus)
    : null;
}

/**
 * クエリ文字列を `ApiErrorSeverity` に変換する。空 / 不正値は `null`。
 * Parse a query value into a valid `ApiErrorSeverity`, returning `null` for
 * missing or unrecognized inputs.
 */
function parseSeverity(raw: string | undefined): ApiErrorSeverity | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return (VALID_SEVERITIES as readonly string[]).includes(trimmed)
    ? (trimmed as ApiErrorSeverity)
    : null;
}

/**
 * 整数のクエリパラメータを範囲内に丸める。
 * Clamp an integer query parameter into `[lo, hi]`, falling back to `fallback`
 * for missing or non-finite inputs.
 */
function clampInt(raw: string | undefined, fallback: number, lo: number, hi: number): number {
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(lo, n), hi);
}

/**
 * GET /api/admin/errors — 一覧取得（ページネーション + フィルタ）。
 *
 * クエリ:
 * - `status`: open / investigating / resolved / ignored
 * - `severity`: high / medium / low / unknown
 * - `limit`: 1〜200（既定 50） / `offset`: 0〜
 *
 * GET /api/admin/errors — paginated list with optional status / severity
 * filters. Unknown query values are silently dropped (treated as no filter)
 * to keep the admin UI forgiving when extending the enums.
 */
app.get("/", async (c) => {
  const db = c.get("db");
  const status = parseStatus(c.req.query("status"));
  const severity = parseSeverity(c.req.query("severity"));
  const limit = clampInt(
    c.req.query("limit"),
    API_ERROR_LIST_DEFAULT_LIMIT,
    1,
    API_ERROR_LIST_MAX_LIMIT,
  );
  const offset = clampInt(c.req.query("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  const { rows, total } = await listApiErrors(db, {
    status: status ?? undefined,
    severity: severity ?? undefined,
    limit,
    offset,
  });

  return c.json({ errors: rows, total, limit, offset });
});

/**
 * GET /api/admin/errors/:id — 詳細取得。
 * GET /api/admin/errors/:id — fetch a single row by primary key.
 */
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const row = await getApiErrorById(db, id);
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ error: row });
});

/**
 * PATCH /api/admin/errors/:id — ワークフロー状態 (`status`) を更新する。
 *
 * - 400: 不正な JSON、未知の status、許可されていない遷移
 * - 404: 行が存在しない
 * - 409: 並行更新が検知された (`ApiErrorStatusConflictError`)
 *
 * PATCH /api/admin/errors/:id — update workflow `status`.
 *
 * - 400: invalid JSON, unknown status, or disallowed transition
 * - 404: row not found
 * - 409: `ApiErrorStatusConflictError` from a concurrent update
 */
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");

  let body: { status?: unknown };
  try {
    body = await c.req.json<{ status?: unknown }>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  if (typeof body.status !== "string") {
    return c.json({ error: "status is required" }, 400);
  }
  const nextStatus = parseStatus(body.status);
  if (!nextStatus) {
    return c.json(
      {
        error: `status must be one of ${VALID_STATUSES.join(", ")}`,
      },
      400,
    );
  }

  try {
    const row = await updateApiErrorStatus(db, { id, nextStatus });
    if (!row) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ error: row });
  } catch (err) {
    if (err instanceof ApiErrorStatusConflictError) {
      return c.json({ error: "status changed concurrently; refetch and retry" }, 409);
    }
    if (err instanceof Error && /invalid api_errors status transition/i.test(err.message)) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

export default app;
