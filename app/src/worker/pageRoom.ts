import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { extractPlainText, toPreview } from "./realtime/plainText";
import { ROLE_HEADER } from "./realtime/authorize";

type ConnectionState = { readOnly: boolean };

/**
 * One Durable Object per page: holds the Y.js document, syncs editors over hibernatable
 * WebSockets, persists to its own SQLite and projects plain text back to D1 for search.
 * ページごとの Durable Object。Y.js 文書を同期・保存し、検索用にプレーンテキストを D1 へ書き戻す。
 */
export class PageRoom extends YServer {
  static options = { hibernate: true };
  static callbackOptions = { debounceWait: 2_000, debounceMaxWait: 10_000 };

  /** Remembers whether the connection may write (role set by the Worker's authorization). */
  onConnect(connection: Connection<ConnectionState>, ctx: ConnectionContext): void | Promise<void> {
    connection.setState({ readOnly: ctx.request.headers.get(ROLE_HEADER) === "viewer" });
    return super.onConnect(connection, ctx);
  }

  /** Viewers receive updates but their document changes are ignored. */
  isReadOnly(connection: Connection<ConnectionState>): boolean {
    return connection.state?.readOnly ?? true;
  }

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

  /** Persists the merged state and updates the page's searchable text in D1 (debounced). */
  async onSave(): Promise<void> {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO ydoc (id, state) VALUES (1, ?)",
      Y.encodeStateAsUpdate(this.document),
    );
    const text = extractPlainText(this.document);
    await this.env.DB.prepare(
      "UPDATE pages SET content_text = ?1, preview = ?2, updated_at = ?3 WHERE id = ?4 AND content_text <> ?1",
    )
      .bind(text, toPreview(text), Date.now(), this.name)
      .run();
  }
}
