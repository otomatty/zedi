/**
 * REST API client for Zedi backend.
 * Uses cookie-based auth (Better Auth) — credentials: "include" on all requests.
 */

import type {
  SyncPagesResponse,
  PostSyncPagesBody,
  PostSyncPagesResponse,
  PageContentResponse,
  PutPageContentBody,
  CreatePageBody,
  CreatePageResponse,
  CopyPersonalPageToNoteResponse,
  CopyNotePageToPersonalResponse,
  SearchSharedResponse,
  NoteListItem,
  MyNoteResponse,
  GetNoteResponse,
  NoteMemberItem,
  DiscoverResponse,
  SnapshotListResponse,
  SnapshotDetailResponse,
  RestoreSnapshotResponse,
  ResendInvitationResponse,
  InvitationInfoResponse,
  AcceptInvitationResponse,
  SendInvitationEmailLinkResponse,
  InviteLinkPreviewResponse,
  InviteLinkRedeemResponse,
  CreateInviteLinkBody,
  InviteLinkRow,
  DomainAccessRow,
  CreateDomainAccessBody,
} from "./types";

export type { NoteListItem };

/**
 * API クライアント生成オプション。
 * Options for creating the API client.
 */
export interface ApiClientOptions {
  /** Base URL for API (e.g. https://api.zedi-note.app or "" for same-origin). */
  baseUrl?: string;
  /** @deprecated No longer used — auth is cookie-based. Kept for backward compatibility. */
  getToken?: () => Promise<string | null>;
}

/** API error with status and optional code from body. */
export class ApiError extends Error {
  /**
   * API エラーを生成する。
   * Creates an API error with HTTP status and optional application code.
   *
   * @param data - サーバーから返された構造化レスポンスボディ。エラーメッセージ以外に
   *   `retry_after` などの付帯情報を呼び出し側で参照したい場合に使う。
   *   Parsed response body (structured) so callers can read extra fields such
   *   as `retry_after` instead of parsing the human-readable message.
   */
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: unknown,
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
  return (import.meta.env.VITE_API_BASE_URL as string) ?? "";
}

const MAX_RETRIES = 3;
const DEFAULT_RETRY_AFTER_MS = 2_000;

function parseResponseText(text: string, status: number): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    const snippet = text.length > 200 ? text.slice(0, 200) + "…" : text;
    throw new ApiError(
      `Invalid JSON response (HTTP ${status}): ${snippet}`,
      status,
      "INVALID_JSON",
    );
  }
}

function throwOnErrorResponse(data: unknown, res: Response): never {
  const envelope = data as ApiEnvelope<unknown> | null;
  const legacy = data as { message?: string; code?: string } | null;
  const msg = envelope?.error?.message ?? legacy?.message ?? res.statusText;
  const code = envelope?.error?.code ?? legacy?.code;
  throw new ApiError(msg, res.status, code, data);
}

function unwrapEnvelope<T>(data: unknown): T {
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
  return data as T;
}

/**
 * URL・ヘッダ・`RequestInit` の組み立てを集約するヘルパ。
 * `request` / `requestOptionalAuth` / `getNoteWithCache` で共通化することで、
 * 認証クッキーやヘッダの取り扱いが一箇所に揃う（PR #856 Gemini HIGH review）。
 *
 * Centralizes URL + headers + `RequestInit` construction so every fetch in
 * this client agrees on `credentials`, `Content-Type`, query handling, and
 * the new `If-None-Match` opt-in (see PR #856 Gemini HIGH review).
 */
function buildRequestInit(
  method: string,
  path: string,
  baseUrl: string,
  options: {
    body?: unknown;
    query?: Record<string, string>;
    ifNoneMatch?: string;
  },
): { url: string; init: RequestInit } {
  const base = baseUrl.replace(/\/$/, "");
  const url = new URL(
    path.startsWith("/") ? path : `/${path}`,
    base || (typeof window !== "undefined" ? window.location.origin : "http://localhost"),
  );
  if (options.query) {
    Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.ifNoneMatch) headers["If-None-Match"] = options.ifNoneMatch;
  const init: RequestInit = { method, headers, credentials: "include" };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  return { url: url.toString(), init };
}

