/**
 * Internal-only API endpoints intended for service-to-service calls
 * (currently: Hocuspocus → API). All routes require an
 * `x-internal-secret: $BETTER_AUTH_SECRET` header. No user session is needed
 * because the caller is a trusted backend service.
 *
 * 内部サービス間呼び出し用の API エンドポイント（現状は Hocuspocus → API）。
 * すべて `x-internal-secret` ヘッダ必須。ユーザーセッションは要求しない。
 *
 * 命名規則 / Naming convention:
 *   - URL は `/api/internal/...` プレフィックスでマウントする。
 *   - エンドポイントは小さく単目的に保つ（GET なし、副作用のある POST のみ）。
 *
 * Naming: every route is mounted under `/api/internal/...` and stays
 * single-purpose. We only add side-effecting POSTs here; read endpoints stay
 * on the public API surface.
 *
 * 認証 / Auth:
 *   - 共有秘密 `BETTER_AUTH_SECRET` をヘッダで照合する。Hocuspocus 側の
 *     `/internal/documents/:id/invalidate` と同じ契約。
 *   - 秘密が未設定の環境では本サービスから 503 を返してリクエストを弾く。
 *
 * Authentication:
 *   - Symmetric shared-secret comparison against `BETTER_AUTH_SECRET`,
 *     matching the contract Hocuspocus uses for its own internal endpoint
 *     (`/internal/documents/:id/invalidate`).
 *   - When the secret is missing, return 503 so callers fail loudly instead
 *     of silently allowing unauthenticated calls.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/index.js";
import { syncPageGraphFromStoredYDoc } from "../services/pageGraphSyncService.js";

const app = new Hono<AppEnv>();

/**
 * 共有秘密ヘッダの検証。マッチしなければ 401 を投げる。
 * `BETTER_AUTH_SECRET` が未設定なら 503 を返す（本番で誤って公開しないため）。
 *
 * Validate the `x-internal-secret` header. Throws 401 on mismatch and 503 on
 * missing config so callers can distinguish misconfiguration from a wrong
 * secret.
 */
function assertInternalAuth(c: { req: { header: (name: string) => string | undefined } }): void {
  const expected = process.env.BETTER_AUTH_SECRET?.trim();
  if (!expected) {
    // 本番でこの状態になるのは設定漏れ。403/401 だと「秘密が正しくない」と
    // 誤読されかねないので 503 にして外形監視に拾わせる。
    // Hitting this branch in prod means missing configuration. We deliberately
    // return 503 (not 401/403) so external monitoring picks it up as a
    // service issue rather than masking it as an auth failure.
    throw new HTTPException(503, { message: "Internal API not configured" });
  }
  const provided = c.req.header("x-internal-secret")?.trim();
  if (!provided || provided !== expected) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
}

/**
 * `POST /api/internal/pages/:id/graph-sync`
 *
 * Hocuspocus が `onStoreDocument` で `page_contents` を更新したあとに呼ぶ。
 * 現在 DB に保存されている Y.Doc から `links` / `ghost_links` を再構築する。
 *
 * Endpoint Hocuspocus calls after persisting a Y.Doc in `onStoreDocument`.
 * Rebuilds outgoing edges (`links` / `ghost_links`) from the just-saved
 * Y.Doc state for that page.
 *
 * レスポンス / Response:
 *   - 200: `\{ ok: true, applied: true|false, ...counters \}`.
 *     `applied: false` は `page_contents` 行が無い（コンテンツ未保存）か、
 *     ソースページが論理削除された場合。
 *   - 401: 認証失敗 / Auth failed.
 *   - 503: BETTER_AUTH_SECRET 未設定 / Secret unset.
 */
app.post("/pages/:id/graph-sync", async (c) => {
  assertInternalAuth(c);
  const pageId = c.req.param("id");
  const db = c.get("db");

  try {
    const result = await syncPageGraphFromStoredYDoc(db, pageId);
    if (result === null) {
      // ydoc_state がまだ無いページ。エラーではなく no-op として返す。
      // No `page_contents` row yet; return ok with applied=false so callers
      // can log a metric without treating it as failure.
      return c.json({ ok: true, applied: false });
    }
    return c.json({ ok: true, applied: !result.skippedSourceNotFound, ...result });
  } catch (error) {
    // 失敗しても呼び出し元（Hocuspocus）は本文保存自体は完了しているので、
    // 同期失敗は 5xx で返して呼び出し側のリトライ判断に任せる。
    // The caller has already persisted the content; surface failure as 5xx
    // so the caller can decide whether to retry / log.
    console.error(`[InternalGraphSync] Failed for page ${pageId}:`, error);
    throw new HTTPException(500, { message: "Graph sync failed" });
  }
});

export default app;
