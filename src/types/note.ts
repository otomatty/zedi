/**
 *
 */
export type NoteVisibility = "private" | "public" | "unlisted" | "restricted";

/**
 *
 */
export type NoteEditPermission = "owner_only" | "members_editors" | "any_logged_in";

/**
 *
 */
export type NoteMemberRole = "viewer" | "editor";

/** 招待ステータス / Invitation status */
export type NoteMemberStatus = "pending" | "accepted" | "declined";

/**
 *
 */
export type NoteAccessRole = "owner" | "editor" | "viewer" | "guest" | "none";

/**
 *
 */
export interface Note {
  id: string;
  ownerUserId: string;
  title: string;
  visibility: NoteVisibility;
  editPermission: NoteEditPermission;
  isOfficial: boolean;
  /**
   * Whether this is the caller's default note (`<users.name>のノート`). Drives
   * the "マイノート" badge and the public/unlisted save warning dialog.
   * 既定ノート（マイノート）かどうか。バッジ表示や公開警告ダイアログで使う。
   */
  isDefault: boolean;
  viewCount: number;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

/**
 *
 */
export interface NoteSummary extends Note {
  role: NoteAccessRole;
  pageCount: number;
  memberCount: number;
}

/**
 * 招待状態（有効期限・最終送信・送信回数）。
 * Invitation state for UI badges (expiry, last-sent, send count).
 */
export interface NoteMemberInvitation {
  /** 有効期限（ミリ秒 epoch） / Expiration timestamp (ms since epoch) */
  expiresAt: number;
  /** 直近の送信日時（ミリ秒 epoch、未送信なら null） / Last-sent timestamp (ms since epoch), null if never sent */
  lastEmailSentAt: number | null;
  /** 送信回数 / Total number of sends */
  emailSendCount: number;
}

/**
 *
 */
export interface NoteMember {
  noteId: string;
  memberEmail: string;
  role: NoteMemberRole;
  status: NoteMemberStatus;
  invitedByUserId: string;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  /** 招待行が存在する場合の送信状況。accepted 後も情報は保持される可能性がある。 / Invitation row info when present. */
  invitation: NoteMemberInvitation | null;
}

/**
 *
 */
export interface NoteAccess {
  role: NoteAccessRole;
  visibility: NoteVisibility;
  editPermission: NoteEditPermission;
  canView: boolean;
  canEdit: boolean;
  canAddPage: boolean;
  canManageMembers: boolean;
  canDeletePage: (addedByUserId: string) => boolean;
}
