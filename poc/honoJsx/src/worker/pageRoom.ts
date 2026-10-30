import { YServer } from "y-partyserver";
import * as Y from "yjs";

/**
 * One Durable Object per page: holds the Y.js document, syncs connected editors over
 * hibernatable WebSockets and persists the merged state in the object's SQLite storage.
 * ページごとの Durable Object。Y.js 文書を保持し、Hibernation 対応 WebSocket で同期して
 * DO 内蔵 SQLite に保存する（Hocuspocus + Postgres の置き換え候補）。
 */
export class PageRoom extends YServer {
  static options = { hibernate: true };
  static callbackOptions = { debounceWait: 2_000, debounceMaxWait: 10_000 };

  /** Restores the persisted document when the object starts (also after hibernation). */
  async onLoad(): Promise<void> {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS ydoc (id INTEGER PRIMARY KEY, state BLOB NOT NULL)",
    );
    const row = this.ctx.storage.sql
      .exec<{ state: ArrayBuffer }>("SELECT state FROM ydoc WHERE id = 1")
      .toArray()[0];
    if (row) Y.applyUpdate(this.document, new Uint8Array(row.state));
  }

  /** Persists the merged state; y-partyserver debounces calls per `callbackOptions`. */
  async onSave(): Promise<void> {
    const state = Y.encodeStateAsUpdate(this.document);
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO ydoc (id, state) VALUES (1, ?)", state);
  }
}
