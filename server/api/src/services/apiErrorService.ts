/**
 * `api_errors` テーブル用のサービスヘルパ。
 *
 * `apiErrorService` は Sentry Webhook ハンドラと管理者画面 (`/admin/errors`)
 * の両方から呼ばれる。Webhook 経路では `upsertFromSentrySummary` が
 * `sentry_issue_id` をユニークキーとして発生回数 (`occurrences`) を加算し、
 * 初回観測時刻 (`first_seen_at`) を保持する。管理者画面経路では一覧・単件
 * 取得とワークフロー状態 (`status`) の更新を提供する。
 *
 * Service helpers for the `api_errors` table. Used both by the Sentry webhook
 * handler (idempotent upsert keyed on `sentry_issue_id`, occurrence-counter
 * increment, first-seen preservation) and the admin error page (list / detail
 * / status workflow updates).
 *
 * @see ../schema/apiErrors.ts
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/802
 */
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { apiErrors } from "../schema/apiErrors.js";
import type {
  ApiError,
  ApiErrorSeverity,
  ApiErrorStatus,
  ApiErrorSuspectedFile,
  NewApiError,
} from "../schema/apiErrors.js";
import type { Database } from "../types/index.js";

/**
 * 状態遷移の許可マップ。`from -> to` の集合で表現する。
 *
 * - 同一 status へのフラットな遷移はマップから除外しており、呼び出し側で
 *   先回りに「同一なら no-op」と扱う想定。
 * - `ignored` から再度ワークフローに戻すには一旦 `open` に戻す必要がある
 *   （見落とし防止のため `investigating` への直接遷移を許可しない）。
 *
 * Allowed `from -> to` transitions for `api_errors.status`. Same-state moves
 * are intentionally excluded; callers should short-circuit those as no-ops.
 * Re-engaging an `ignored` issue must go via `open` so the ignore decision is
 * explicitly revisited (no jumping straight to `investigating`).
 */
export const ALLOWED_API_ERROR_STATUS_TRANSITIONS: Readonly<
  Record<ApiErrorStatus, readonly ApiErrorStatus[]>
> = {
  open: ["investigating", "resolved", "ignored"],
  investigating: ["resolved", "ignored", "open"],
  resolved: ["open", "ignored"],
  ignored: ["open"],
};

/**
 * 状態遷移が許可されているかを判定する。同一 status は `false` を返す
 * （呼び出し側で no-op 判定する想定）。
 *
 * Returns whether `current -> next` is permitted by
 * `ALLOWED_API_ERROR_STATUS_TRANSITIONS`. Same-state moves return `false`;
 * callers are expected to detect and short-circuit them.
 */
export function isValidApiErrorStatusTransition(
  current: ApiErrorStatus,
  next: ApiErrorStatus,
): boolean {
  if (current === next) return false;
  return ALLOWED_API_ERROR_STATUS_TRANSITIONS[current].includes(next);
}

/**
 * 不正な状態遷移をエラーとして弾く。エラーメッセージにはどちらの遷移かを
 * 含めて、API 経由での検証メッセージにそのまま使えるようにする。
 *
 * Throw on an invalid transition. The thrown message includes both endpoints
 * so it can be surfaced to admins via the API as a validation error.
 */
export function assertValidApiErrorStatusTransition(
  current: ApiErrorStatus,
  next: ApiErrorStatus,
): void {
  if (!isValidApiErrorStatusTransition(current, next)) {
    throw new Error(`Invalid api_errors status transition: ${current} -> ${next}`);
  }
}

/**
 * Sentry Webhook サマリから upsert する際の入力。
 * Input shape used by `upsertFromSentrySummary` when handling Sentry alerts.
 */
