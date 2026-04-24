/**
 * HttpZediClient — Zedi REST API への fetch ベースクライアント実装
 *
 * - すべてのリクエストに `Authorization: Bearer <token>` を付与する
 * - 4xx / 5xx 応答は `ZediApiError` に正規化する
 * - ネットワーク失敗 (fetch reject) は `ZediApiError(status=0)` に正規化する
 * - テスト可能性のため `fetch` 実装を DI できる
 *
 * fetch-based implementation of `ZediClient` for the Zedi REST API.
 */
import { ZediApiError } from "./errors.js";
import type {
  ZediClient,
  CurrentUser,
  CreatePageInput,
  PageRow,
  PageContent,
  PageListItem,
  ListPagesParams,
  UpdatePageContentInput,
  CreateNoteInput,
  UpdateNoteInput,
  NoteRow,
  NoteListItem,
  AddPageToNoteInput,
  AddNoteMemberInput,
  NoteMemberRole,
  SearchParams,
  SearchResultItem,
  ClipResult,
} from "./ZediClient.js";

/**
 * 429 応答から再試行秒数を取り出す (ヘッダ優先、次に JSON 本文)。
 * Extracts a retry-after value in seconds from a 429 response.
 */
function extractRetryAfter(res: Response, parsed: unknown): number | null {
  const header = res.headers.get("Retry-After");
  if (header) {
    // RFC 7231: HTTP-date or delta-seconds. 秒で来ているときだけ採用する。
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  }
  if (parsed && typeof parsed === "object" && "retry_after" in parsed) {
    const raw = (parsed as { retry_after?: unknown }).retry_after;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
  }
  return null;
}

