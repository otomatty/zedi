/**
 * スナップショット自動保存ユーティリティ（hocuspocus 用）
 * Auto-snapshot utility for the hocuspocus server.
 *
 * ⚠️ API 側にも同様のスナップショット作成ロジックがあります:
 *   - server/api/src/services/snapshotService.ts
 * 定数やpruning SQLを変更する場合は、必ず両方を同時に更新してください。
 *
 * ⚠️ A similar snapshot creation logic exists on the API side:
 *   - server/api/src/services/snapshotService.ts
 * When changing constants or pruning SQL, always update both files.
 */
import type { PoolClient } from "pg";

/**
 * スナップショット取得間隔（ミリ秒）/ Snapshot interval in ms (10 minutes)
 *
 * ⚠️ server/api/src/constants.ts にも同じ値が定義されています。変更時は両方を更新してください。
 * ⚠️ The same value is defined in server/api/src/constants.ts. Update both when changing.
 */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

/**
 * スナップショット保持上限 / Maximum snapshots per page
 *
 * ⚠️ server/api/src/constants.ts にも同じ値が定義されています。変更時は両方を更新してください。
 * ⚠️ The same value is defined in server/api/src/constants.ts. Update both when changing.
 */
export const MAX_SNAPSHOTS_PER_PAGE = 100;

/**
 * 前回スナップショットから一定時間経過していればスナップショットを保存する。
 * Takes a snapshot if enough time has elapsed since the last one.
 *
 * hocuspocus 経由のスナップショットは `created_by` が NULL になる。
 * `created_by IS NULL` は hocuspocus（サーバー）による自動保存を意味する。
 *
 * Snapshots created via hocuspocus have `created_by = NULL`.
 * `created_by IS NULL` indicates an auto-save by the hocuspocus server.
 *
 * ⚠️ API 側にも同様のロジックがあります（server/api/src/services/snapshotService.ts）。
 *   インターバル判定や pruning SQL を変更する場合は両方を更新してください。
 * ⚠️ A similar logic exists on the API side (server/api/src/services/snapshotService.ts).
 *   When changing interval checks or pruning SQL, update both.
 */
export async function maybeCreateSnapshot(
  client: PoolClient,
  pageId: string,
  encodedState: Buffer,
  contentText: string,
): Promise<void> {
  const lastSnap = await client.query<{ created_at: Date }>(
    `SELECT created_at FROM page_snapshots
     WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [pageId],
  );

  const now = Date.now();
  const shouldSnapshot =
    !lastSnap.rows[0] ||
    now - new Date(lastSnap.rows[0].created_at).getTime() >= SNAPSHOT_INTERVAL_MS;

  if (!shouldSnapshot) return;

  // 現在の version を取得
  const versionResult = await client.query<{ version: string }>(
    `SELECT version FROM page_contents WHERE page_id = $1 LIMIT 1`,
    [pageId],
  );
  const version = versionResult.rows[0] ? Number(versionResult.rows[0].version) : 1;

  await client.query(
    `INSERT INTO page_snapshots (page_id, version, ydoc_state, content_text, trigger, created_at)
     VALUES ($1, $2, $3, $4, 'auto', NOW())`,
    [pageId, version, encodedState, contentText],
  );

  // 100件超過分を削除 / Prune snapshots exceeding the limit
  await client.query(
    `DELETE FROM page_snapshots WHERE id IN (
       SELECT id FROM page_snapshots WHERE page_id = $1
       ORDER BY created_at DESC OFFSET $2
     )`,
    [pageId, MAX_SNAPSHOTS_PER_PAGE],
  );
}