export interface UpsertFromSentrySummaryInput {
  /** Sentry issue ID（`group.id`）。空文字は拒否 / Sentry issue id; required */
  sentryIssueId: string;
  /** Sentry の fingerprint 等 / Sentry-provided fingerprint */
  fingerprint?: string | null;
  /** タイトル要約 / Short error title */
  title: string;
  /** 発生ルート / Originating route */
  route?: string | null;
  /** HTTP ステータス / HTTP status code */
  statusCode?: number | null;
  /**
   * このアラートで観測された発生回数。複数イベントを 1 通の Webhook で
   * 受け取る場合に 2 以上を渡す。デフォルト 1。
   *
   * Number of occurrences carried by this alert payload. Defaults to 1.
   */
  occurrencesDelta?: number;
  /** 初回観測時刻（初回 insert のみ使用） / First-seen (insert-only) */
  firstSeenAt?: Date;
  /** 最終観測時刻（upsert で前進する） / Last-seen; advances on upsert */
  lastSeenAt?: Date;
  /** AI 解析未完了の暫定 severity / Tentative severity before AI analysis */
  severity?: ApiErrorSeverity;
}

/**
 * `api_errors` を `sentry_issue_id` をキーに upsert する。
 *
 * - 初回 insert: 渡された値で行を作成。`occurrences` は `occurrencesDelta`
 *   （既定 1）。
 * - 競合時: `occurrences` を加算、`last_seen_at` は `GREATEST` で前進、
 *   `title` / `route` / `status_code` / `fingerprint` は新しい非 null 値で更新。
 *   **`first_seen_at` は意図的に保持する**（再来時に上書きしない）。
 *
 * Upsert keyed on `sentry_issue_id`. Inserts on first sight; on conflict,
 * increments `occurrences`, advances `last_seen_at` with `GREATEST`, refreshes
 * the descriptive columns from non-null EXCLUDED values, and **preserves
 * `first_seen_at`** by design.
 *
 * @throws when `sentryIssueId` または `title` が空、`statusCode` が
 *   有限の整数でない、`firstSeenAt` / `lastSeenAt` が不正な Date、もしくは
 *   upsert が行を返さなかった場合。Throws on empty `sentryIssueId` /
 *   `title`, non-integer `statusCode`, Invalid Date timestamps, or when
 *   the upsert produced no row.
 */
/**
 * 外部 Webhook 由来の入力を境界で正規化・検証する内部ヘルパ。
 * 不正な値は構造化メッセージで throw する（呼び出し側で 400 にマップ）。
 *
 * Internal helper: normalize + validate a webhook payload at the boundary.
 * Each violation throws with a structured message so the caller can map it
 * to HTTP 400.
 */
function normalizeUpsertInput(input: UpsertFromSentrySummaryInput): {
  sentryIssueId: string;
  title: string;
  occurrencesDelta: number;
  now: Date;
} {
  const sentryIssueId = (input.sentryIssueId ?? "").trim();
  if (!sentryIssueId) {
    throw new Error("sentryIssueId is required");
  }
  const title = (input.title ?? "").trim();
  if (!title) {
    throw new Error("title is required");
  }
  if (
    input.statusCode != null &&
    (!Number.isFinite(input.statusCode) || !Number.isInteger(input.statusCode))
  ) {
    throw new Error("statusCode must be a finite integer");
  }
  if (input.firstSeenAt && !Number.isFinite(input.firstSeenAt.getTime())) {
    throw new Error("firstSeenAt must be a valid Date");
  }
  if (input.lastSeenAt && !Number.isFinite(input.lastSeenAt.getTime())) {
    throw new Error("lastSeenAt must be a valid Date");
  }
  const rawDelta = input.occurrencesDelta ?? 1;
  const occurrencesDelta = Number.isFinite(rawDelta) ? Math.max(1, Math.floor(rawDelta)) : 1;
  const now = input.lastSeenAt ?? new Date();
  return { sentryIssueId, title, occurrencesDelta, now };
}

