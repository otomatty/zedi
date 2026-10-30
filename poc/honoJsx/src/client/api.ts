import type { NoteListResponse, NoteSummary } from "../shared/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/** Query key + fetcher for the full note list (shared by the list page and the palette). */
export const allNotesQuery = {
  queryKey: ["notes", "all"] as const,
  queryFn: () => getJson<NoteListResponse>("/api/notes?limit=10000"),
  staleTime: 60_000,
};

/**
 * Fetches one note's metadata.
 * ノート 1 件のメタデータを取得する。
 */
export const fetchNote = (id: string) =>
  getJson<NoteSummary>(`/api/notes/${encodeURIComponent(id)}`);
