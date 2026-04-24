/**
 * ZediClient — MCP ツールが Zedi REST API を呼ぶための抽象インターフェース
 *
 * - すべてのメソッドは server/api の HTTP エンドポイントに対応する
 * - 戻り値は API レスポンス JSON をそのまま (型のみ宣言)
 * - エラー時は `ZediApiError` を throw する (実装側責務)
 *
 * Abstract client interface used by MCP tools. Mocked in unit tests; HttpZediClient implements it.
 */

// ── User ────────────────────────────────────────────────────────────────────

/** 現在認証中のユーザー情報。Current authenticated user. */
export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

// ── Pages ───────────────────────────────────────────────────────────────────

/** ページ作成の入力 / Input for creating a new page. */
export interface CreatePageInput {
  title?: string;
  content_preview?: string;
  source_page_id?: string;
  source_url?: string;
  thumbnail_url?: string | null;
}

/** ページ作成・取得の戻り値 / Page metadata returned by create/get. */
export interface PageRow {
  id: string;
  owner_id: string;
  title: string | null;
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  source_page_id: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/** ページ一覧アイテム / Page list item returned by `GET /api/pages`. */
export interface PageListItem {
  id: string;
  title: string | null;
  content_preview: string | null;
  updated_at: string;
}

/** `listPages` の入力 / Input for {@link ZediClient.listPages}. */
export interface ListPagesParams {
  /** 上限件数 (1-100, デフォルト 20) / Page size (1-100, default 20). */
  limit?: number;
  /** 取得開始位置 (>= 0, デフォルト 0) / Result offset (>= 0, default 0). */
  offset?: number;
  /** スコープ。"own" は自分のページのみ、"shared" は共有ノート経由で参加しているページも含む。
   *  Scope: "own" lists only own pages; "shared" also includes pages from notes the caller is a member of. */
  scope?: "own" | "shared";
}

/** ページ本文 (Y.Doc) / Page Y.Doc content. */
export interface PageContent {
  ydoc_state: string;
  version: number;
  content_text?: string | null;
  updated_at?: string;
}

/** ページ本文更新の入力 / Input for updating page content. */
export interface UpdatePageContentInput {
  ydoc_state: string;
  expected_version: number;
  content_text?: string;
  content_preview?: string;
  title?: string;
}

// ── Notes ───────────────────────────────────────────────────────────────────

/** ノートの可視性 / Note visibility. */
export type NoteVisibility = "private" | "public" | "unlisted" | "restricted";

/** ノートの編集権限 / Note edit permission. */
export type NoteEditPermission = "owner_only" | "members_editors" | "any_logged_in";

/** ノート作成入力 / Input for creating a note. */
export interface CreateNoteInput {
  title?: string;
  visibility?: NoteVisibility;
  edit_permission?: NoteEditPermission;
  is_official?: boolean;
}

/** ノート更新入力 / Input for updating a note. */
export interface UpdateNoteInput {
  title?: string;
  visibility?: NoteVisibility;
  edit_permission?: NoteEditPermission;
  is_official?: boolean;
}

/** ノート行 / Note row returned by API. */
export interface NoteRow {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: NoteVisibility;
  edit_permission: NoteEditPermission;
  is_official: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

/** ノート一覧アイテム (役割と件数つき) / Note list item with role and counts. */
export interface NoteListItem extends NoteRow {
  role: "owner" | "editor" | "viewer";
  page_count: number;
  member_count: number;
}

// ── Note pages ──────────────────────────────────────────────────────────────

/** ノート内のページ追加入力 / Input for adding a page to a note. */
export interface AddPageToNoteInput {
  page_id?: string;
  title?: string;
  source_url?: string;
}

// ── Note members ────────────────────────────────────────────────────────────

/** ノートメンバー役割 / Note member role. */
export type NoteMemberRole = "viewer" | "editor";

/** メンバー追加入力 / Input for adding a member. */
export interface AddNoteMemberInput {
  email: string;
  role: NoteMemberRole;
}

// ── Search ──────────────────────────────────────────────────────────────────

/** 検索結果アイテム / Search result row. */
export interface SearchResultItem {
  id: string;
  title: string | null;
  content_preview: string | null;
  updated_at: string;
  content_text?: string | null;
  /**
   * スコープ判定用。`null` なら個人ページ、文字列ならノート ID を表す。
   * Scope discriminator: `null` for personal pages, string for note-native pages.
   * See issue #718 Phase 5.
   */
  note_id?: string | null;
}

/**
 * `search` の入力 / Input for {@link ZediClient.search}.
 *
 * `noteId` を指定すると Phase 5-2 で追加された `/api/notes/:noteId/search` を叩き、
 * そのノートに紐づくページのみを返す。このとき `scope` は無視される。`noteId` 省略時は
 * 個人スコープ (`own`) または共有スコープ (`shared`) の `/api/search` を叩く。
 *
 * When `noteId` is set, the note-scoped endpoint added in Phase 5-2 is used and
 * `scope` is ignored. Without `noteId`, the shared `/api/search` endpoint is
 * used with the provided `scope` ("own" or "shared").
 */
export interface SearchParams {
  /** 検索文字列 / Search query. */
  query: string;
  /** 全体スコープ。`noteId` 指定時は無視される。
   *  Global scope; ignored when `noteId` is set. */
  scope?: "own" | "shared";
  /** 上限件数 (1〜100, デフォルト 20)。 Result limit (1..100, default 20). */
  limit?: number;
  /** ノート ID。指定時はそのノートに属するページのみが返る。
   *  Note ID; when set, restricts results to pages belonging to that note. */
  noteId?: string;
}

// ── Clip ────────────────────────────────────────────────────────────────────

/** Clip 結果 / Clip result. */
export interface ClipResult {
  page_id: string;
  title: string;
  thumbnail_url?: string;
}

// ── Client interface ────────────────────────────────────────────────────────

/**
 * Zedi REST API クライアント抽象。
 * MCP ツールはこのインターフェースにのみ依存し、テストではモック化する。
 *
 * Abstract client used by MCP tools; mocked in tests, implemented by HttpZediClient at runtime.
 */
export interface ZediClient {
  /** 現在のユーザー情報を取得する。Get current user. */
  getCurrentUser(): Promise<CurrentUser>;