export async function upsertFromSentrySummary(
  db: Database,
  input: UpsertFromSentrySummaryInput,
): Promise<ApiError> {
  // Webhook 入力は外部由来。null / undefined / NaN / Invalid Date を弾く。
  // Webhook payloads are external; defend hard against null/NaN/Invalid Date.
  const { sentryIssueId, title, occurrencesDelta, now } = normalizeUpsertInput(input);

  const values: NewApiError = {
    sentryIssueId,
    fingerprint: input.fingerprint ?? null,
    title,
    route: input.route ?? null,
    statusCode: input.statusCode ?? null,
    occurrences: occurrencesDelta,
    firstSeenAt: input.firstSeenAt ?? now,
    lastSeenAt: now,
    severity: input.severity ?? "unknown",
    status: "open",
  };

  const rows = await db
    .insert(apiErrors)
    .values(values)
    .onConflictDoUpdate({
      target: apiErrors.sentryIssueId,
      set: {
        // occurrences は EXCLUDED 値（= occurrencesDelta）で加算する。
        // Increment by EXCLUDED.occurrences (== occurrencesDelta on this call).
        occurrences: sql`${apiErrors.occurrences} + EXCLUDED.occurrences`,
        // last_seen_at は新旧のうち遅い方を採用する。
        // last_seen_at advances to whichever timestamp is later.
        lastSeenAt: sql`GREATEST(${apiErrors.lastSeenAt}, EXCLUDED.last_seen_at)`,
        // 表示用カラムは新しい値を採用、null の場合は既存を維持。
        // Descriptive columns refresh from EXCLUDED, preserving on null.
        title: sql`EXCLUDED.title`,
        route: sql`COALESCE(EXCLUDED.route, ${apiErrors.route})`,
        statusCode: sql`COALESCE(EXCLUDED.status_code, ${apiErrors.statusCode})`,
        fingerprint: sql`COALESCE(EXCLUDED.fingerprint, ${apiErrors.fingerprint})`,
        // 再発検出: `resolved` は再来時に `open` へ戻す。`ignored` は
        // admin が明示的に「無視」と判断したものなので尊重して触らない。
        // それ以外（open / investigating）は維持。
        //
        // Regression detection: a recurrence reopens `resolved` rows so the
        // admin's default open/triage view surfaces them again. `ignored` is
        // an explicit admin decision and is left alone; `open` and
        // `investigating` are preserved.
        status: sql`CASE WHEN ${apiErrors.status} = 'resolved' THEN 'open'::text ELSE ${apiErrors.status} END`,
        updatedAt: sql`NOW()`,
        // first_seen_at / severity / ai_* / github_issue_number は意図的に
        // 触らない。再来で初回時刻や人手で更新した状態を巻き戻さないため。
        // first_seen_at, severity, ai_*, github_issue_number are intentionally
        // untouched: a re-occurrence must not rewind first-seen or undo
        // human / AI updates.
      },
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("upsertFromSentrySummary: upsert returned no rows");
  }
  return row;
}

/** 一覧取得のデフォルト件数 / Default page size for list queries. */
export const API_ERROR_LIST_DEFAULT_LIMIT = 50;
/** 一覧取得の最大件数 / Maximum page size for list queries. */
export const API_ERROR_LIST_MAX_LIMIT = 200;

/**
 * 一覧取得時のフィルタ。
 * Filters accepted by `listApiErrors`.
 */
export interface ListApiErrorsFilters {
  status?: ApiErrorStatus;
  severity?: ApiErrorSeverity;
  limit?: number;
  offset?: number;
}

/**
 * 数値を [lo, hi] にクリップする。
 * Clamps a numeric value between `lo` and `hi`.
 */
function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(n, lo), hi);
}

/**
 * `api_errors` を最終観測時刻の降順で一覧する。
 * `total` は同一フィルタ条件での件数（ページネーション用）。
 *
 * List `api_errors` rows ordered by `last_seen_at` descending. `total` is the
 * count under the same filter clause for pagination.
 */
export async function listApiErrors(
  db: Database,
  filters: ListApiErrorsFilters,
): Promise<{ rows: ApiError[]; total: number }> {
  const limit = clamp(
    Number(filters.limit ?? API_ERROR_LIST_DEFAULT_LIMIT),
    1,
    API_ERROR_LIST_MAX_LIMIT,
  );
  const offset = clamp(Number(filters.offset ?? 0), 0, Number.MAX_SAFE_INTEGER);

  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(apiErrors.status, filters.status));
  if (filters.severity) conditions.push(eq(apiErrors.severity, filters.severity));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rowsQuery = db
    .select()
    .from(apiErrors)
    .orderBy(desc(apiErrors.lastSeenAt), desc(apiErrors.id))
    .limit(limit)
    .offset(offset);
  const rows = await (whereClause ? rowsQuery.where(whereClause) : rowsQuery);

  const countQuery = db.select({ count: sql<number>`cast(count(*) as integer)` }).from(apiErrors);
  const [countRow] = await (whereClause ? countQuery.where(whereClause) : countQuery);

  return { rows, total: countRow?.count ?? 0 };
}

