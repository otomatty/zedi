/**
 * サーバー共通定数
 * Shared server-side constants
 */

/**
 * スナップショット取得間隔（ミリ秒）/ Snapshot interval in ms (10 minutes)
 *
 * ⚠️ server/hocuspocus/src/snapshotUtils.ts にも同じ値が定義されています。変更時は両方を更新してください。
 * ⚠️ The same value is defined in server/hocuspocus/src/snapshotUtils.ts. Update both when changing.
 */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

/**
 * スナップショット保持上限 / Maximum snapshots per page
 *
 * ⚠️ server/hocuspocus/src/snapshotUtils.ts にも同じ値が定義されています。変更時は両方を更新してください。
 * ⚠️ The same value is defined in server/hocuspocus/src/snapshotUtils.ts. Update both when changing.
 */
export const MAX_SNAPSHOTS_PER_PAGE = 100;
