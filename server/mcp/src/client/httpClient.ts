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
  UpdatePageContentInput,
  CreateNoteInput,
  UpdateNoteInput,
  NoteRow,
  NoteListItem,
  AddPageToNoteInput,
  AddNoteMemberInput,
  NoteMemberRole,
  SearchResultItem,
  ClipResult,
} from "./ZediClient.js";

/** HttpZediClient のコンストラクタオプション / Options for HttpZediClient. */
export interface HttpZediClientOptions {
  /** Zedi API の baseUrl。末尾スラッシュは正規化される。 */
  baseUrl: string;
  /** MCP JWT。`Authorization: Bearer ...` に付与される。 */
  token: string;
  /** テスト用 fetch 注入。省略時は globalThis.fetch を使用。 */
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
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
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
      throw new ZediApiError(res.status, message, parsed);
    }

    return parsed as T;
  }

  // ── User ─────────────────────────────────────────────────────────────────

  /** {@inheritDoc ZediClient.getCurrentUser} */
  getCurrentUser(): Promise<CurrentUser> {
    return this.request<CurrentUser>("GET", "/api/users/me");
  }

  // ── Pages ────────────────────────────────────────────────────────────────

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
  async search(
    query: string,
    scope: "own" | "shared" = "own",
    limit = 20,
  ): Promise<SearchResultItem[]> {
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
