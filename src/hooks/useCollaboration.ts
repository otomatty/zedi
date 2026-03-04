/**
 * useCollaboration hook
 * CollaborationManagerをReactで使用するためのカスタムフック
 * 未ログイン時は local-user で IndexedDB のみ使用（API 同期なし）。
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { CollaborationManager } from "@/lib/collaboration/CollaborationManager";
import type {
  CollaborationState,
  UseCollaborationOptions,
  UseCollaborationReturn,
} from "@/lib/collaboration/types";
import { getUserColor } from "@/lib/collaboration/types";
import { useAuth, useUser } from "@/hooks/useAuth";

const LOCAL_USER_ID = "local-user";

const initialState: CollaborationState = {
  status: "connecting",
  isSynced: false,
  onlineUsers: [],
  pendingChanges: 0,
};

const emptyManagerSnapshot: {
  ydoc: UseCollaborationReturn["ydoc"];
  xmlFragment: UseCollaborationReturn["xmlFragment"];
  awareness: UseCollaborationReturn["awareness"];
} = {
  ydoc: undefined,
  xmlFragment: undefined,
  awareness: undefined,
};

/**
 * リアルタイムコラボレーション機能を提供するフック
 * 未ログイン時は effectiveUserId = local-user で Y.Doc + IndexedDB のみ使用。
 *
 * @example
 * ```tsx
 * const { status, isSynced, onlineUsers, ydoc, xmlFragment, awareness } = useCollaboration({
 *   pageId: 'page-123',
 *   enabled: true,
 * });
 * ```
 */
export function useCollaboration({
  pageId,
  enabled = true,
  mode = "local",
}: UseCollaborationOptions): UseCollaborationReturn {
  const { userId, getToken, isSignedIn } = useAuth();
  const { user } = useUser();
  const [state, setState] = useState<CollaborationState>(initialState);
  const [managerSnapshot, setManagerSnapshot] = useState(emptyManagerSnapshot);
  const managerRef = useRef<CollaborationManager | null>(null);

  const effectiveUserId = isSignedIn && userId ? userId : LOCAL_USER_ID;

  // Manager初期化（ゲスト時も local モードで IndexedDB のみ有効）
  useEffect(() => {
    if (!enabled || !pageId) {
      queueMicrotask(() => {
        setState({ ...initialState, status: "disconnected" });
        setManagerSnapshot(emptyManagerSnapshot);
      });
      return;
    }

    const userName = isSignedIn && user ? user.fullName || user.firstName || "Anonymous" : "Guest";

    const manager = new CollaborationManager(
      pageId,
      effectiveUserId,
      userName,
      async () => {
        try {
          const token = await getToken();
          return token;
        } catch (error) {
          console.error("[useCollaboration] Failed to get token:", error);
          return null;
        }
      },
      { mode },
    );

    managerRef.current = manager;
    queueMicrotask(() =>
      setManagerSnapshot({
        ydoc: manager.document,
        xmlFragment: manager.xmlFragment,
        awareness: manager.getAwareness() ?? undefined,
      }),
    );

    const unsubscribe = manager.subscribe((newState) => {
      setState(newState);
      const nextAwareness = manager.getAwareness() ?? undefined;
      setManagerSnapshot((prev) =>
        prev.ydoc === manager.document &&
        prev.xmlFragment === manager.xmlFragment &&
        prev.awareness === nextAwareness
          ? prev
          : {
              ydoc: manager.document,
              xmlFragment: manager.xmlFragment,
              awareness: nextAwareness,
            },
      );
    });

    return () => {
      unsubscribe();
      manager.destroy();
      managerRef.current = null;
      setManagerSnapshot(emptyManagerSnapshot);
    };
  }, [
    pageId,
    effectiveUserId,
    enabled,
    mode,
    getToken,
    isSignedIn,
    user?.fullName,
    user?.firstName,
  ]);

  // カーソル位置更新
  const updateCursor = useCallback((anchor: number, head: number) => {
    managerRef.current?.updateCursor(anchor, head);
  }, []);

  // 選択範囲更新
  const updateSelection = useCallback((from: number, to: number) => {
    managerRef.current?.updateSelection(from, to);
  }, []);

  // 手動再接続
  const reconnect = useCallback(() => {
    managerRef.current?.reconnect();
  }, []);

  // URL 取り込みなどで initialContent 適用後に即時 API 保存する
  const flushSave = useCallback(() => {
    managerRef.current?.flushSave();
  }, []);

  const collaborationUser =
    enabled && effectiveUserId
      ? {
          name: isSignedIn && user ? user.fullName || user.firstName || "Anonymous" : "Guest",
          color: getUserColor(effectiveUserId),
        }
      : undefined;

  return {
    ...state,
    ydoc: managerSnapshot.ydoc,
    xmlFragment: managerSnapshot.xmlFragment,
    awareness: managerSnapshot.awareness,
    collaborationUser,
    updateCursor,
    updateSelection,
    reconnect,
    flushSave,
  };
}
