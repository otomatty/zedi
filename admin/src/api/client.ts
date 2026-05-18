/**
 * 管理者用 API クライアントのベース。
 * Admin API client base. Uses credentials: "include" for cookie-based auth.
 */

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * パスを `VITE_API_BASE_URL` と結合して絶対 URL（または相対パス）を返す。
 * 本番では admin が Cloudflare Pages、API が `https://api.zedi-note.app`
 * など別オリジンになるため、`fetch` だけでなく `EventSource` などの
 * リクエスト URL もこの関数で組み立てる必要がある。
 *
 * Resolve a path against `VITE_API_BASE_URL`. Production splits the admin
 * origin (Cloudflare Pages) from the API origin
 * (`https://api.zedi-note.app`), so EventSource and other non-`adminFetch`
 * consumers must use this helper or they'll hit the wrong host.
 *
 * @param path - API パス（先頭の `/` は任意）/ API path (leading `/` optional)
 * @returns 絶対 URL（base 設定時）または同一オリジンのパス /
 *          Absolute URL when a base is set, otherwise the same-origin path
 */
export function getApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${normalized}` : normalized;
}

/**
 * 管理者用 API への fetch を行う。credentials: "include" で Cookie を送信する。
 * Fetches from admin API with credentials: "include" for cookie auth.
 *
 * @param path - API パス（先頭の / は任意）/ API path (leading / optional)
 * @param options - fetch のオプション / fetch options
 * @returns Response（JSON の場合は呼び出し側で .json() を実行）/ Response
 */
export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = getApiUrl(path);
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });
}

/**
 * Response の JSON ボディから `message` を取り出してエラーメッセージを組み立てる。
 * JSON parse に失敗した場合は statusText、最終的には fallback を返す。
 *
 * Extracts an error message from a JSON response body's `message` field,
 * falling back to `res.statusText` (when the body is not JSON) and finally to
 * the supplied `fallback`. Centralised here so each admin API module does not
 * re-implement the same parsing logic (see PR #636 review).
 *
 * `message` が空文字 / 全空白の場合や `statusText` が空の場合も、
 * 呼び出し側で `Error.message` が空にならないよう、最終的に必ず `fallback`
 * に倒す。`??` ではなく空文字チェックで判定することがポイント。
 *
 * Treat empty/whitespace-only `message` and empty `statusText` as absent so
 * downstream `Error.message` values are never blank — the check is intentionally
 * "non-empty after trim", not nullish coalescing.
 *
 * @param res - 失敗した fetch Response / Failed fetch Response
 * @param fallback - 最後の fallback メッセージ / Fallback message
 */
export async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const candidate =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : res.statusText;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
