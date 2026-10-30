import type { PageDetail, PageListResponse, SearchResponse } from "../shared/types";
import type { Me } from "./lib/session";

/** Non-2xx API response. */
export class ApiError extends Error {
  /** Keeps the HTTP status so callers can tell "not found" from other failures. */
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`${status} ${url}`);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as T;
}

/**
 * Current user and default note, or null when signed out.
 * ログイン中のユーザーと既定ノート（未ログインなら null）。
 */
export async function fetchMe(): Promise<Me | null> {
  const res = await fetch("/api/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(res.status, "/api/me");
  return (await res.json()) as Me;
}

/** One keyset page of a note's pages (newest first). */
export const fetchPageList = (noteId: string, cursor: string | null) =>
  request<PageListResponse>(
    `/api/notes/${encodeURIComponent(noteId)}/pages?limit=100${cursor ? `&cursor=${cursor}` : ""}`,
  );

/** A page and the caller's role. */
export const fetchPage = (id: string) =>
  request<PageDetail>(`/api/pages/${encodeURIComponent(id)}`);

/** Full-text search across every note the user can access. */
export const searchPages = (q: string) =>
  request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`);

/**
 * Creates a page in a note under a client-generated id (safe to retry) and returns the id.
 * クライアント生成 id でページを作る（再送しても 1 件だけ作られる）。
 */
export const createPage = (noteId: string, title: string, id: string) =>
  request<{ id: string }>(`/api/notes/${encodeURIComponent(noteId)}/pages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, title }),
  });
