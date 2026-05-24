/**
 * Wiki Compose session terminal-status persistence helpers.
 *
 * Run / resume handlers must not overwrite a user-initiated `cancelled` row when
 * the graph finishes after DELETE.
 */
import { and, eq } from "drizzle-orm";
import { wikiComposeSessions } from "../schema/wikiComposeSessions.js";
import type { WikiComposeSessionStatus } from "../schema/wikiComposeSessions.js";
import type { AppEnv } from "../types/index.js";

/**
 * 実行中 (`running`) のセッションだけを終端ステータスへ更新する。
 *
 * @returns 行が更新されたら true / `true` when a row was updated.
 */
export async function persistOutcomeIfStillRunning(
  db: AppEnv["Variables"]["db"],
  sessionId: string,
  outcome: {
    status: WikiComposeSessionStatus;
    lastError: string | null;
  },
): Promise<boolean> {
  const [row] = await db
    .update(wikiComposeSessions)
    .set({
      status: outcome.status,
      lastError: outcome.status === "failed" ? outcome.lastError : null,
      closedAt: outcome.status === "interrupted" ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(wikiComposeSessions.id, sessionId), eq(wikiComposeSessions.status, "running")),
    )
    .returning({ id: wikiComposeSessions.id });
  return row !== undefined;
}
