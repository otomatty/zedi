/**
 * 管理者用 API クライアントのベース
 * 認証基盤実装時に credentials: "include" で Cookie を送るようにする。
 */

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

function getApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${normalized}` : normalized;
}

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
