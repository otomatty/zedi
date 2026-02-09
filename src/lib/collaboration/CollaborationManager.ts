/**
 * CollaborationManager
 * Y.jsドキュメントの管理、IndexedDB永続化を担当。
 * mode='collaborative' のときのみ Hocuspocus に WebSocket 接続（C3-5）。
 */

import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import type { UserPresence, ConnectionStatus, CollaborationState } from './types';
import { getUserColor } from './types';

export type CollaborationManagerMode = 'local' | 'collaborative';

export class CollaborationManager {
  private ydoc: Y.Doc;
  private wsProvider: HocuspocusProvider | null = null;
  private idbProvider: IndexeddbPersistence;
  private awareness: Awareness | null = null;
  private pageId: string;
  private userId: string;
  private userName: string;
  private readonly mode: CollaborationManagerMode;
  private listeners: Set<(state: CollaborationState) => void> = new Set();
  private state: CollaborationState;

  constructor(
    pageId: string,
    userId: string,
    userName: string,
    private getAuthToken: () => Promise<string | null>,
    options?: { mode?: CollaborationManagerMode }
  ) {
    this.pageId = pageId;
    this.userId = userId;
    this.userName = userName;
    this.mode = options?.mode ?? 'local';

    this.ydoc = new Y.Doc();

    this.state = {
      status: 'connecting',
      isSynced: false,
      onlineUsers: [],
      pendingChanges: 0,
    };

    // IndexedDB 永続化（常時有効）
    this.idbProvider = new IndexeddbPersistence(
      `zedi-doc-${pageId}`,
      this.ydoc
    );

    this.idbProvider.on('synced', () => {
      console.log('[Collab] IndexedDB synced');
      if (this.mode === 'local') {
        // 個人ページ: WebSocket 接続なし。Y.Doc + y-indexeddb のみ（C3-5）
        this.updateState({ status: 'connected', isSynced: true });
      } else {
        this.connectWebSocket();
      }
    });
  }

  private async connectWebSocket() {
    const token = await this.getAuthToken();
    if (!token) {
      console.warn('[Collab] No auth token, staying offline');
      this.updateState({ status: 'disconnected' });
      return;
    }

    const wsUrl = import.meta.env.VITE_REALTIME_URL || 'ws://localhost:1234';
    const documentName = `page-${this.pageId}`;

    this.wsProvider = new HocuspocusProvider({
      url: wsUrl,
      name: documentName,
      document: this.ydoc,
      token: () => this.getAuthToken(),
      onStatus: ({ status }) => {
        console.log(`[Collab] WebSocket status: ${status}`);
        this.updateState({
          status: status as ConnectionStatus,
        });
      },
      onSynced: ({ state: isSynced }) => {
        console.log(`[Collab] Sync status: ${isSynced}`);
        this.updateState({ isSynced });
      },
    });

    this.awareness = this.wsProvider.awareness ?? null;

    if (this.awareness) {
      this.awareness.on('change', () => {
        this.updatePresence();
      });
      this.setLocalPresence({
      userId: this.userId,
      userName: this.userName,
      userColor: getUserColor(this.userId),
      status: 'active',
      cursor: null,
      selection: null,
      lastActivity: Date.now(),
    });
    }
  }

  /**
   * ローカルプレゼンス情報を設定
   */
  setLocalPresence(presence: Partial<UserPresence>) {
    if (!this.awareness) return;

    const current = this.awareness.getLocalState() || {};
    this.awareness.setLocalState({
      ...current,
      ...presence,
      userId: this.userId,
      lastActivity: Date.now(),
    });
  }

  /**
   * カーソル位置を更新
   */
  updateCursor(anchor: number, head: number) {
    this.setLocalPresence({
      cursor: { anchor, head },
    });
  }

  /**
   * 選択範囲を更新
   */
  updateSelection(from: number, to: number) {
    this.setLocalPresence({
      selection: from === to ? null : { from, to },
    });
  }

  private updatePresence() {
    if (!this.awareness) return;

    const states = this.awareness.getStates();
    const onlineUsers: UserPresence[] = [];

    states.forEach((state, clientId) => {
      if (clientId !== this.awareness!.clientID && state.userId) {
        onlineUsers.push(state as UserPresence);
      }
    });

    this.updateState({ onlineUsers });
  }

  private updateState(partial: Partial<CollaborationState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }

  /**
   * 状態変更を購読
   */
  subscribe(listener: (state: CollaborationState) => void): () => void {
    this.listeners.add(listener);
    // 現在の状態を即座に通知
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Y.Docを取得
   */
  get document(): Y.Doc {
    return this.ydoc;
  }

  /**
   * XmlFragmentを取得（Tiptap用）
   */
  get xmlFragment(): Y.XmlFragment {
    return this.ydoc.getXmlFragment('prosemirror');
  }

  /**
   * Awarenessを取得
   */
  getAwareness(): Awareness | null {
    return this.awareness;
  }

  /**
   * 接続状態を取得
   */
  get isConnected(): boolean {
    return this.state.status === 'connected';
  }

  /**
   * 手動再接続
   */
  reconnect() {
    const websocketProvider = (this.wsProvider as HocuspocusProvider & { configuration?: { websocketProvider?: { connect?: () => Promise<void>; status?: string } } })?.configuration?.websocketProvider;
    if (websocketProvider && websocketProvider.status !== 'connected') {
      websocketProvider.connect?.();
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    // プレゼンスをクリア
    if (this.awareness) {
      this.awareness.setLocalState(null);
    }

    // 接続を閉じる
    this.wsProvider?.destroy();
    this.idbProvider.destroy();
    this.ydoc.destroy();

    this.listeners.clear();
  }
}
