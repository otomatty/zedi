/**
 * スナップショット自動保存サービス（API 用）
 * Auto-snapshot service for the API server.
 *
 * ⚠️ hocuspocus 側にも同様のスナップショット作成ロジックがあります:
 *   - server/hocuspocus/src/snapshotUtils.ts
 * 定数やpruning SQLを変更する場合は、必ず両方を同時に更新してください。
 *
 * ⚠️ A similar snapshot creation logic exists on the hocuspocus side:
 *   - server/hocuspocus/src/snapshotUtils.ts
 * When changing constants or pruning SQL, always update both files.
 */
import { eq, desc, sql } from "drizzle-orm";
import { pageSnapshots } from "../schema/index.js";
import { SNAPSHOT_INTERVAL_MS, MAX_SNAPSHOTS_PER_PAGE } from "../constants.js";
import type { Database } from "../types/index.js";

/**
 * 前回スナップショットから10分経過していればスナップショットを自動作成する。
 * Creates an auto-snapshot if 10+ minutes have elapsed since the last one.
 *
 * API 経由のスナップショットは `created_by` に userId が設定される。
 * API-created snapshots set `created_by` to the userId.
 *
 * ⚠️ hocuspocus 側にも同様のロジックがあります（server/hocuspocus/src/snapshotUtils.ts）。
 *   インターバル判定や pruning SQL を変更する場合は両方を更新してください。
 * ⚠️ A similar logic exists on the hocuspocus side (server/hocuspocus/src/snapshotUtils.ts).
 *   When changing interval checks or pruning SQL, update both.
 */
export async function maybeCreateSnapshot(
  db: Database,
  pageId: string,
  ydocState: Buffer,
  contentText: string | null,
  version: number,
  userId: string,
): Promise<void> {
  const lastSnap = await db
    .select({ createdAt: pageSnapshots.createdAt })
    .from(pageSnapshots)
    .where(eq(pageSnapshots.pageId, pageId))
    .orderBy(desc(pageSnapshots.createdAt))
    .limit(1);

  const now = Date.now();
  const shouldSnapshot =
    !lastSnap[0] || now - lastSnap[0].createdAt.getTime() >= SNAPSHOT_INTERVAL_MS;

  if (!shouldSnapshot) return;

  await db.insert(pageSnapshots).values({
    pageId,
    version,
    ydocState: ydocState,
    contentText: contentText ?? null,
    createdBy: userId,
    trigger: "auto",
  });

  // 100件超過分を削除 / Prune snapshots exceeding the limit
  await db.execute(
    sql`DELETE FROM page_snapshots WHERE id IN (
      SELECT id FROM page_snapshots WHERE page_id = ${pageId}
      ORDER BY created_at DESC OFFSET ${MAX_SNAPSHOTS_PER_PAGE}
    )`,
  );
}
