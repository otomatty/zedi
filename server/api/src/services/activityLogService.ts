/**
 * Service helpers for the `activity_log` table (P4, otomatty/zedi#598).
 *
 * `recordActivity` is the write-path used by ingest / lint / chat→wiki / wiki
 * generation / index build. It deliberately swallows errors — logging must
 * never break the feature it is observing.
 *
 * `list*` helpers back the admin ActivityLog page. They enforce a hard limit
 * to prevent accidental large scans.
 *
 * `activity_log` テーブルの書き込み・読み出しヘルパ。
 * `recordActivity` は ingest・lint・chat 昇格・wiki 生成・index 構築から
 * 呼び出される。ログの失敗が元機能を壊さないよう意図的に try/catch する。
 * `list*` は管理画面の ActivityLog ページで利用する。
 */
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { activityLog } from "../schema/activityLog.js";
import type {
  ActivityActor,
  ActivityKind,
  ActivityLog,
  NewActivityLog,
} from "../schema/activityLog.js";
import type { Database } from "../types/index.js";

/**
 * Arguments required to record a single activity.
 * 1 件の行動を記録するための引数。
 */
export interface RecordActivityInput {
  /** Owner of the activity (user id). / 対象ユーザー ID */
  ownerId: string;
  /** Activity kind. / 活動種別 */
  kind: ActivityKind;
  /** Who initiated the activity. / 起点 */
  actor: ActivityActor;
  /** Related page IDs (empty array is fine). / 関連ページ ID（0 件可） */
  targetPageIds?: string[];
  /** Arbitrary JSON detail payload. / 詳細 JSON */
  detail?: Record<string, unknown>;
}

/**
 * Inserts one activity log row.
 *
 * Does NOT throw on DB failure — logging is a side-concern; swallowing errors
 * prevents the observed feature (e.g. ingest) from being interrupted.
 * A `console.error` is emitted so ops can still notice silent failures.
 *
 * 1 件の活動を記録する。
 * DB 書き込み失敗でも throw しない（本処理を巻き込まない）。失敗時は
 * `console.error` で検知できるようにする。
 *
 * @param db - データベース接続 / Database connection
 * @param input - 記録内容 / Record payload
 * @returns 挿入された行（失敗時は null）/ Inserted row, or null on failure
 */
export async function recordActivity(
  db: Database,
  input: RecordActivityInput,
): Promise<ActivityLog | null> {
  try {
    const values: NewActivityLog = {
      ownerId: input.ownerId,
      kind: input.kind,
      actor: input.actor,
      targetPageIds: input.targetPageIds ?? [],
      detail: input.detail ?? null,
    };
    const [inserted] = await db.insert(activityLog).values(values).returning();
    return inserted ?? null;
  } catch (err) {
    // Logging the logger is a non-fatal concern; surface but don't re-throw.
    // ロガー側の失敗は非致命的。console.error で見えるようにしつつ伝播させない。
    console.error("recordActivity failed (non-fatal)", err);
    return null;
  }
}

/** Default page size for list queries. / 一覧取得のデフォルト件数 */
export const ACTIVITY_LIST_DEFAULT_LIMIT = 50;
/** Maximum page size for list queries. / 一覧取得の最大件数 */
export const ACTIVITY_LIST_MAX_LIMIT = 200;

/**
 * Filters for listing activity entries.
 * 活動ログ一覧取得のフィルタ。
 */
export interface ListActivityFilters {
  kind?: ActivityKind;
  actor?: ActivityActor;
  /** Inclusive lower bound on createdAt. / createdAt の下限（含む） */
  from?: Date;
  /** Inclusive upper bound on createdAt. / createdAt の上限（含む） */
  to?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Clamps a numeric value between lo and hi.
 * 数値を [lo, hi] にクリップする。
 */
function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Lists activity entries for a user, newest first.
 *
 * ユーザーの活動ログを新しい順に取得する。
 *
 * @param db - データベース接続 / Database connection
 * @param ownerId - 対象ユーザー ID / Owner user ID
 * @param filters - 絞り込み条件 / Filters
 * @returns 件数と行配列 / Count + rows
 */
export async function listActivityForOwner(
  db: Database,
  ownerId: string,
  filters: ListActivityFilters = {},
): Promise<{ rows: ActivityLog[]; total: number }> {
  const limit = clamp(
    Number(filters.limit ?? ACTIVITY_LIST_DEFAULT_LIMIT),
    1,
    ACTIVITY_LIST_MAX_LIMIT,
  );
  const offset = clamp(Number(filters.offset ?? 0), 0, Number.MAX_SAFE_INTEGER);

  const conditions: SQL[] = [eq(activityLog.ownerId, ownerId)];
  if (filters.kind) conditions.push(eq(activityLog.kind, filters.kind));
  if (filters.actor) conditions.push(eq(activityLog.actor, filters.actor));
  if (filters.from) conditions.push(gte(activityLog.createdAt, filters.from));
  if (filters.to) conditions.push(lte(activityLog.createdAt, filters.to));

  const whereClause = and(...conditions);

  const rows = await db
    .select()
    .from(activityLog)
    .where(whereClause)
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(activityLog)
    .where(whereClause);

  return { rows, total: countRow?.count ?? 0 };
}
