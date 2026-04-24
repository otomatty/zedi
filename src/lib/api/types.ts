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
 * `/api/sync/pages` etc. が返すページ行。`note_id` が `null` または未指定の場合は
 * 個人ページ（issue #713）。GET `/api/sync/pages` は個人ページのみを返すため
 * 実運用では常に `null` だが、新規エンドポイントでも同じ型を再利用できるよう
 * 任意フィールドとして表現している。
 *
 * Page row from `/api/sync/pages` and friends. `note_id` `null` or missing
 * means a personal page (issue #713). GET `/api/sync/pages` only ever returns
 * personal pages, but the field is optional so the same type can describe
 * note-native rows from future endpoints.
 */
export interface SyncPageItem {
  id: string;
  owner_id: string;
  note_id?: string | null;
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
 * WikiLink グラフのリンク行。`/api/sync/pages` 応答内で使われる。
 * Link row in the wiki-link graph, returned by `/api/sync/pages`.
 */
export interface SyncLinkItem {
  source_id: string;
  target_id: string;
  created_at: string;
}

/**
 * 未解決 WikiLink（ゴーストリンク）の行。`/api/sync/pages` で同期される。
 * Ghost-link (unresolved WikiLink) row synced via `/api/sync/pages`.
 */
export interface SyncGhostLinkItem {
  link_text: string;
  source_page_id: string;
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
  links?: Array<{ source_id: string; target_id: string; created_at?: string }>;
  ghost_links?: Array<{
    link_text: string;
    source_page_id: string;
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
 * `note_id` は個人ページ (`note_id IS NULL`) も結果に含まれ得るため null になり得る
 * (Issue #718 Phase 5-1)。呼び出し側はノートネイティブと個人を区別する必要がある場合
 * このフィールドで判定する。
 *
 * Response of GET /api/search?q=&scope=shared.
 *
 * `note_id` may be null because personal pages (`note_id IS NULL`) can also
 * appear in shared search results (Issue #718 Phase 5-1). Callers that need to
 * distinguish note-native from personal pages should branch on this field.
 */
export interface SearchSharedResponse {
  results: Array<{
    id: string;
    note_id: string | null;
    owner_id: string;
    title: string | null;
    content_preview: string | null;
    thumbnail_url: string | null;
    source_url: string | null;
    updated_at: string;
  }>;
}

/** GET /api/notes response item (C3-9: role, page_count, member_count). Create/update return base fields only. */
export interface NoteListItem {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  edit_permission?: string;
  is_official?: boolean;
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

/** GET /api/notes/:id response. */
export interface GetNoteResponse {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  edit_permission?: string;
  is_official?: boolean;
  view_count?: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  current_user_role: "owner" | "editor" | "viewer" | "guest";
  pages: Array<{
    id: string;
    owner_id: string;
    /**
     * ページのスコープ。`null` ならこのノートに「リンク」されているだけの個人
     * ページ（所有者の /home にも現れる）、値ありならこのノートに所属する
     * ノートネイティブページ。クライアントはこれを見て note-native 限定の
     * アクション（例: 「個人に取り込み」）を出し分ける。Issue #713 Phase 3。
     *
     * Page scope. `null` → a linked personal page (also visible on the
     * owner's /home). A non-null value → a note-native page owned by this
     * note. Clients gate note-native-only actions such as "copy to personal"
     * on this. See issue #713 Phase 3.
     */
    note_id: string | null;
    source_page_id: string | null;
    title: string | null;
    content_preview: string | null;
    thumbnail_url: string | null;
    source_url: string | null;
    created_at: string;
    updated_at: string;
    is_deleted: boolean;
    sort_order: number;
    added_by_user_id: string;
    added_at: string;
  }>;
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
