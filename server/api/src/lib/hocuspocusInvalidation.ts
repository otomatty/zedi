/**
 * Hocuspocus のインメモリ Y.Doc を破棄するための内部 HTTP クライアント。
 * Best-effort HTTP client that asks the Hocuspocus server to drop its cached
 * Y.Doc for a given page, so subsequent clients reload from the database.
 *
 * 共通呼び出し元 / Callers:
 *   - ページスナップショットの復元 (`routes/pageSnapshots.ts`)
 *   - タイトルリネーム伝播 (`services/titleRenamePropagationService.ts`, issue #726)
 *
 * ネットワーク失敗・タイムアウトは ログに残すだけで呼び出し側に伝播させない。
 * Failures (timeout, non-2xx, network) are logged only and never thrown — the
 * caller should continue with its main flow.
 */

const DEFAULT_HOCUSPOCUS_INTERNAL_URL = "http://127.0.0.1:1234";
/** HTTP timeout for invalidation (ms). / 無効化 HTTP のタイムアウト (ミリ秒) */
const HOCUSPOCUS_INVALIDATE_TIMEOUT_MS = 2500;

function getHocuspocusInternalUrl(): string | null {
  const explicitUrl = process.env.HOCUSPOCUS_INTERNAL_URL?.trim();
  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, "");
  }
  return process.env.NODE_ENV === "development" ? DEFAULT_HOCUSPOCUS_INTERNAL_URL : null;
}

/**
 * Hocuspocus にライブドキュメントの破棄を依頼する（ベストエフォート）。
 *
 * 環境変数 `HOCUSPOCUS_INTERNAL_URL` と `BETTER_AUTH_SECRET` が揃っている
 * 場合のみ動作する。開発環境では `HOCUSPOCUS_INTERNAL_URL` が未設定でも
 * デフォルトの `http://127.0.0.1:1234` にフォールバックする。
 *
 * Ask Hocuspocus to drop its live Y.Doc for `pageId`. Requires
 * `HOCUSPOCUS_INTERNAL_URL` and `BETTER_AUTH_SECRET`. In development the
 * URL defaults to `http://127.0.0.1:1234`.
 */
export async function invalidateHocuspocusDocument(
  pageId: string,
  opts?: { logPrefix?: string },
): Promise<void> {
  const baseUrl = getHocuspocusInternalUrl();
  const internalSecret = process.env.BETTER_AUTH_SECRET?.trim();
  const prefix = opts?.logPrefix ?? "[Hocuspocus]";

  if (!baseUrl || !internalSecret) {
    // Always log — silent skipping in production hides misconfiguration
    // until stale Y.Docs start winning against committed writes. List which
    // envs are missing so operators can diagnose. 本番で silent に無効化
    // すると古い Y.Doc が勝ち続ける原因調査が難しくなるため、常にログを残す。
    const missing = [
      baseUrl ? null : "HOCUSPOCUS_INTERNAL_URL",
      internalSecret ? null : "BETTER_AUTH_SECRET",
    ]
      .filter((v): v is string => v !== null)
      .join(", ");
    console.warn(
      `${prefix} Skipped invalidation for page ${pageId}: missing env var(s): ${missing}`,
    );
    return;
  }

  const url = `${baseUrl}/internal/documents/${encodeURIComponent(pageId)}/invalidate`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOCUSPOCUS_INVALIDATE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-internal-secret": internalSecret,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`${prefix} Invalidation HTTP ${response.status} for page ${pageId}`);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") {
      console.warn(`${prefix} Invalidation timed out for page ${pageId}`);
      return;
    }
    console.warn(`${prefix} Invalidation failed for page ${pageId}:`, error);
  }
}
