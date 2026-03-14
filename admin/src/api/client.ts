/**
 * 管理者用 API クライアントのベース。
 * Admin API client base. Uses credentials: "include" for cookie-based auth.
 */

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

function getApiUrl(path: string): string {
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
