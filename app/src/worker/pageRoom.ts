import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { extractPlainText, toPreview } from "./realtime/plainText";
import { ROLE_HEADER, USER_HEADER } from "./realtime/authorize";
import { REAUTHORIZE_INTERVAL_MS, planReauthorization } from "./realtime/reauthorize";
import { getPageRoles } from "./services/access";

type ConnectionState = { readOnly: boolean; userId: string | null };

/**
 * One Durable Object per page: holds the Y.js document, syncs editors over hibernatable
 * WebSockets, persists to its own SQLite and projects plain text back to D1 for search.
 * ページごとの Durable Object。Y.js 文書を同期・保存し、検索用にプレーンテキストを D1 へ書き戻す。
 */
export class PageRoom extends YServer {
  static options = { hibernate: true };
  static callbackOptions = { debounceWait: 2_000, debounceMaxWait: 10_000 };

  /**
   * Remembers the verified user and their write permission, then starts checking access.
   * 認証済みユーザーと書き込み権限を保持し、アクセス権の再確認を始める。
   */
  async onConnect(connection: Connection<ConnectionState>, ctx: ConnectionContext): Promise<void> {
    connection.setState({
      readOnly: ctx.request.headers.get(ROLE_HEADER) === "viewer",
      userId: ctx.request.headers.get(USER_HEADER),
    });
    await this.scheduleReauthorization();
    await super.onConnect(connection, ctx);
  }

  /**
   * Rechecks open connections and schedules another check while the room is in use.
   * 接続中のアクセス権を再確認し、接続が残っていれば次の確認を予約する。
   */
  async onAlarm(): Promise<void> {
    const connections = [...this.getConnections<ConnectionState>()];
    if (connections.length === 0) return;

    // PartyServer's connection IDs can be client-supplied. Index this snapshot by socket.
    const snapshot = connections.map((connection, index) => ({
      id: String(index),
      userId: connection.state?.userId ?? null,
      readOnly: this.isReadOnly(connection),
    }));
    const userIds = new Set<string>();
    for (const { userId } of snapshot) {
      if (userId !== null) userIds.add(userId);
    }

    // Retry on the next alarm if D1 is temporarily unavailable, keeping connections intact.
    const roles = await getPageRoles(this.env.DB, this.name, [...userIds]).catch(() => null);
    if (roles) {
      const plan = planReauthorization(snapshot, roles);
      for (const id of plan.close) {
        const connection = connections[Number(id)];
        if (connection?.readyState === WebSocket.OPEN) connection.close(4403, "access revoked");
      }
      for (const { id, readOnly } of plan.setReadOnly) {
        const connection = connections[Number(id)];
        if (connection?.readyState === WebSocket.OPEN && connection.state) {
          connection.setState({ ...connection.state, readOnly });
        }
      }
    }
    if (!this.getConnections()[Symbol.iterator]().next().done) {
      await this.scheduleReauthorization();
    }
  }

  /**
   * Also called when the room wakes for connections established before reauthorization existed.
   * 再認可の導入前から残っている接続のため、部屋が起きたときにも呼ぶ。
   */
  async resumeReauthorization(): Promise<void> {
    let hasCurrentConnection = false;
    for (const connection of this.getConnections<ConnectionState>()) {
      if (typeof connection.state?.userId === "string") {
        hasCurrentConnection = true;
      } else {
        connection.close(4403, "access revoked");
      }
    }
    if (hasCurrentConnection) await this.scheduleReauthorization();
  }

  private async scheduleReauthorization(): Promise<void> {
    const storage = this.ctx.storage;
    if ((await storage.getAlarm()) === null) {
      await storage.setAlarm(Date.now() + REAUTHORIZE_INTERVAL_MS);
    }
  }

  /**
   * Rejects writes without a verified user ID so legacy sockets cannot edit before reauthorization.
   * 旧接続が権限の再確認前に編集できないよう、確認済みのユーザー ID がない接続は読み取り専用にする。
   */
  isReadOnly(connection: Connection<ConnectionState>): boolean {
    const state = connection.state;
    return typeof state?.userId !== "string" || (state.readOnly ?? true);
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
    await this.resumeReauthorization();
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
