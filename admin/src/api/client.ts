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
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}
