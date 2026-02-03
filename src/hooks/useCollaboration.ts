/**
 * useCollaboration hook
 * CollaborationManagerをReactで使用するためのカスタムフック
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { CollaborationManager } from '@/lib/collaboration/CollaborationManager';
import type { CollaborationState, UseCollaborationOptions, UseCollaborationReturn } from '@/lib/collaboration/types';
import { getUserColor } from '@/lib/collaboration/types';
import { useAuth, useUser } from '@/hooks/useAuth';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

const initialState: CollaborationState = {
  status: 'connecting',
  isSynced: false,
  onlineUsers: [],
  pendingChanges: 0,
};

/**
 * リアルタイムコラボレーション機能を提供するフック
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
}: UseCollaborationOptions): UseCollaborationReturn {
  const { userId, getToken, isSignedIn } = useAuth();
  const { user } = useUser();
  const [state, setState] = useState<CollaborationState>(initialState);
  const managerRef = useRef<CollaborationManager | null>(null);

  // Manager初期化
  useEffect(() => {
    if (!enabled || !pageId || !userId || !isSignedIn) {
      setState(prev => ({ ...prev, status: 'disconnected' }));
      return;
    }

    const userName = user?.fullName || user?.firstName || 'Anonymous';

    const manager = new CollaborationManager(
      pageId,
      userId,
      userName,
      async () => {
        try {
          const token = await getToken();
          return token;
        } catch (error) {
          console.error('[useCollaboration] Failed to get token:', error);
          return null;
        }
      }
    );

    managerRef.current = manager;

    const unsubscribe = manager.subscribe((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
      manager.destroy();
      managerRef.current = null;
    };
  }, [pageId, userId, enabled, getToken, isSignedIn, user?.fullName, user?.firstName]);

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

  const collaborationUser =
    enabled && userId && user
      ? {
          name: user.fullName || user.firstName || 'Anonymous',
          color: getUserColor(userId),
        }
      : undefined;

  return {
    ...state,
    ydoc: managerRef.current?.document,
    xmlFragment: managerRef.current?.xmlFragment,
    awareness: managerRef.current?.getAwareness() ?? undefined,
    collaborationUser,
    updateCursor,
    updateSelection,
    reconnect,
  };
}
