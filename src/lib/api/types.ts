/**
 * Request/response types for Zedi REST API (C1-4, C1-5, C1-6, C1-7).
 * Snake_case from API; client may use camelCase where noted.
 */

/** GET /api/sync/pages response. Timestamps are ISO8601 from server. */
export interface SyncPagesResponse {
  pages: SyncPageItem[];
  links: SyncLinkItem[];
  ghost_links: SyncGhostLinkItem[];
  server_time: string;
}

/**
 * `/api/sync/pages` 等が返すページ行。Issue #823 でデフォルトノートが導入され、
 * すべてのページは（自分のデフォルトノートを含む）いずれかのノートに所属する
 * ようになったため、`note_id` は常に非 null。Issue #825 で `Page.noteId` も
 * フロント型上 non-null に揃えた。
 *
 * Page row from `/api/sync/pages` and friends. After issue #823 every page
 * belongs to exactly one note (the caller's default note for legacy
 * "personal" pages), so `note_id` is always present. Issue #825 aligned the
 * frontend `Page.noteId` to the same non-null contract.
 */
export interface SyncPageItem {
  id: string;
  owner_id: string;
  note_id: string;
  source_page_id: string | null;
  title: string | null;
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * WikiLink / タググラフのリンク行。`/api/sync/pages` 応答内で使われる。
 * `link_type` は issue #725 Phase 1 で追加。未提供クライアント互換のため任意。
 *
 * Link row in the wiki/tag link graph returned by `/api/sync/pages`.
 * `link_type` was added in issue #725 Phase 1; optional so legacy clients
 * without the field still parse.
 */
export interface SyncLinkItem {
  source_id: string;
  target_id: string;
  link_type?: "wiki" | "tag";
  created_at: string;
}

/**
 * 未解決 WikiLink / タグ（ゴーストリンク）の行。`/api/sync/pages` で同期される。
 * Ghost-link row (unresolved WikiLink or tag) synced via `/api/sync/pages`.
 */
export interface SyncGhostLinkItem {
  link_text: string;
  source_page_id: string;
  link_type?: "wiki" | "tag";
  created_at: string;
  original_target_page_id?: string | null;
  original_note_id?: string | null;
}

/** POST /api/sync/pages body. */
export interface PostSyncPagesBody {
  pages: Array<{
    id: string;
    owner_id?: string;
    source_page_id?: string | null;
    title?: string | null;
    content_preview?: string | null;
    thumbnail_url?: string | null;
    source_url?: string | null;
    updated_at: string;
    is_deleted?: boolean;
  }>;
  links?: Array<{
    source_id: string;
    target_id: string;
    /**
     * `'wiki'` | `'tag'`。未指定はサーバー側で `'wiki'` にフォールバック
     * (issue #725 Phase 1)。Omit → server defaults to `'wiki'`.
     */
    link_type?: "wiki" | "tag";
    created_at?: string;
  }>;
  ghost_links?: Array<{
    link_text: string;
    source_page_id: string;
    /** 同上 / Same contract as above. */
    link_type?: "wiki" | "tag";
    created_at?: string;
    original_target_page_id?: string | null;
    original_note_id?: string | null;
  }>;
}

/** POST /api/sync/pages response. */
export interface PostSyncPagesResponse {
  server_time: string;
  conflicts: Array<{ id: string; server_updated_at: string }>;
}

/** GET /api/pages/:id/content response. */
export interface PageContentResponse {
  ydoc_state: string; // base64
  version: number;
  content_text?: string | null;
  updated_at?: string;
}

/** PUT /api/pages/:id/content body. */
export interface PutPageContentBody {
  ydoc_state: string; // base64
  content_text?: string;
  content_preview?: string;
  title?: string;
  expected_version?: number;
}

/** POST /api/pages body. */
export interface CreatePageBody {
  id?: string;
  title?: string;
  content_preview?: string;
  source_page_id?: string | null;
  thumbnail_url?: string | null;
  /**
   * `thumbnail_objects.id` linked to this page (used by Web Clipper). Lets
   * DELETE /api/pages/:id GC the S3 blob + DB row when the page is deleted.
   * Web Clipper で保存したサムネイルの thumbnail_objects.id。ページ削除時に
   * これを辿って S3 オブジェクトと DB 行を GC する。
   */
  thumbnail_object_id?: string | null;
  source_url?: string | null;
}

/** POST /api/pages response (same shape as SyncPageItem). */
export type CreatePageResponse = SyncPageItem;

/**
 * `POST /api/notes/:noteId/pages/copy-from-personal/:pageId` のレスポンス。
 * 個人ページを元にノートネイティブページを新規作成した結果を返す。
 * `page` には新ページの完全な行情報（`note_id` 含む）を含めるので、クライアント
 * はノート詳細の再取得なしに即座に UI を反映できる。
 *
 * Response from `POST /api/notes/:noteId/pages/copy-from-personal/:pageId`.
 * Returns the newly-created note-native page plus the full row (including
 * `note_id`) so clients can update caches without refetching the note detail.
 */
export interface CopyPersonalPageToNoteResponse {
  created: true;
  page_id: string;
  sort_order: number;
  page: SyncPageItem;
}

/**
 * `POST /api/notes/:noteId/pages/:pageId/copy-to-personal` のレスポンス。
 * ノートネイティブページから作成された個人ページの完全な行情報を返す。
 * クライアントはこれを使って IndexedDB / zustand の個人ページストアへ
 * 書き戻し、`/home` に即反映できる (issue #713 Phase 3 / Codex P1)。
 *
 * Response from `POST /api/notes/:noteId/pages/:pageId/copy-to-personal`.
 * Returns the full new personal page row so the client can write it through
 * to IndexedDB / zustand and show it on `/home` without a full sync.
 */
export interface CopyNotePageToPersonalResponse {
  created: true;
  page_id: string;
  page: SyncPageItem;
}

/**
 * GET /api/search?q=&scope=shared のレスポンス。
 *
 * Issue #823 でデフォルトノートが導入されてから、すべてのページは必ずいずれかの
 * ノートに所属する。共有検索でもこの不変条件は変わらないため、`note_id` は常に
 * 非 null。Issue #825 で型を non-null に揃えた。
 *
 * Response of GET /api/search?q=&scope=shared.
 *
 * After issue #823 every page belongs to exactly one note (the caller's
 * default note for legacy "personal" rows), so `note_id` is always present
 * even in shared search results. Issue #825 tightened the type accordingly.
 */
export interface SearchSharedResponse {
  results: Array<{
    id: string;
    note_id: string;
    owner_id: string;
    title: string | null;
    content_preview: string | null;
    thumbnail_url: string | null;
    source_url: string | null;
    updated_at: string;
  }>;
}

/**
 * `GET /api/notes/me` のレスポンス。呼び出し元のデフォルトノート（マイノート）を
 * 返す。フロントの `/notes/me` ランディングはこの `id` を使って
 * `/notes/:noteId` にリダイレクトする。Issue #823 / #825。
 *
 * Response of `GET /api/notes/me` — the caller's default note ("マイノート").
 * The `/notes/me` landing page reads `id` and redirects to `/notes/:noteId`.
 * See issues #823 and #825.
 */
export interface MyNoteResponse {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  edit_permission: string;
  is_official: boolean;
  is_default: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/** GET /api/notes response item (C3-9: role, page_count, member_count). Create/update return base fields only. */
export interface NoteListItem {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  edit_permission?: string;
  is_official?: boolean;
  /**
   * Whether this is the caller's default note. Surfaced to the frontend so
   * note settings can warn before flipping the default note to public/unlisted.
   * 既定ノート（マイノート）かどうか。公開警告ダイアログ判定に利用する。
   */
  is_default?: boolean;
  view_count?: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  role?: "owner" | "editor" | "viewer";
  page_count?: number;
  member_count?: number;
}

/** GET /api/notes/discover response. */
export interface DiscoverResponse {
  official: DiscoverNoteItem[];
  notes: DiscoverNoteItem[];
}

/**
 * `GET /api/notes/discover` のノート行。閲覧数・ページ数などの発見用メタ情報を含む。
 * Row in the `/api/notes/discover` response, carrying discover-oriented
 * metadata such as view count and page count.
 */
export interface DiscoverNoteItem {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  edit_permission: string;
  is_official: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  owner_display_name?: string | null;
  page_count: number;
}

/**
 * `GET /api/notes/:id` のレスポンス（"note shell"）。Issue #860 Phase 6 で
 * `pages[]` を撤去し、ノート属性と呼び出し元の解決ロールのみを返す形に
 * なった。ページ一覧は cursor pagination の `GET /api/notes/:noteId/pages`、
 * wiki link / AI chat scope のような全ページタイトルが必要な経路は
 * `GET /api/notes/:noteId/page-titles` を使う。
 *
 * `GET /api/notes/:id` response — the "note shell". Issue #860 Phase 6
 * removed the `pages[]` field entirely; the response now carries only note
 * attributes plus the caller's resolved role. Visible page lists fetch via
 * the cursor-paginated `/pages` endpoint, and full-set title consumers
 * fetch via `/page-titles`.
 */
export interface GetNoteResponse {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  edit_permission?: string;
  is_official?: boolean;
  /**
   * Whether this is the caller's default note. The settings page reads this to
   * gate the "公開化で個人メモが流出する可能性" warning dialog.
   * 既定ノートかどうか。設定画面で公開化警告ダイアログを出す判定に使う。
   */
  is_default?: boolean;
  view_count?: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  current_user_role: "owner" | "editor" | "viewer" | "guest";
}

/**
 * `GET /api/notes/:noteId/page-titles` のページ行（issue #860 Phase 6）。
 * wiki link 解決・AI chat scope sync・追加 dialog の重複判定など、
 * 「ノート全ページのタイトル」を完全集合として必要とする consumer 向けの
 * 軽量ペイロード。
 *
 * Page row from `GET /api/notes/:noteId/page-titles` (issue #860 Phase 6).
 * Lightweight payload for consumers that need the *complete* set of
 * page titles in a note: wiki-link resolution, AI-chat scope sync,
 * and add-dialog dedup.
 */
export interface NotePageTitleItem {
  id: string;
  title: string;
  is_deleted: boolean;
  updated_at: string;
}

/**
 * `GET /api/notes/:noteId/page-titles` のレスポンス。サーバ順
 * (`updated_at DESC, id DESC`) を維持したフラット配列を返す。
 *
 * `GET /api/notes/:noteId/page-titles` response. Returns a flat array
 * preserving the server order (`updated_at DESC, id DESC`).
 */
export interface NotePageTitleIndexResponse {
  items: NotePageTitleItem[];
}

/**
 * `GET /api/notes/:noteId/search` の結果行（issue #860 Phase 5）。
 * note-scoped 全文検索 (ILIKE) のヒット行で、`note_id` は呼び出し元が「ノート
 * ネイティブ (`note_id === noteId`) か旧リンクパス (`note_id === null`) か」
 * を区別するために残す。`content_text` は将来の snippet 生成用に確保している
 * 内部フィールド。
 *
 * Result row from `GET /api/notes/:noteId/search` (issue #860 Phase 5).
 * Note-scoped ILIKE hit. `note_id` is exposed so callers can distinguish
 * note-native pages from legacy linked-personal hits. `content_text` is
 * reserved for future server-side snippet generation.
 */
export interface NoteSearchResultItem {
  id: string;
  title: string | null;
  content_preview: string | null;
  updated_at: string;
  note_id: string | null;
  content_text: string | null;
}

/**
 * `GET /api/notes/:noteId/search` のレスポンス（issue #860 Phase 5 で
 * `next_cursor` 付きの cursor pagination に変更）。`next_cursor` が `null` で
 * 末尾を示す。
 *
 * Cursor-paginated response from `GET /api/notes/:noteId/search` (issue
 * #860 Phase 5 added the cursor). A `null` `next_cursor` marks the end.
 */
export interface NoteSearchResponse {
  results: NoteSearchResultItem[];
  next_cursor: string | null;
}

/**
 * `?include=` トークンで追加できるオプションフィールド（issue #860 Phase 1）。
 * `preview` は `content_preview`、`thumbnail` は `thumbnail_url` の同梱を要求する。
 *
 * Optional field tokens for `?include=` on `GET /api/notes/:noteId/pages`
 * (issue #860 Phase 1). `preview` toggles `content_preview` and `thumbnail`
 * toggles `thumbnail_url`.
 */
export type NotePageWindowInclude = "preview" | "thumbnail";

/**
 * `GET /api/notes/:noteId/pages` のページ行（keyset window）。`content_preview`
 * と `thumbnail_url` は `?include=` で要求された場合のみ非 null。
 *
 * Page summary row from `GET /api/notes/:noteId/pages`. `content_preview` /
 * `thumbnail_url` are populated only when the matching `?include=` token is set.
 */
export interface NotePageWindowItem {
  id: string;
  owner_id: string;
  note_id: string;
  source_page_id: string | null;
  title: string | null;
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * `GET /api/notes/:noteId/pages` の keyset cursor pagination レスポンス。
 * `next_cursor` が `null` の場合は末尾まで到達済み。
 *
 * Keyset cursor pagination response. A `null` `next_cursor` means the caller
 * has reached the end of the list.
 */
export interface NotePageWindowResponse {
  items: NotePageWindowItem[];
  next_cursor: string | null;
}

/** GET /api/pages/:id/snapshots response. */
export interface SnapshotListResponse {
  snapshots: SnapshotListItem[];
}

/** Snapshot list item (without ydoc_state). */
export interface SnapshotListItem {
  id: string;
  version: number;
  content_text: string | null;
  created_by: string | null;
  created_by_email: string | null;
  trigger: "auto" | "restore" | "pre-restore";
  created_at: string;
}

/** GET /api/pages/:id/snapshots/:snapshotId response. */
export interface SnapshotDetailResponse {
  id: string;
  version: number;
  ydoc_state: string; // base64
  content_text: string | null;
  created_by: string | null;
  created_by_email: string | null;
  trigger: "auto" | "restore" | "pre-restore";
  created_at: string;
}

/** POST /api/pages/:id/snapshots/:snapshotId/restore response. */
export interface RestoreSnapshotResponse {
  version: number;
  snapshot_id: string;
}

/**
 * 招待メールの送信状況（有効期限・最終送信日時・送信回数）。
 * Invitation email delivery state (expiry, last-sent timestamp, send count).
 */
export interface NoteInvitationInfo {
  /** 招待トークンの有効期限 / Token expiration timestamp (ISO 8601) */
  expiresAt: string;
  /** 直近の送信日時 / Timestamp of the most recent send (ISO 8601). null 初回送信前 */
  lastEmailSentAt: string | null;
  /** 送信回数（初回 + 再送の合計） / Total number of sends (initial + resends) */
  emailSendCount: number;
}

/** GET /api/notes/:id/members response item. */
export interface NoteMemberItem {
  note_id: string;
  member_email: string;
  role: string;
  status: "pending" | "accepted" | "declined";
  invited_by_user_id: string;
  created_at: string;
  updated_at: string;
  /** 招待情報（accepted 済みで招待行が無い場合などは null）。 / Invitation info (null when no row exists). */
  invitation?: NoteInvitationInfo | null;
}

/** POST /api/notes/:noteId/members/:email/resend response. */
export interface ResendInvitationResponse {
  resent: boolean;
}

/** GET /api/invite/:token response. */
export interface InvitationInfoResponse {
  noteId: string;
  noteTitle: string;
  inviterName: string;
  role: "viewer" | "editor";
  memberEmail: string;
  isExpired: boolean;
  isUsed: boolean;
}

/** POST /api/invite/:token/accept response. */
export interface AcceptInvitationResponse {
  noteId: string;
  role: string;
  status: "accepted";
}

/**
 * POST /api/invite/:token/email-link response.
 * 招待メール mismatch 時のマジックリンク送信結果。
 * Response for the invitation rescue magic-link send endpoint.
 */
export interface SendInvitationEmailLinkResponse {
  /** 送信を受理したか / Whether the send was accepted */
  sent: true;
  /** 送信先メールアドレス（招待先） / Recipient email (invited address) */
  memberEmail: string;
  /** 次回送信までの待機秒数（UI カウントダウン用）/ Seconds to wait before the next send (for countdown) */
  retryAfterSec: number;
}

// ── Invite Links (share links — epic #657 / issue #660) ────────────────────

/**
 * 共有リンクの状態。`valid` 以外は UI でブロッキングメッセージを表示する。
 * Share-link lifecycle status. Anything but `valid` triggers a blocking UI message.
 */
export type InviteLinkStatus = "valid" | "revoked" | "expired" | "exhausted";

/** GET /api/invite-links/:token response — プレビュー情報 / Preview info. */
export interface InviteLinkPreviewResponse {
  status: InviteLinkStatus;
  noteId: string;
  noteTitle: string;
  inviterName: string;
  role: "viewer" | "editor";
  expiresAt: string;
  /** 残り利用可能回数（null = 無制限） / Remaining uses (null for unlimited) */
  remainingUses: number | null;
  maxUses: number | null;
  usedCount: number;
  requireSignIn: boolean;
  label: string | null;
}

/** POST /api/invite-links/:token/redeem response — 受諾成功時 / On successful redeem. */
export interface InviteLinkRedeemResponse {
  noteId: string;
  role: "viewer" | "editor";
  isNewRedemption: boolean;
  alreadyMember: boolean;
  status: "accepted";
}

/** POST /api/notes/:noteId/invite-links body — 発行パラメータ / Creation params. */
export interface CreateInviteLinkBody {
  /**
   * リンク経由で付与するロール。Phase 5 (#662) 以降は `editor` も指定可能。
   * Role granted through the link; `editor` is permitted from Phase 5 (#662).
   */
  role?: "viewer" | "editor";
  expiresInMs?: number;
  maxUses?: number | null;
  label?: string | null;
  /**
   * サインイン必須フラグ。サーバーは viewer では `false` を拒否し、editor では
   * 黙って `true` に上書きするため、API が受け付ける値は実質 `true` のみ。型を
   * `true` リテラルに絞ることでクライアント側のバグをコンパイル時に検出する
   * (#676 review coderabbit)。省略可 — 省略時も `true` として扱われる。
   *
   * Sign-in requirement. The server rejects `false` for viewer links and
   * silently coerces it to `true` for editor links, so the only supported
   * value is literally `true`. Narrowed from `boolean` to catch client bugs
   * at compile time (#676 review coderabbit). May be omitted.
   */
  requireSignIn?: true;
}

/** Invite link row (shared by list and create responses). */
export interface InviteLinkRow {
  id: string;
  note_id: string;
  token: string;
  role: "viewer" | "editor";
  created_by_user_id: string;
  expires_at: string;
  max_uses: number | null;
  used_count: number;
  revoked_at: string | null;
  require_sign_in: boolean;
  label: string | null;
  created_at: string;
}

// ── Domain access (epic #657 / issue #663) ────────────────────────────────

/**
 * `note_domain_access` 行の API 表現。サーバーが snake_case で返す。
 * API representation of a `note_domain_access` row (snake_case from server).
 */
export interface DomainAccessRow {
  id: string;
  note_id: string;
  domain: string;
  role: "viewer" | "editor";
  created_by_user_id: string;
  /** v1 では常に null（v2 で DNS-TXT 検証時に設定）/ Always null in v1; reserved for DNS-TXT verification in v2. */
  verified_at: string | null;
  created_at: string;
}

/**
 * `POST /api/notes/:noteId/domain-access` のリクエストボディ。
 * Request body for creating a domain-access rule.
 */
export interface CreateDomainAccessBody {
  /** 小文字、`@` なし。サーバーが正規化・フリーメール拒否を行う / Lowercased, no leading `@`; server normalises and rejects free-email providers. */
  domain: string;
  /** ロール（既定: `viewer`）/ Role (default: `viewer`). */
  role?: "viewer" | "editor";
}
