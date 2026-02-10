/**
 * CollaborationManager
 * Y.jsドキュメントの管理、IndexedDB永続化を担当。
 * mode='local': 個人ページ。y-indexeddb + Aurora API で Y.Doc を同期。WebSocket なし。
 * mode='collaborative': 共有ノート内ページ。Hocuspocus WebSocket 経由でリアルタイム同期。
 */

import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import type { UserPresence, ConnectionStatus, CollaborationState } from './types';
import { getUserColor } from './types';

export type CollaborationManagerMode = 'local' | 'collaborative';

/** Debounce timer for saving Y.Doc to Aurora in local mode. */
const AURORA_SAVE_DEBOUNCE_MS = 2000;

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
  private destroyed = false;
  /** Timer for debounced Aurora save (local mode only). */
  private auroraSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether initial Aurora fetch has completed (local mode). */
  private auroraFetched = false;

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
        // 個人ページ: IndexedDB synced 後に Aurora から最新 Y.Doc を fetch してマージ
        this.fetchAndMergeFromAurora();
      } else {
        this.connectWebSocket();
      }
    });
  }

  /**
   * Aurora API から Y.Doc を取得してローカル Y.Doc にマージする（local モード用）。
   * マージ後、Y.Doc の変更監視を開始する。
   */
  private async fetchAndMergeFromAurora(): Promise<void> {
    try {
      const token = await this.getAuthToken();
      if (!token || this.destroyed) {
        console.log('[Collab] No auth token, local-only mode');
        this.updateState({ status: 'connected', isSynced: true });
        this.startLocalObserver();
        return;
      }

      const baseUrl = (import.meta.env.VITE_ZEDI_API_BASE_URL as string) ?? '';
      const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
      const url = `${origin}/api/pages/${encodeURIComponent(this.pageId)}/content`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (this.destroyed) return;

      if (res.ok) {
        const data = await res.json() as { ok?: boolean; data?: { ydoc_state?: string }; ydoc_state?: string };
        const envelope = data?.ok === true && data?.data ? data.data : data;
        const b64 = envelope?.ydoc_state;
        if (b64 && typeof b64 === 'string') {
          const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          if (binary.length > 2) {
            Y.applyUpdate(this.ydoc, binary);
            console.log(`[Collab] Merged Aurora Y.Doc (${binary.length} bytes) into local`);
          }
        }
      } else if (res.status === 404) {
        console.log('[Collab] No content in Aurora yet (404)');
      } else {
        console.warn(`[Collab] Aurora content fetch failed: ${res.status}`);
      }
    } catch (err) {
      console.warn('[Collab] Aurora content fetch error:', err);
    }

    this.auroraFetched = true;
    this.updateState({ status: 'connected', isSynced: true });
    this.startLocalObserver();
  }

  /**
   * Y.Doc の変更を監視し、debounce して Aurora へ保存する（local モード用）。
   */
  private startLocalObserver(): void {
    this.ydoc.on('update', () => {
      if (this.destroyed || this.mode !== 'local') return;
      this.scheduleSaveToAurora();
    });
  }

  /**
   * Debounced save to Aurora via PUT /api/pages/:id/content.
   */
  private scheduleSaveToAurora(): void {
    if (this.auroraSaveTimer) clearTimeout(this.auroraSaveTimer);
    this.auroraSaveTimer = setTimeout(() => {
      this.saveToAurora();
    }, AURORA_SAVE_DEBOUNCE_MS);
  }

  private async saveToAurora(): Promise<void> {
    if (this.destroyed) return;
    try {
      const token = await this.getAuthToken();
      if (!token || this.destroyed) return;

      const state = Y.encodeStateAsUpdate(this.ydoc);
      if (state.length <= 2) return; // empty Y.Doc

      // Base64 encode
      let b64 = '';
      const chunkSize = 8192;
      for (let i = 0; i < state.length; i += chunkSize) {
        b64 += String.fromCharCode(...state.subarray(i, i + chunkSize));
      }
      b64 = btoa(b64);

      // Extract plain text for content_text (for full-text search)
      const fragment = this.ydoc.getXmlFragment('default');
      const contentText = fragment.toJSON() ? this.extractText(fragment) : '';

      const baseUrl = (import.meta.env.VITE_ZEDI_API_BASE_URL as string) ?? '';
      const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
      const url = `${origin}/api/pages/${encodeURIComponent(this.pageId)}/content`;

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ydoc_state: b64,
          content_text: contentText,
        }),
      });

      if (this.destroyed) return;
      if (res.ok) {
        console.log(`[Collab] Saved Y.Doc to Aurora (${state.length} bytes)`);
      } else {
        console.warn(`[Collab] Aurora save failed: ${res.status}`);
      }
    } catch (err) {
      console.warn('[Collab] Aurora save error:', err);
    }
  }

  /**
   * XmlFragment からプレーンテキストを抽出
   */
  private extractText(fragment: Y.XmlFragment): string {
    const parts: string[] = [];
    const walk = (node: Y.XmlFragment | Y.XmlElement | Y.XmlText) => {
      if (node instanceof Y.XmlText) {
        parts.push(node.toJSON());
      } else {
        for (const child of node.toArray()) {
          if (child instanceof Y.XmlText || child instanceof Y.XmlElement || child instanceof Y.XmlFragment) {
            walk(child);
          }
        }
      }
    };
    walk(fragment);
    return parts.join('\n').trim();
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
    return this.ydoc.getXmlFragment('default');
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
    this.destroyed = true;

    // Aurora save タイマーをキャンセル
    if (this.auroraSaveTimer) {
      clearTimeout(this.auroraSaveTimer);
      this.auroraSaveTimer = null;
    }

    // 最終保存（同期的にタイマーなしで呼び出し）
    if (this.mode === 'local' && this.auroraFetched) {
      this.destroyed = false; // saveToAurora のガードを一時的に解除
      this.saveToAurora();
      this.destroyed = true;
    }

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
