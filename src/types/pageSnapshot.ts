/**
 * ページスナップショット（バージョン履歴）の型定義
 * Type definitions for page snapshots (version history)
 */

/** スナップショット一覧用 / Snapshot list item */
export interface PageSnapshot {
  id: string;
  version: number;
  contentText: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  trigger: "auto" | "restore" | "pre-restore";
  createdAt: string;
}

/** スナップショット詳細（Y.Doc 含む）/ Snapshot detail with Y.Doc state */
export interface PageSnapshotDetail extends PageSnapshot {
  ydocState: string; // base64
}
