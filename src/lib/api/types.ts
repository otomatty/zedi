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
 *
 */
export interface SyncPageItem {
  id: string;
  owner_id: string;
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
 *
 */
export interface SyncLinkItem {
  source_id: string;
  target_id: string;
  created_at: string;
}

/**
 *
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
}

/** PUT /api/pages/:id/content body. */
export interface PutPageContentBody {
  ydoc_state: string; // base64
  content_text?: string;
  version?: number;
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

/** GET /api/search?q=&scope=shared response. */
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
 *
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
