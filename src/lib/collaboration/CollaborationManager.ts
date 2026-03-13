/**
 * CollaborationManager
 * Y.jsドキュメントの管理、IndexedDB永続化を担当。
 * mode='local': 個人ページ。y-indexeddb + REST API で Y.Doc を同期。WebSocket なし。
 * mode='collaborative': 共有ノート内ページ。Hocuspocus WebSocket 経由でリアルタイム同期。
 */

import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import type { UserPresence, ConnectionStatus, CollaborationState } from "./types";
import { getUserColor } from "./types";

export type CollaborationManagerMode = "local" | "collaborative";

/** Debounce timer for saving Y.Doc to API in local mode. */
const API_SAVE_DEBOUNCE_MS = 2000;

/** 二重化検知: マージ後テキストがこの倍率を超えて増加したら二重化とみなす */
const DUPLICATION_RATIO_THRESHOLD = 1.5;

/** ブラウザの keepalive ペイロード制限（64 KiB）より少し小さい安全な上限（バイト） */
const KEEPALIVE_PAYLOAD_LIMIT = 63 * 1024;

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
  /** Timer for debounced API save (local mode only). */
  private apiSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether initial API fetch has completed (local mode). */
  private apiFetched = false;

  constructor(
    pageId: string,
    userId: string,
    userName: string,
    private getAuthToken: () => Promise<string | null>,
    options?: { mode?: CollaborationManagerMode },
  ) {
    this.pageId = pageId;
    this.userId = userId;
    this.userName = userName;
    this.mode = options?.mode ?? "local";

    this.ydoc = new Y.Doc();

    this.state = {
      status: "connecting",
      isSynced: false,
      onlineUsers: [],
      pendingChanges: 0,
    };

    // IndexedDB 永続化（常時有効）
    this.idbProvider = new IndexeddbPersistence(`zedi-doc-${pageId}`, this.ydoc);

    this.idbProvider.on("synced", () => {
      if (this.mode === "local") {
        // 個人ページ: IndexedDB synced 後に API から最新 Y.Doc を fetch してマージ
        this.fetchAndMergeFromApi();
      } else {
        this.connectWebSocket();
      }
    });
  }

  /**
   * REST API から Y.Doc を取得してローカル Y.Doc にマージする（local モード用）。
   * マージ後、Y.Doc の変更監視を開始する。
   */
  private async fetchAndMergeFromApi(): Promise<void> {
    try {
      if (this.destroyed) return;

      const baseUrl = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
      const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
      const url = `${origin}/api/pages/${encodeURIComponent(this.pageId)}/content`;

      const beforeText = this.getPlainText();

      const res = await fetch(url, {
        credentials: "include",
      });

      if (this.destroyed) return;

      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          data?: { ydoc_state?: string };
          ydoc_state?: string;
        };
        const envelope = data?.ok === true && data?.data ? data.data : data;
        const b64 = envelope?.ydoc_state;
        if (b64 && typeof b64 === "string") {
          const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          if (binary.length > 2) {
            Y.applyUpdate(this.ydoc, binary);
            this.detectContentDuplication(beforeText, "api-merge");
          }
        }
      } else if (res.status === 401) {
        // 未認証の場合はローカルのみで続行
      } else if (res.status === 404) {
        // コンテンツ未保存のページでは 404 は想定内。エラー扱いしない。
      } else {
        console.warn(`[Collab] API content fetch failed: ${res.status}`);
      }
    } catch (err) {
      console.warn("[Collab] API content fetch error:", err);
    }

    this.apiFetched = true;
    this.updateState({ status: "connected", isSynced: true });
    this.startLocalObserver();
  }

  /**
   * Y.Doc の変更を監視し、debounce して API へ保存する（local モード用）。
   */
  private startLocalObserver(): void {
    this.ydoc.on("update", () => {
      if (this.destroyed || this.mode !== "local") return;
      this.scheduleSaveToApi();
    });
  }

  /**
   * Debounced save via PUT /api/pages/:id/content.
   */
  private scheduleSaveToApi(): void {
    if (this.apiSaveTimer) clearTimeout(this.apiSaveTimer);
    this.apiSaveTimer = setTimeout(() => {
      this.saveToApi();
    }, API_SAVE_DEBOUNCE_MS);
  }

  /**
   * Cancel debounce and save immediately (e.g. after applying URL-clip initial content).
   * No-op in collaborative mode or when destroyed.
   */
  flushSave(): void {
    if (this.destroyed || this.mode !== "local") return;
    if (this.apiSaveTimer) {
      clearTimeout(this.apiSaveTimer);
      this.apiSaveTimer = null;
    }
    void this.saveToApi();
  }

  private async saveToApi(): Promise<void> {
    if (this.destroyed) return;
    try {
      const state = Y.encodeStateAsUpdate(this.ydoc);
      if (state.length <= 2) return; // empty Y.Doc

      // Base64 encode
      let b64 = "";
      const chunkSize = 8192;
      for (let i = 0; i < state.length; i += chunkSize) {
        b64 += String.fromCharCode(...state.subarray(i, i + chunkSize));
      }
      b64 = btoa(b64);

      const fragment = this.ydoc.getXmlFragment("default");
      const contentText = fragment.toJSON() ? this.extractText(fragment) : "";

      const baseUrl = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
      const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
      const url = `${origin}/api/pages/${encodeURIComponent(this.pageId)}/content`;

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          ydoc_state: b64,
          content_text: contentText, // 全文検索用プレーンテキスト
        }),
      });

      if (this.destroyed) return;
      if (!res.ok) {
        console.warn(`[Collab] API save failed: ${res.status}`);
      }
    } catch (err) {
      console.warn("[Collab] API save error:", err);
    }
  }

  /**
   * Y.Doc のプレーンテキストを取得するヘルパー
   */
  private getPlainText(): string {
    return this.extractText(this.ydoc.getXmlFragment("default"));
  }

  /**
   * コンテンツの二重化を検知する。
   * マージ前後のテキストを比較し、不自然な増加があれば console.error で報告する。
   */
  private detectContentDuplication(beforeText: string, phase: string): void {
    const afterText = this.getPlainText();
    if (beforeText.length < 10) return;
    if (afterText.length <= beforeText.length) return;

    const ratio = afterText.length / beforeText.length;
    if (ratio < DUPLICATION_RATIO_THRESHOLD) return;

    const occurrences = afterText.split(beforeText).length - 1;
    if (occurrences < 2) return;

    console.error(
      `[Collab] Content duplication detected after ${phase} (page: ${this.pageId.slice(0, 8)})`,
      {
        beforeLength: beforeText.length,
        afterLength: afterText.length,
        ratio: ratio.toFixed(2),
      },
    );
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
          if (
            child instanceof Y.XmlText ||
            child instanceof Y.XmlElement ||
            child instanceof Y.XmlFragment
          ) {
            walk(child);
          }
        }
      }
    };
    walk(fragment);
    return parts.join("\n").trim();
  }

  private async connectWebSocket() {
    const token = await this.getAuthToken();
    if (!token) {
      console.warn("[Collab] No auth token, staying offline");
      this.updateState({ status: "disconnected" });
      return;
    }

    const wsUrl = import.meta.env.VITE_REALTIME_URL || "ws://localhost:1234";
    const documentName = `page-${this.pageId}`;

    this.wsProvider = new HocuspocusProvider({
      url: wsUrl,
      name: documentName,
      document: this.ydoc,
      token: () => this.getAuthToken(),
      onStatus: ({ status }) => {
        this.updateState({
          status: status as ConnectionStatus,
        });
      },
      onSynced: ({ state: isSynced }) => {
        this.updateState({ isSynced });
      },
    });

    this.awareness = this.wsProvider.awareness ?? null;

    if (this.awareness) {
      this.awareness.on("change", () => {
        this.updatePresence();
      });
      this.setLocalPresence({
        userId: this.userId,
        userName: this.userName,
        userColor: getUserColor(this.userId),
        status: "active",
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
      if (clientId !== (this.awareness?.clientID ?? null) && state.userId) {
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
    return this.ydoc.getXmlFragment("default");
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
    return this.state.status === "connected";
  }

  /**
   * 手動再接続
   */
  reconnect() {
    const websocketProvider = (
      this.wsProvider as HocuspocusProvider & {
        configuration?: { websocketProvider?: { connect?: () => Promise<void>; status?: string } };
      }
    )?.configuration?.websocketProvider;
    if (websocketProvider && websocketProvider.status !== "connected") {
      websocketProvider.connect?.();
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.destroyed = true;

    // API save タイマーをキャンセル
    if (this.apiSaveTimer) {
      clearTimeout(this.apiSaveTimer);
      this.apiSaveTimer = null;
    }

    // 最終保存: ydoc 破棄前に同期的にステートをエンコードし、非同期で送信
    if (this.mode === "local" && this.apiFetched) {
      const state = Y.encodeStateAsUpdate(this.ydoc);
      if (state.length > 2) {
        const contentText = this.extractText(this.ydoc.getXmlFragment("default"));
        this.fireAndForgetSave(state, contentText);
      }
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

  /**
   * 破棄後の最終保存。エンコード済みステートを受け取り、ydoc に依存しない。
   * keepalive: true でページ離脱後もリクエストが完了するようにする。
   * ブラウザの keepalive ペイロード制限（約 64 KiB）を超える場合は keepalive なしで送信する。
   */
  private fireAndForgetSave(state: Uint8Array, contentText: string): void {
    let b64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < state.length; i += chunkSize) {
      b64 += String.fromCharCode(...state.subarray(i, i + chunkSize));
    }
    b64 = btoa(b64);

    const body = JSON.stringify({
      ydoc_state: b64,
      content_text: contentText,
    });
    const bodyByteLength =
      typeof TextEncoder !== "undefined" ? new TextEncoder().encode(body).length : body.length * 2;
    const useKeepalive = bodyByteLength <= KEEPALIVE_PAYLOAD_LIMIT;

    const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
    const baseUrl = rawBaseUrl.replace(/\/$/, "");
    const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
    const url = `${origin}/api/pages/${encodeURIComponent(this.pageId)}/content`;

    fetch(url, {
      method: "PUT",
      keepalive: useKeepalive,
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body,
    }).catch(() => {
      // 最終保存の失敗は無視（ページ離脱中のため処理不能）
    });
  }
}
