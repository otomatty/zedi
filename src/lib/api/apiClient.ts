/**
 * REST API client for Zedi backend (C1-4, C1-5, C1-6, C1-7).
 * Phase C3: Replaces direct Turso connection. All /api/* routes require Cognito JWT.
 */

import type {
  SyncPagesResponse,
  PostSyncPagesBody,
  PostSyncPagesResponse,
  PageContentResponse,
  PutPageContentBody,
  CreatePageBody,
  CreatePageResponse,
  SearchSharedResponse,
  NoteListItem,
  GetNoteResponse,
  NoteMemberItem,
} from "./types";

export type { NoteListItem };

export interface ApiClientOptions {
  /** Base URL for API (e.g. https://xxx.execute-api.region.amazonaws.com or "" for same-origin). */
  baseUrl?: string;
  /** Returns current Cognito id_token for Authorization header. */
  getToken: () => Promise<string | null>;
}

/** API error with status and optional code from body. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string; code?: string };
};

function getDefaultBaseUrl(): string {
  return (import.meta.env.VITE_ZEDI_API_BASE_URL as string) ?? "";
}

async function request<T>(
  method: string,
  path: string,
  getToken: () => Promise<string | null>,
  baseUrl: string,
  options: { body?: unknown; query?: Record<string, string> } = {}
): Promise<T> {
  const base = baseUrl.replace(/\/$/, "");
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base || (typeof window !== "undefined" ? window.location.origin : "http://localhost"));
  if (options.query) {
    Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const token = await getToken();
  if (!token) {
    throw new ApiError("Not authenticated", 401);
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), init);
  } catch (networkError) {
    // Network-level failures (CORS blocked, DNS failure, offline, etc.)
    throw new ApiError(
      `Network error: ${networkError instanceof Error ? networkError.message : "Failed to fetch"}`,
      0,
      "NETWORK_ERROR"
    );
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Response was not valid JSON — log a snippet for debugging
    const snippet = text.length > 200 ? text.slice(0, 200) + "…" : text;
    throw new ApiError(
      `Invalid JSON response (HTTP ${res.status}): ${snippet}`,
      res.status,
      "INVALID_JSON"
    );
  }
  if (!res.ok) {
    const envelope = data as ApiEnvelope<unknown> | null;
    const legacy = data as { message?: string; code?: string } | null;
    const msg =
      envelope?.error?.message ??
      legacy?.message ??
      res.statusText;
    const code = envelope?.error?.code ?? legacy?.code;
    throw new ApiError(msg, res.status, code);
  }

  // Server success responses are wrapped as { ok: true, data: ... }.
  const envelope = data as ApiEnvelope<T> | null;
  if (
    envelope &&
    typeof envelope === "object" &&
    "ok" in envelope &&
    envelope.ok === true &&
    "data" in envelope
  ) {
    return envelope.data as T;
  }

  // Backward compatibility: if server returns raw payload, keep accepting it.
  return data as T;
}

export function createApiClient(options?: Partial<ApiClientOptions>) {
  const getToken = options?.getToken ?? (() => Promise.resolve(null));
  const baseUrl = options?.baseUrl ?? getDefaultBaseUrl();

  const req = <T>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Record<string, string> } = {}
  ) => request<T>(method, path, getToken, baseUrl, opts);

  return {
    /** GET /api/sync/pages?since= (ISO8601). Omit since for full pull. */
    async getSyncPages(since?: string): Promise<SyncPagesResponse> {
      const query: Record<string, string> = {};
      if (since) query.since = since;
      return req<SyncPagesResponse>("GET", "/api/sync/pages", { query });
    },

    /** POST /api/sync/pages — push local changes (LWW). */
    async postSyncPages(body: PostSyncPagesBody): Promise<PostSyncPagesResponse> {
      return req<PostSyncPagesResponse>("POST", "/api/sync/pages", { body });
    },

    /** GET /api/pages/:id/content — ydoc_state (base64), version. 404 if no content. */
    async getPageContent(pageId: string): Promise<PageContentResponse> {
      return req<PageContentResponse>("GET", `/api/pages/${encodeURIComponent(pageId)}/content`);
    },

    /** PUT /api/pages/:id/content — upload Y.Doc state. Optional version for optimistic lock. */
    async putPageContent(
      pageId: string,
      body: PutPageContentBody
    ): Promise<{ version: number }> {
      return req<{ version: number }>(
        "PUT",
        `/api/pages/${encodeURIComponent(pageId)}/content`,
        { body }
      );
    },

    /** POST /api/pages — create page. Returns created page (snake_case). */
    async createPage(body: CreatePageBody = {}): Promise<CreatePageResponse> {
      return req<CreatePageResponse>("POST", "/api/pages", { body });
    },

    /** DELETE /api/pages/:id — logical delete. */
    async deletePage(pageId: string): Promise<{ id: string; deleted: boolean }> {
      return req<{ id: string; deleted: boolean }>(
        "DELETE",
        `/api/pages/${encodeURIComponent(pageId)}`
      );
    },

    /** GET /api/notes — list notes the user can access (role, page_count, member_count). */
    async getNotes(): Promise<NoteListItem[]> {
      return req<NoteListItem[]>("GET", "/api/notes");
    },

    /** GET /api/notes/:id — note detail with pages and current_user_role. */
    async getNote(noteId: string): Promise<GetNoteResponse> {
      return req<GetNoteResponse>("GET", `/api/notes/${encodeURIComponent(noteId)}`);
    },

    /** GET /api/notes/:id/members — list members. */
    async getNoteMembers(noteId: string): Promise<NoteMemberItem[]> {
      return req<NoteMemberItem[]>("GET", `/api/notes/${encodeURIComponent(noteId)}/members`);
    },

    /** POST /api/notes — create note. */
    async createNote(body: { title?: string; visibility?: string } = {}): Promise<NoteListItem> {
      return req<NoteListItem>("POST", "/api/notes", { body });
    },

    /** PUT /api/notes/:id — update note (owner only). */
    async updateNote(
      noteId: string,
      body: { title?: string; visibility?: string }
    ): Promise<NoteListItem> {
      return req<NoteListItem>("PUT", `/api/notes/${encodeURIComponent(noteId)}`, { body });
    },

    /** DELETE /api/notes/:id — logical delete (owner only). */
    async deleteNote(noteId: string): Promise<{ id: string; deleted: boolean }> {
      return req<{ id: string; deleted: boolean }>(
        "DELETE",
        `/api/notes/${encodeURIComponent(noteId)}`
      );
    },

    /** POST /api/notes/:id/pages — add page { pageId } or create new { title }. */
    async addNotePage(
      noteId: string,
      body: { pageId?: string; page_id?: string; title?: string }
    ): Promise<unknown> {
      return req("POST", `/api/notes/${encodeURIComponent(noteId)}/pages`, { body });
    },

    /** DELETE /api/notes/:id/pages/:pageId — remove page from note. */
    async removeNotePage(noteId: string, pageId: string): Promise<{ note_id: string; page_id: string; removed: boolean }> {
      return req("DELETE", `/api/notes/${encodeURIComponent(noteId)}/pages/${encodeURIComponent(pageId)}`);
    },

    /** POST /api/notes/:id/members — add member (owner only). */
    async addNoteMember(
      noteId: string,
      body: { member_email: string; role?: string }
    ): Promise<NoteMemberItem> {
      return req<NoteMemberItem>("POST", `/api/notes/${encodeURIComponent(noteId)}/members`, { body });
    },

    /** DELETE /api/notes/:id/members/:email — remove member (owner only). */
    async removeNoteMember(noteId: string, memberEmail: string): Promise<{ note_id: string; member_email: string; removed: boolean }> {
      return req(
        "DELETE",
        `/api/notes/${encodeURIComponent(noteId)}/members/${encodeURIComponent(memberEmail)}`
      );
    },

    /** PUT /api/notes/:id/members/:email — update member role (owner only). */
    async updateNoteMember(
      noteId: string,
      memberEmail: string,
      body: { role: "editor" | "viewer" }
    ): Promise<NoteMemberItem> {
      return req<NoteMemberItem>(
        "PUT",
        `/api/notes/${encodeURIComponent(noteId)}/members/${encodeURIComponent(memberEmail)}`,
        { body }
      );
    },

    /** GET /api/search?q=&scope=shared — shared notes full-text search. */
    async searchSharedNotes(q: string): Promise<SearchSharedResponse> {
      if (!q.trim()) return { results: [] };
      return req<SearchSharedResponse>("GET", "/api/search", {
        query: { q: q.trim(), scope: "shared" },
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