/** HttpZediClient のコンストラクタオプション / Options for HttpZediClient. */
export interface HttpZediClientOptions {
  /** Zedi API の baseUrl。末尾スラッシュは正規化される。 Base URL for the Zedi API; trailing slashes are normalized. */
  baseUrl: string;
  /** MCP JWT。`Authorization: Bearer ...` に付与される。 MCP JWT attached as `Authorization: Bearer ...`. */
  token: string;
  /** テスト用 fetch 注入。省略時は globalThis.fetch を使用。 Optional fetch implementation for tests; defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

/** HttpZediClient 本体 / Main HttpZediClient class. */
export class HttpZediClient implements ZediClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  /**
   * 新しい HttpZediClient を生成する。Constructs a new HttpZediClient.
   *
   * @param opts - baseUrl, token, optional fetch を含むオプション。
   */
  constructor(opts: HttpZediClientOptions) {
    // 末尾のスラッシュを除去する。ReDoS（CodeQL `js/polynomial-redos`）を避けるため、
    // `String.prototype.replace` と正規表現ではなく手動で切り詰める。
    // Strip trailing slashes manually instead of via a regex, to avoid the
    // polynomial ReDoS pattern flagged by CodeQL (`js/polynomial-redos`).
    let normalizedBaseUrl = opts.baseUrl;
    while (normalizedBaseUrl.endsWith("/")) {
      normalizedBaseUrl = normalizedBaseUrl.slice(0, -1);
    }
    this.baseUrl = normalizedBaseUrl;
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  // ── core request helper ──────────────────────────────────────────────────

  /**
   * 共通の HTTP リクエスト処理。エラーは ZediApiError に正規化する。
   * Internal request helper that normalizes errors into ZediApiError.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, init);
    } catch (err) {
      const message = err instanceof Error ? err.message : "network error";
      throw new ZediApiError(0, message);
    }

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const message =
        (parsed && typeof parsed === "object" && "message" in parsed
          ? String((parsed as { message: unknown }).message)
          : null) ?? (typeof parsed === "string" ? parsed : `HTTP ${res.status}`);
      const retryAfterSec = res.status === 429 ? extractRetryAfter(res, parsed) : null;
      throw new ZediApiError(res.status, message, parsed, retryAfterSec);
    }

    return parsed as T;
  }

  // ── User ─────────────────────────────────────────────────────────────────

  /** {@inheritDoc ZediClient.getCurrentUser} */
  getCurrentUser(): Promise<CurrentUser> {
    return this.request<CurrentUser>("GET", "/api/users/me");
  }

  // ── Pages ────────────────────────────────────────────────────────────────

  /** {@inheritDoc ZediClient.listPages} */
  async listPages(params: ListPagesParams = {}): Promise<PageListItem[]> {
    const { limit = 20, offset = 0, scope = "own" } = params;
    const result = await this.request<{ pages: PageListItem[] }>("GET", "/api/pages", undefined, {
      limit,
      offset,
      scope,
    });
    return result.pages ?? [];
  }

  /** {@inheritDoc ZediClient.getPageContent} */
  getPageContent(pageId: string): Promise<PageContent> {
    return this.request<PageContent>("GET", `/api/pages/${encodeURIComponent(pageId)}/content`);
  }

  /** {@inheritDoc ZediClient.createPage} */
  createPage(input: CreatePageInput): Promise<PageRow> {
    return this.request<PageRow>("POST", "/api/pages", input);
  }

  /** {@inheritDoc ZediClient.updatePageContent} */
  updatePageContent(pageId: string, input: UpdatePageContentInput): Promise<{ version: number }> {
    return this.request<{ version: number }>(
      "PUT",
      `/api/pages/${encodeURIComponent(pageId)}/content`,
      input,
    );
  }

  /** {@inheritDoc ZediClient.deletePage} */
  deletePage(pageId: string): Promise<{ id: string; deleted: boolean }> {
    return this.request<{ id: string; deleted: boolean }>(
      "DELETE",
      `/api/pages/${encodeURIComponent(pageId)}`,
    );
  }

  // ── Notes ────────────────────────────────────────────────────────────────

  /** {@inheritDoc ZediClient.listNotes} */
  listNotes(): Promise<NoteListItem[]> {
    return this.request<NoteListItem[]>("GET", "/api/notes");
  }

  /** {@inheritDoc ZediClient.getNote} */
  getNote(noteId: string): Promise<unknown> {
    return this.request("GET", `/api/notes/${encodeURIComponent(noteId)}`);
  }

  /** {@inheritDoc ZediClient.createNote} */
  createNote(input: CreateNoteInput): Promise<NoteRow> {
    return this.request<NoteRow>("POST", "/api/notes", input);
  }

  /** {@inheritDoc ZediClient.updateNote} */
  updateNote(noteId: string, input: UpdateNoteInput): Promise<NoteRow> {
    return this.request<NoteRow>("PUT", `/api/notes/${encodeURIComponent(noteId)}`, input);
  }

  /** {@inheritDoc ZediClient.deleteNote} */
  deleteNote(noteId: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>("DELETE", `/api/notes/${encodeURIComponent(noteId)}`);
  }

  // ── Note pages ───────────────────────────────────────────────────────────

  /** {@inheritDoc ZediClient.addPageToNote} */
  addPageToNote(noteId: string, input: AddPageToNoteInput): Promise<unknown> {
    return this.request("POST", `/api/notes/${encodeURIComponent(noteId)}/pages`, input);
  }

  /** {@inheritDoc ZediClient.removePageFromNote} */
  removePageFromNote(noteId: string, pageId: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/notes/${encodeURIComponent(noteId)}/pages/${encodeURIComponent(pageId)}`,
    );
  }

  /** {@inheritDoc ZediClient.reorderNotePages} */
  reorderNotePages(noteId: string, pageIds: string[]): Promise<unknown> {
    return this.request("PUT", `/api/notes/${encodeURIComponent(noteId)}/pages`, {
      page_ids: pageIds,
    });
  }

  /** {@inheritDoc ZediClient.listNotePages} */
  listNotePages(noteId: string): Promise<unknown> {
    return this.request("GET", `/api/notes/${encodeURIComponent(noteId)}/pages`);
  }

  // ── Note members ─────────────────────────────────────────────────────────

  /** {@inheritDoc ZediClient.listNoteMembers} */
  listNoteMembers(noteId: string): Promise<unknown> {
    return this.request("GET", `/api/notes/${encodeURIComponent(noteId)}/members`);
  }

  /** {@inheritDoc ZediClient.addNoteMember} */
  addNoteMember(noteId: string, input: AddNoteMemberInput): Promise<unknown> {
    return this.request("POST", `/api/notes/${encodeURIComponent(noteId)}/members`, input);
  }

  /** {@inheritDoc ZediClient.updateNoteMember} */
  updateNoteMember(noteId: string, email: string, role: NoteMemberRole): Promise<unknown> {
    return this.request(
      "PUT",
      `/api/notes/${encodeURIComponent(noteId)}/members/${encodeURIComponent(email)}`,
      { role },
    );
  }

  /** {@inheritDoc ZediClient.removeNoteMember} */
  removeNoteMember(noteId: string, email: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/notes/${encodeURIComponent(noteId)}/members/${encodeURIComponent(email)}`,
    );
  }

  // ── Search ───────────────────────────────────────────────────────────────

  /** {@inheritDoc ZediClient.search} */
  async search(params: SearchParams): Promise<SearchResultItem[]> {
    const { query, noteId, scope = "own", limit = 20 } = params;

    // `noteId` 指定時は Phase 5-2 の note-scoped エンドポイントを叩く。`scope` は
    // 意味を持たないので送らない（サーバー側もノート配下の権限チェックのみ実施）。
    // When `noteId` is set, hit the Phase 5-2 note-scoped endpoint. `scope` is
    // meaningless here and is intentionally not forwarded.
    if (noteId) {
      const result = await this.request<{ results: SearchResultItem[] }>(
        "GET",
        `/api/notes/${encodeURIComponent(noteId)}/search`,
        undefined,
        { q: query, limit },
      );
      return result.results ?? [];
    }

    const result = await this.request<{ results: SearchResultItem[] }>(
      "GET",
      "/api/search",
      undefined,
      { q: query, scope, limit },
    );
    return result.results ?? [];
  }

  // ── Clip ─────────────────────────────────────────────────────────────────

  /** {@inheritDoc ZediClient.clipUrl} */
  clipUrl(url: string): Promise<ClipResult> {
    return this.request<ClipResult>("POST", "/api/mcp/clip", { url });
  }
}