/**
 * `fetch` のネットワーク例外を `ApiError(NETWORK_ERROR)` に揃えるラッパ。
 * Wraps `fetch` so connection-level failures surface as `ApiError(NETWORK_ERROR)`.
 */
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (networkError) {
    throw new ApiError(
      `Network error: ${networkError instanceof Error ? networkError.message : "Failed to fetch"}`,
      0,
      "NETWORK_ERROR",
    );
  }
}

async function request<T>(
  method: string,
  path: string,
  baseUrl: string,
  options: { body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const { url, init } = buildRequestInit(method, path, baseUrl, options);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await safeFetch(url, init);

    if (res.status === 503 && attempt < MAX_RETRIES) {
      const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "", 10);
      const waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : DEFAULT_RETRY_AFTER_MS;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const text = await res.text();
    const data = parseResponseText(text, res.status);
    if (!res.ok) {
      throwOnErrorResponse(data, res);
    }
    return unwrapEnvelope<T>(data);
  }

  throw new ApiError("Service unavailable after retries", 503, "SERVICE_UNAVAILABLE");
}

async function requestOptionalAuth<T>(
  method: string,
  path: string,
  baseUrl: string,
  options: { body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const { url, init } = buildRequestInit(method, path, baseUrl, options);
  const res = await safeFetch(url, init);
  const text = await res.text();
  const data = parseResponseText(text, res.status);
  if (!res.ok) {
    throwOnErrorResponse(data, res);
  }
  return unwrapEnvelope<T>(data);
}

/**
 * `requestOptionalAuth` の ETag 対応版。`If-None-Match` を載せ、`304 Not
 * Modified` のときは body を読まずに `{ notModified: true }` を返す。`fetch`
 * の組み立てとネットワーク例外ハンドリングは `buildRequestInit` /
 * `safeFetch` で共有するので、認証や `Content-Type` の振る舞いが
 * 通常パスとずれない（PR #856 Gemini HIGH review）。
 *
 * ETag-aware sibling of `requestOptionalAuth`. Sends `If-None-Match` and
 * short-circuits on `304 Not Modified` so the empty body is never fed to
 * `JSON.parse`. Shares `buildRequestInit` / `safeFetch` with the standard
 * path so auth / `Content-Type` / network error semantics stay in lockstep
 * (see PR #856 Gemini HIGH review).
 */
async function requestOptionalAuthConditional<T>(
  method: string,
  path: string,
  baseUrl: string,
  options: { body?: unknown; query?: Record<string, string>; ifNoneMatch?: string } = {},
): Promise<{ notModified: boolean; data: T | null; etag: string | null }> {
  const { url, init } = buildRequestInit(method, path, baseUrl, options);
  const res = await safeFetch(url, init);
  const etag = res.headers.get("ETag");
  if (res.status === 304) {
    return { notModified: true, data: null, etag };
  }
  const text = await res.text();
  const data = parseResponseText(text, res.status);
  if (!res.ok) {
    throwOnErrorResponse(data, res);
  }
  return {
    notModified: false,
    data: unwrapEnvelope<T>(data),
    etag,
  };
}

/**
 * 型付き API クライアントを生成する。
 * Creates a typed API client for Zedi backend endpoints.
 *
 * @param options - API クライアント設定 / API client options
 * @returns API 呼び出しヘルパー群 / API request helpers
 */
export function createApiClient(options?: Partial<ApiClientOptions>) {
  const baseUrl = options?.baseUrl ?? getDefaultBaseUrl();

  const req = <T>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Record<string, string> } = {},
  ) => request<T>(method, path, baseUrl, opts);

  const reqOptionalAuth = <T>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Record<string, string> } = {},
  ) => requestOptionalAuth<T>(method, path, baseUrl, opts);

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
    async putPageContent(pageId: string, body: PutPageContentBody): Promise<{ version: number }> {
      return req<{ version: number }>("PUT", `/api/pages/${encodeURIComponent(pageId)}/content`, {
        body,
      });
    },

    /** POST /api/pages — create page. Returns created page (snake_case). */
    async createPage(body: CreatePageBody = {}): Promise<CreatePageResponse> {
      return req<CreatePageResponse>("POST", "/api/pages", { body });
    },

    /** DELETE /api/pages/:id — logical delete. */
    async deletePage(pageId: string): Promise<{ id: string; deleted: boolean }> {
      return req<{ id: string; deleted: boolean }>(
        "DELETE",
        `/api/pages/${encodeURIComponent(pageId)}`,
      );
    },

    // ── Page Snapshots (Version History) ──────────────────────────────────

    /** GET /api/pages/:id/snapshots — スナップショット一覧 / List snapshots */
    async getPageSnapshots(pageId: string): Promise<SnapshotListResponse> {
      return req<SnapshotListResponse>("GET", `/api/pages/${encodeURIComponent(pageId)}/snapshots`);
    },

    /** GET /api/pages/:id/snapshots/:snapshotId — スナップショット詳細 / Get snapshot detail */
    async getPageSnapshot(pageId: string, snapshotId: string): Promise<SnapshotDetailResponse> {
      return req<SnapshotDetailResponse>(
        "GET",
        `/api/pages/${encodeURIComponent(pageId)}/snapshots/${encodeURIComponent(snapshotId)}`,
      );
    },

    /** POST /api/pages/:id/snapshots/:snapshotId/restore — 復元 / Restore snapshot */
    async restorePageSnapshot(
      pageId: string,
      snapshotId: string,
    ): Promise<RestoreSnapshotResponse> {
      return req<RestoreSnapshotResponse>(
        "POST",
        `/api/pages/${encodeURIComponent(pageId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
      );
    },

    /** GET /api/notes — list notes the user can access (role, page_count, member_count). */
    async getNotes(): Promise<NoteListItem[]> {
      return req<NoteListItem[]>("GET", "/api/notes");
    },

    /**
     * GET /api/notes/me — return the caller's default note ("マイノート").
     * If one does not exist yet (e.g. brand-new account) the server creates
     * it on the fly. Used by the `/notes/me` landing page to resolve the
     * note id for a redirect into `/notes/:noteId`.
     *
     * GET /api/notes/me — 呼び出し元のデフォルトノート（マイノート）を返す。
     * 未作成ならサーバが idempotent に作成する。`/notes/me` ランディングが
     * 最初に叩いて、解決した note id へリダイレクトする。
     */
    async getMyNote(): Promise<MyNoteResponse> {
      return req<MyNoteResponse>("GET", "/api/notes/me");
    },

    /** GET /api/notes/:id — note detail (auth optional; public/unlisted viewable by guests). */
    async getNote(noteId: string): Promise<GetNoteResponse> {
      return reqOptionalAuth<GetNoteResponse>("GET", `/api/notes/${encodeURIComponent(noteId)}`);
    },

    /**
     * GET /api/notes/:id with conditional ETag support (Issue #853).
     *
     * Send `ifNoneMatch` to opt into 304 short-circuiting. The server responds
     * with 304 (no body) when the cached representation is still fresh; the
     * caller is expected to reuse its cached payload in that case.
     *
     * `GET /api/notes/:id` を ETag 条件付きで叩く（Issue #853）。
     * `ifNoneMatch` を渡すと未変更時は 304（body 無し）が返り、呼び出し側は
     * 自前のキャッシュを使い回すことで body 転送を省略できる。
     */
    async getNoteWithCache(
      noteId: string,
      options: { ifNoneMatch?: string } = {},
    ): Promise<{
      notModified: boolean;
      data: GetNoteResponse | null;
      etag: string | null;
    }> {
      return requestOptionalAuthConditional<GetNoteResponse>(
        "GET",
        `/api/notes/${encodeURIComponent(noteId)}`,
        baseUrl,
        { ifNoneMatch: options.ifNoneMatch },
      );
    },

    /** GET /api/notes/discover — public notes list (auth optional). */
    async getPublicNotes(opts?: {
      sort?: string;
      limit?: number;
      offset?: number;
    }): Promise<DiscoverResponse> {
      return reqOptionalAuth<DiscoverResponse>("GET", "/api/notes/discover", {
        query: {
          sort: opts?.sort ?? "updated",
          limit: String(opts?.limit ?? 20),
          offset: String(opts?.offset ?? 0),
        },
      });
    },

    /** GET /api/notes/:id/members — list members. */
    async getNoteMembers(noteId: string): Promise<NoteMemberItem[]> {
      return req<NoteMemberItem[]>("GET", `/api/notes/${encodeURIComponent(noteId)}/members`);
    },

    /** POST /api/notes — create note. */
    async createNote(
      body: {
        title?: string;
        visibility?: string;
        edit_permission?: string;
      } = {},
    ): Promise<NoteListItem> {
      return req<NoteListItem>("POST", "/api/notes", { body });
    },

    /** PUT /api/notes/:id — update note (owner only). */
    async updateNote(
      noteId: string,
      body: { title?: string; visibility?: string; edit_permission?: string },
    ): Promise<NoteListItem> {
      return req<NoteListItem>("PUT", `/api/notes/${encodeURIComponent(noteId)}`, { body });
    },

    /** DELETE /api/notes/:id — logical delete (owner only). */
    async deleteNote(noteId: string): Promise<{ id: string; deleted: boolean }> {
      return req<{ id: string; deleted: boolean }>(
        "DELETE",
        `/api/notes/${encodeURIComponent(noteId)}`,
      );
    },

    /** POST /api/notes/:id/pages — add an existing page or create a new titled page. */
    async addNotePage(
      noteId: string,
      body: { pageId?: string; page_id?: string; title?: string },
    ): Promise<unknown> {
      return req("POST", `/api/notes/${encodeURIComponent(noteId)}/pages`, { body });
    },

    /** DELETE /api/notes/:id/pages/:pageId — remove page from note. */
    async removeNotePage(
      noteId: string,
      pageId: string,
    ): Promise<{ note_id: string; page_id: string; removed: boolean }> {
      return req(
        "DELETE",
        `/api/notes/${encodeURIComponent(noteId)}/pages/${encodeURIComponent(pageId)}`,
      );
    },

    /**
     * `POST /api/notes/:noteId/pages/copy-from-personal/:pageId`
     *
     * 個人ページをコピーして、指定ノート配下のノートネイティブページを新規作成する。
     * 元の個人ページは `/home` に残り、新しいコピーだけがノートに出る (issue #713 Phase 3)。
     *
     * Copy a personal page into the given note as a fresh note-native page.
     * The original stays on the caller's `/home`; only the copy surfaces
     * inside the note. See issue #713 Phase 3.
     */
    async copyPersonalPageToNote(
      noteId: string,
      sourcePageId: string,
    ): Promise<CopyPersonalPageToNoteResponse> {
      return req<CopyPersonalPageToNoteResponse>(
        "POST",
        `/api/notes/${encodeURIComponent(noteId)}/pages/copy-from-personal/${encodeURIComponent(
          sourcePageId,
        )}`,
      );
    },

    /**
     * `POST /api/notes/:noteId/pages/:pageId/copy-to-personal`
     *
     * ノートネイティブページをコピーして、呼び出し元の個人ページを新規作成する。
     * 元のノートページはノート内に残り、コピーだけが呼び出し元の `/home` に加わる。
     * ノート脱退後もコピーは残る (issue #713 Phase 3)。
     *
     * Copy a note-native page into the caller's personal pages. The original
     * note page stays in the note; only the copy lands on `/home`, and it
     * survives any later change in note membership. See issue #713 Phase 3.
     */
    async copyNotePageToPersonal(
      noteId: string,
      sourcePageId: string,
    ): Promise<CopyNotePageToPersonalResponse> {
      return req<CopyNotePageToPersonalResponse>(
        "POST",
        `/api/notes/${encodeURIComponent(noteId)}/pages/${encodeURIComponent(
          sourcePageId,
        )}/copy-to-personal`,
      );
    },

    /** POST /api/notes/:id/members — add member (owner only). */
    async addNoteMember(
      noteId: string,
      body: { member_email: string; role?: string },
    ): Promise<NoteMemberItem> {
      return req<NoteMemberItem>("POST", `/api/notes/${encodeURIComponent(noteId)}/members`, {
        body,
      });
    },

    /** DELETE /api/notes/:id/members/:email — remove member (owner only). */
    async removeNoteMember(
      noteId: string,
      memberEmail: string,
    ): Promise<{ note_id: string; member_email: string; removed: boolean }> {
      return req(
        "DELETE",
        `/api/notes/${encodeURIComponent(noteId)}/members/${encodeURIComponent(memberEmail)}`,
      );
    },

    /** PUT /api/notes/:id/members/:email — update member role (owner only). */
    async updateNoteMember(
      noteId: string,
      memberEmail: string,
      body: { role: "editor" | "viewer" },
    ): Promise<NoteMemberItem> {
      return req<NoteMemberItem>(
        "PUT",
        `/api/notes/${encodeURIComponent(noteId)}/members/${encodeURIComponent(memberEmail)}`,
        { body },
      );
    },

    /** POST /api/notes/:id/members/:email/resend — resend invitation email. */
    async resendInvitation(noteId: string, memberEmail: string): Promise<ResendInvitationResponse> {
      return req<ResendInvitationResponse>(
        "POST",
        `/api/notes/${encodeURIComponent(noteId)}/members/${encodeURIComponent(memberEmail)}/resend`,
      );
    },

    /** GET /api/search?q=&scope=shared — shared notes full-text search. */
    async searchSharedNotes(q: string): Promise<SearchSharedResponse> {
      if (!q.trim()) return { results: [] };
      return req<SearchSharedResponse>("GET", "/api/search", {
        query: { q: q.trim(), scope: "shared" },
      });
    },

    /** POST /api/clip/fetch — fetch URL HTML server-side (for Web Clipping, avoids CORS). */
    async clipFetchHtml(url: string): Promise<string> {
      const { html } = await req<{ html: string }>("POST", "/api/clip/fetch", {
        body: { url },
      });
      return html;
    },

    /**
     * POST /api/clip/youtube — YouTube URL からメタデータ + 字幕 + AI 要約を取得。
     * Fetches YouTube metadata + transcript + AI summary and returns Tiptap JSON.
     */
    async clipYoutube(
      url: string,
      options?: { provider?: string; model?: string },
    ): Promise<{
      title: string;
      thumbnailUrl: string | null;
      tiptapJson: Record<string, unknown>;
      contentText: string;
      contentHash: string;
      sourceUrl: string;
    }> {
      return req("POST", "/api/clip/youtube", {
        body: { url, ...options },
      });
    },

    // ── Invitation ───────────────────────────────────────────────────────

    /** GET /api/invite/:token — トークン検証 + 招待情報取得（認証不要）/ Validate token & get invitation info (no auth). */
    async getInvitation(token: string): Promise<InvitationInfoResponse> {
      return reqOptionalAuth<InvitationInfoResponse>(
        "GET",
        `/api/invite/${encodeURIComponent(token)}`,
      );
    },

    /** POST /api/invite/:token/accept — 招待承認（認証必須）/ Accept invitation (auth required). */
    async acceptInvitation(token: string): Promise<AcceptInvitationResponse> {
      return req<AcceptInvitationResponse>(
        "POST",
        `/api/invite/${encodeURIComponent(token)}/accept`,
      );
    },

    /**
     * POST /api/invite/:token/email-link — 招待先メール宛にマジックリンクを送る（認証任意）。
     * Send a magic-link email to the invited address (no auth required).
     *
     * レート制限に触れた場合は ApiError (status 429) を投げる。
     * Throws ApiError (status 429) when the server returns a rate-limit response.
     */
    async sendInvitationEmailLink(token: string): Promise<SendInvitationEmailLinkResponse> {
      return reqOptionalAuth<SendInvitationEmailLinkResponse>(
        "POST",
        `/api/invite/${encodeURIComponent(token)}/email-link`,
      );
    },

    // ── Invite Links (share links — epic #657 / issue #660) ───────────────

    /**
     * GET /api/invite-links/:token — 共有リンクのプレビュー（認証不要）。
     * Fetch share-link preview info (no auth required).
     */
    async getInviteLinkPreview(token: string): Promise<InviteLinkPreviewResponse> {
      return reqOptionalAuth<InviteLinkPreviewResponse>(
        "GET",
        `/api/invite-links/${encodeURIComponent(token)}`,
      );
    },

    /**
     * POST /api/invite-links/:token/redeem — 共有リンクを受諾してノートに参加する（認証必須）。
     * Redeem a share link to join the note (auth required).
     */
    async redeemInviteLink(token: string): Promise<InviteLinkRedeemResponse> {
      return req<InviteLinkRedeemResponse>(
        "POST",
        `/api/invite-links/${encodeURIComponent(token)}/redeem`,
      );
    },

    /**
     * POST /api/notes/:noteId/invite-links — 共有リンクを発行する（オーナー）。
     * Create a share link (owner only).
     */
    async createInviteLink(noteId: string, body: CreateInviteLinkBody): Promise<InviteLinkRow> {
      return req<InviteLinkRow>("POST", `/api/notes/${encodeURIComponent(noteId)}/invite-links`, {
        body,
      });
    },

    /**
     * GET /api/notes/:noteId/invite-links — 共有リンク一覧（owner / editor）。
     * List share links for a note.
     */
    async listInviteLinks(noteId: string): Promise<InviteLinkRow[]> {
      return req<InviteLinkRow[]>("GET", `/api/notes/${encodeURIComponent(noteId)}/invite-links`);
    },

    /**
     * DELETE /api/notes/:noteId/invite-links/:linkId — リンクを取り消す（オーナー）。
     * Revoke a share link (owner only).
     */
    async revokeInviteLink(
      noteId: string,
      linkId: string,
    ): Promise<{ revoked: true; revokedAt: string }> {
      return req<{ revoked: true; revokedAt: string }>(
        "DELETE",
        `/api/notes/${encodeURIComponent(noteId)}/invite-links/${encodeURIComponent(linkId)}`,
      );
    },

    // ── Domain access (epic #657 / issue #663) ─────────────────────────────

    /**
     * GET /api/notes/:noteId/domain-access — ドメインルール一覧（owner / editor）。
     * List domain-access rules for a note (owner or editor).
     */
    async listDomainAccess(noteId: string): Promise<DomainAccessRow[]> {
      return req<DomainAccessRow[]>(
        "GET",
        `/api/notes/${encodeURIComponent(noteId)}/domain-access`,
      );
    },

    /**
     * POST /api/notes/:noteId/domain-access — ドメインルールを追加（オーナー）。
     * Create a domain-access rule (owner only). Server rejects free-email
     * providers (gmail.com etc.) with HTTP 400.
     */
    async createDomainAccess(
      noteId: string,
      body: CreateDomainAccessBody,
    ): Promise<DomainAccessRow> {
      return req<DomainAccessRow>(
        "POST",
        `/api/notes/${encodeURIComponent(noteId)}/domain-access`,
        { body },
      );
    },

    /**
     * DELETE /api/notes/:noteId/domain-access/:id — ドメインルールを削除（オーナー）。
     * 削除直後にそのドメインからのアクセスは失効する（キャッシュなし）。
     * Delete a domain-access rule (owner only). Effect is immediate — callers
     * who relied on this rule lose access on their next request.
     */
    async deleteDomainAccess(
      noteId: string,
      accessId: string,
    ): Promise<{ removed: true; id: string }> {
      return req<{ removed: true; id: string }>(
        "DELETE",
        `/api/notes/${encodeURIComponent(noteId)}/domain-access/${encodeURIComponent(accessId)}`,
      );
    },

    // ── Onboarding ───────────────────────────────────────────────────────

    /**
     * POST /api/onboarding/complete — セットアップウィザード完了 API。
     * プロフィール更新・セットアップ完了フラグ・ウェルカムページ生成を 1 回で行う。
     *
     * Atomic wizard completion endpoint: updates profile, records
     * setup_completed_at, and creates the welcome page.
     */
    async completeOnboarding(body: {
      display_name: string;
      avatar_url?: string | null;
      locale: "ja" | "en";
    }): Promise<{
      setup_completed_at: string | null;
      welcome_page_id: string | null;
      welcome_page_created_at: string | null;
      welcome_page_locale: "ja" | "en" | null;
    }> {
      return req("POST", "/api/onboarding/complete", { body });
    },

    /**
     * GET /api/onboarding/status — 呼び出し元のオンボーディング状況。
     * セットアップ完了済みでウェルカムページ未生成ならバックグラウンドで生成をリトライする。
     *
     * Returns the caller's onboarding status. Triggers a login-time retry to
     * regenerate the welcome page when setup is complete but the page is
     * missing.
     */
    async getOnboardingStatus(): Promise<{
      setup_completed_at: string | null;
      welcome_page_id: string | null;
      welcome_page_created_at: string | null;
      home_slides_shown_at: string | null;
      auto_create_update_notice: boolean;
    }> {
      return req("GET", "/api/onboarding/status");
    },
  };
}

/**
 * API クライアント型。
 * API client type inferred from `createApiClient`.
 */
export type ApiClient = ReturnType<typeof createApiClient>;
