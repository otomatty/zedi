/**
 * Collaboration related types
 * リアルタイムコラボレーション機能の型定義
 */

/**
 * WebSocket接続状態
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * ユーザーのプレゼンス情報（他ユーザーへ共有される情報）
 */
export interface UserPresence {
  /** ユーザー識別子 */
  userId: string;
  /** 表示名 */
  userName: string;
  /** カーソル色（自動割り当て） */
  userColor: string;
  /** カーソル位置 */
  cursor: {
    anchor: number;
    head: number;
  } | null;
  /** 選択範囲 */
  selection: {
    from: number;
    to: number;
  } | null;
  /** ステータス */
  status: 'active' | 'idle' | 'away';
  /** 最終アクティビティ時刻 */
  lastActivity: number;
}

/**
 * コラボレーション状態
 */
export interface CollaborationState {
  /** 接続状態 */
  status: ConnectionStatus;
  /** サーバーと同期済みか */
  isSynced: boolean;
  /** オンラインユーザー一覧 */
  onlineUsers: UserPresence[];
  /** ローカルの未同期変更数 */
  pendingChanges: number;
}

/**
 * useCollaborationフックのオプション
 */
export interface UseCollaborationOptions {
  /** ページID */
  pageId: string;
  /** コラボレーション機能を有効にするか */
  enabled?: boolean;
}

/**
 * useCollaborationフックの戻り値
 */
export interface UseCollaborationReturn extends CollaborationState {
  /** Y.Docインスタンス */
  ydoc: import('yjs').Doc | undefined;
  /** TiptapのXmlFragment */
  xmlFragment: import('yjs').XmlFragment | undefined;
  /** Awarenessインスタンス */
  awareness: import('y-protocols/awareness').Awareness | undefined;
  /** CollaborationCaret用のユーザー情報（name, color） */
  collaborationUser: { name: string; color: string } | undefined;
  /** カーソル位置を更新 */
  updateCursor: (anchor: number, head: number) => void;
  /** 選択範囲を更新 */
  updateSelection: (from: number, to: number) => void;
  /** 手動再接続 */
  reconnect: () => void;
}

/**
 * ユーザーカラーのプリセット
 * コラボレーションカーソル表示用
 */
export const USER_COLORS = [
  '#f87171', // red-400
  '#fb923c', // orange-400
  '#fbbf24', // amber-400
  '#a3e635', // lime-400
  '#34d399', // emerald-400
  '#22d3ee', // cyan-400
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
  '#818cf8', // indigo-400
] as const;

/**
 * ユーザーIDからカラーを取得
 */
export function getUserColor(userId?: string): string {
  if (!userId) {
    return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  }
  // ユーザーIDのハッシュから色を決定（同じユーザーは常に同じ色）
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}