  // Pages
  /**
   * 自分のページ (own) または共有を含むページ (shared) を更新日時降順で一覧する。
   * List the caller's pages — own only or own + shared via notes — ordered by `updated_at DESC`.
   */
  listPages(params?: ListPagesParams): Promise<PageListItem[]>;
  /** ページ本文 (Y.Doc) を取得する。Get page Y.Doc content. */
  getPageContent(pageId: string): Promise<PageContent>;
  /** 新規ページを作成する。Create a new page. */
  createPage(input: CreatePageInput): Promise<PageRow>;
  /** ページ本文を更新する (楽観的ロック)。Update page content with optimistic lock. */
  updatePageContent(pageId: string, input: UpdatePageContentInput): Promise<{ version: number }>;
  /** ページを論理削除する。Soft-delete a page. */
  deletePage(pageId: string): Promise<{ id: string; deleted: boolean }>;

  // Notes
  /** ノート一覧を取得する (own + shared)。List notes. */
  listNotes(): Promise<NoteListItem[]>;
  /** ノート詳細を取得する。Get note detail. */
  getNote(noteId: string): Promise<unknown>;
  /** ノートを作成する。Create note. */
  createNote(input: CreateNoteInput): Promise<NoteRow>;
  /** ノートを更新する。Update note. */
  updateNote(noteId: string, input: UpdateNoteInput): Promise<NoteRow>;
  /** ノートを論理削除する。Soft-delete note. */
  deleteNote(noteId: string): Promise<{ deleted: boolean }>;

  // Note pages
  /** ノートにページを追加する。Add a page to note. */
  addPageToNote(noteId: string, input: AddPageToNoteInput): Promise<unknown>;
  /** ノートからページを取り除く。Remove page from note. */
  removePageFromNote(noteId: string, pageId: string): Promise<unknown>;
  /** ノート内のページ順を並び替える。Reorder pages in a note. */
  reorderNotePages(noteId: string, pageIds: string[]): Promise<unknown>;
  /** ノート内のページ一覧。List note pages. */
  listNotePages(noteId: string): Promise<unknown>;

  // Note members
  /** ノートのメンバー一覧。List note members. */
  listNoteMembers(noteId: string): Promise<unknown>;
  /** ノートにメンバーを追加する。Add note member. */
  addNoteMember(noteId: string, input: AddNoteMemberInput): Promise<unknown>;
  /** ノートメンバーの役割を更新する。Update note member role. */
  updateNoteMember(noteId: string, email: string, role: NoteMemberRole): Promise<unknown>;
  /** ノートからメンバーを取り除く。Remove note member. */
  removeNoteMember(noteId: string, email: string): Promise<unknown>;

  // Search
  /**
   * 全文検索を行う。
   *
   * `params.noteId` を指定するとノートスコープ検索 (`/api/notes/:noteId/search`) を
   * 使い、そのノート配下のページのみが返る。未指定の場合は `scope`（既定 `own`、
   * `shared` も指定可）で `/api/search` を叩く。結果には必ず `note_id` が含まれる
   * ので、呼び出し側は個人ページとノートネイティブページを判別できる。
   *
   * Full-text search. When `params.noteId` is provided the note-scoped endpoint
   * is used and results are restricted to pages of that note; otherwise the
   * shared endpoint is used with the given `scope` (default `own`). Results
   * always include `note_id` so callers can distinguish personal from
   * note-native pages.
   */
  search(params: SearchParams): Promise<SearchResultItem[]>;

  // Clip
  /** URL をクリップしてページを生成する。Clip a URL into a new page. */
  clipUrl(url: string): Promise<ClipResult>;
}
