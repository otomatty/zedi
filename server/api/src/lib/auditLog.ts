/**
 * 管理操作の監査ログヘルパー。
 * Audit-log helper for administrative actions.
 *
 * - `recordAuditLog` は `admin_audit_logs` に 1 行追加するだけの薄いラッパー。
 *   呼び出し元は必ずトランザクション（`db.transaction(async (tx) => ...)` で
 *   得られる `tx`）に対して呼び出すこと。これにより本体の変更と監査ログが
 *   原子的にコミット/ロールバックされる。
 * - `extractClientIp` はプロキシ経由（Railway 等）を想定し、`x-forwarded-for`
 *   の最左値を返す。取得できない場合は `x-real-ip`、それもなければ null。
 *
 * `recordAuditLog` is a thin wrapper that inserts a single row into
 * `admin_audit_logs`. Callers MUST pass the transaction scoped client
 * (the `tx` given by `db.transaction(async (tx) => ...)`) so the audit
 * record is committed/rolled back atomically with the underlying change.
 *
 * `extractClientIp` returns the leftmost IP in `x-forwarded-for`
 * (proxy-aware), falling back to `x-real-ip`, otherwise `null`.
 */
import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { adminAuditLogs } from "../schema/auditLogs.js";
import type { AppEnv, Database } from "../types/index.js";

/**
 * Parameters accepted by {@link recordAuditLog}.
 * {@link recordAuditLog} が受け取るパラメータ。
 */
export interface RecordAuditLogParams {
  /** Action identifier, e.g. `"user.role.update"`. */
  action: string;
  /** Target entity type, e.g. `"user"`. */
  targetType: string;
  /** Target entity id. May be null for list-style operations. */
  targetId?: string | null;
  /** Snapshot of the target before the change. */
  before?: Record<string, unknown> | null;
  /** Snapshot of the target after the change. */
  after?: Record<string, unknown> | null;
}

/**
 * x-forwarded-for ヘッダ（プロキシ経由）から最も左の IP を取得する。
 * Extract the leftmost IP from `x-forwarded-for` (proxy-aware), falling back
 * to `x-real-ip`, then `null`.
 *
 * @param c - Hono Context
 * @returns Client IP string or null
 */
export function extractClientIp(c: Context<AppEnv>): string | null {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = c.req.header("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * 管理操作を `admin_audit_logs` に 1 行記録する。
 * Record a single administrative action into `admin_audit_logs`.
 *
 * 呼び出し元は `db.transaction` 内の `tx` を渡すことを推奨する。
 * Callers should pass a transaction-scoped client so the insert commits
 * atomically with the underlying mutation.
 *
 * @param c - Hono Context (used to read actor and request headers)
 * @param db - Drizzle database or transaction client
 * @param params - Audit log fields
 * @throws Error when no authenticated user is set on the context
 */
export async function recordAuditLog(
  c: Context<AppEnv>,
  db: Database,
  params: RecordAuditLogParams,
): Promise<void> {
  const actorUserId = c.get("userId");
  if (!actorUserId) {
    throw new Error("recordAuditLog requires an authenticated user (c.get('userId') is empty)");
  }

  const ipAddress = extractClientIp(c);
  const userAgentHeader = c.req.header("user-agent");
  const userAgent = userAgentHeader && userAgentHeader.length > 0 ? userAgentHeader : null;

  await db.insert(adminAuditLogs).values({
    id: randomUUID(),
    actorUserId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
    ipAddress,
    userAgent,
  });
}