/**
 * ID で 1 件取得する。見つからなければ `null`。
 * Fetch a single row by primary key; returns `null` when not found.
 */
export async function getApiErrorById(db: Database, id: string): Promise<ApiError | null> {
  const [row] = await db.select().from(apiErrors).where(eq(apiErrors.id, id)).limit(1);
  return row ?? null;
}

/**
 * Sentry の issue ID で 1 件取得する。Webhook 経路で再来判定に使う。
 * Fetch by Sentry issue id; used by the webhook handler to detect recurrences.
 */
export async function getApiErrorBySentryIssueId(
  db: Database,
  sentryIssueId: string,
): Promise<ApiError | null> {
  const [row] = await db
    .select()
    .from(apiErrors)
    .where(eq(apiErrors.sentryIssueId, sentryIssueId))
    .limit(1);
  return row ?? null;
}

/**
 * `updateApiErrorStatus` の入力。
 * Input shape for `updateApiErrorStatus`.
 */
export interface UpdateApiErrorStatusInput {
  id: string;
  nextStatus: ApiErrorStatus;
}

/**
 * `updateApiErrorStatus` が並行更新と衝突したときに投げるエラー。
 * Thrown by `updateApiErrorStatus` when a concurrent write changed the row's
 * status between the read and the conditional UPDATE.
 *
 * 呼び出し側（admin ルート）は HTTP 409 Conflict にマップすることを想定する。
 * Callers (e.g. the admin route) are expected to map this to HTTP 409.
 */
export class ApiErrorStatusConflictError extends Error {
  /**
   * 衝突した行 ID を含むエラーを生成する。
   * Build a conflict error tagged with the row id that lost the race.
   */
  constructor(id: string) {
    super(`api_errors row changed concurrently while updating status: ${id}`);
    this.name = "ApiErrorStatusConflictError";
  }
}

/**
 * ワークフロー状態を更新する。
 *
 * - 対象行が存在しなければ `null` を返す。
 * - 同一 status への遷移は no-op として現在の行をそのまま返す。
 * - 遷移が許可されていない場合は `Error` を投げる（呼び出し側で 400 へ変換）。
 * - 並行更新の検出: UPDATE 述語で「読み取り時点の status」を一致条件にし、
 *   その間に他リクエストが status を変えていた場合は
 *   `ApiErrorStatusConflictError` を投げる（409 にマップ）。
 *
 * Update the workflow status with transition validation.
 *
 * - Returns `null` when the target row does not exist.
 * - Same-state transitions short-circuit to a no-op (returning the unchanged row).
 * - Invalid transitions throw; the caller maps the error to HTTP 400.
 * - Concurrency: the UPDATE WHERE clause includes the previously-read status,
 *   so a competing write that flipped the row in between yields zero rows
 *   and we throw `ApiErrorStatusConflictError` (caller maps to HTTP 409).
 */
export async function updateApiErrorStatus(
  db: Database,
  input: UpdateApiErrorStatusInput,
): Promise<ApiError | null> {
  const current = await getApiErrorById(db, input.id);
  if (!current) return null;
  if (current.status === input.nextStatus) return current;

  assertValidApiErrorStatusTransition(current.status, input.nextStatus);

  const [updated] = await db
    .update(apiErrors)
    .set({
      status: input.nextStatus,
      updatedAt: sql`NOW()`,
    })
    // status を読み取り時点の値に固定して、間に挟まった並行更新を検出する。
    // Pin the WHERE on the read-time status so an interleaved write fails
    // closed (zero rows) instead of silently overwriting.
    .where(and(eq(apiErrors.id, input.id), eq(apiErrors.status, current.status)))
    .returning();

  if (!updated) {
    throw new ApiErrorStatusConflictError(input.id);
  }
  return updated;
}

// 公開はしないがコンパイル時に未使用警告が出ないよう、import を参照しておく。
// Touch types so tsc/eslint don't strip them in `--isolatedModules` builds.
export type { ApiErrorSuspectedFile };
