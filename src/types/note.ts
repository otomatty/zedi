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
