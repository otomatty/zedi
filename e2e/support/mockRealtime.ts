/**
 * Hocuspocus WebSocket サーバの最小モック（issue #1036）。
 * SyncStep1 に SyncStep2 を返して onSynced を発火させ、バックエンド無しでも
 * 本文エディタ（.tiptap）をマウントさせる。
 *
 * Minimal mock of the Hocuspocus WebSocket server (issue #1036). Replies to
 * SyncStep1 with SyncStep2 so the client fires onSynced and the body editor
 * (.tiptap) mounts without a real realtime backend.
 *
 * 制約 / Limitations (by design):
 * - docs は WebSocket 接続ごとに空から始まる。リロードやページ再訪をまたぐ
 *   本文の永続性は表現しない（永続化を検証するテストには使えない）。
 *   `docs` starts empty for every WebSocket connection — persistence across
 *   reloads / revisits is NOT modelled (do not use this mock to test it).
 * - awareness メッセージ（presence / カーソル共有）は破棄する。
 *   Awareness messages (presence / shared cursors) are dropped.
 */
import type { Page } from "@playwright/test";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AUTH = 2;
const AUTH_AUTHENTICATED = 2;

/** Hocuspocus サーバの最小モック。SyncStep1 に Step2 を返し onSynced を発火させる。 */
export async function mockRealtime(page: Page): Promise<void> {
  await page.routeWebSocket(/localhost:1234/, (ws) => {
    const docs = new Map<string, Y.Doc>();
    ws.onMessage((message) => {
      if (typeof message === "string") return;
      const data = new Uint8Array(message);
      const decoder = decoding.createDecoder(data);
      const docName = decoding.readVarString(decoder);
      const type = decoding.readVarUint(decoder);
      let doc = docs.get(docName);
      if (!doc) {
        doc = new Y.Doc();
        docs.set(docName, doc);
      }
      if (type === MESSAGE_AUTH) {
        const enc = encoding.createEncoder();
        encoding.writeVarString(enc, docName);
        encoding.writeVarUint(enc, MESSAGE_AUTH);
        encoding.writeVarUint(enc, AUTH_AUTHENTICATED);
        encoding.writeVarString(enc, "read-write");
        ws.send(Buffer.from(encoding.toUint8Array(enc)));
      } else if (type === MESSAGE_SYNC) {
        const enc = encoding.createEncoder();
        encoding.writeVarString(enc, docName);
        encoding.writeVarUint(enc, MESSAGE_SYNC);
        const envelopeLen = encoding.length(enc);
        syncProtocol.readSyncMessage(decoder, enc, doc, "mock-server");
        if (encoding.length(enc) > envelopeLen) {
          ws.send(Buffer.from(encoding.toUint8Array(enc)));
        }
      }
    });
  });
}
