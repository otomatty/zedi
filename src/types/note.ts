export type NoteVisibility = "private" | "public" | "unlisted" | "restricted";

export type NoteMemberRole = "viewer" | "editor";

export type NoteAccessRole = "owner" | "editor" | "viewer" | "guest" | "none";

export interface Note {
  id: string;
  ownerUserId: string;
  title: string;
  visibility: NoteVisibility;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

export interface NoteSummary extends Note {
  role: NoteAccessRole;
  pageCount: number;
  memberCount: number;
}

export interface NoteMember {
  noteId: string;
  memberEmail: string;
  role: NoteMemberRole;
  invitedByUserId: string;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

export interface NoteAccess {
  role: NoteAccessRole;
  visibility: NoteVisibility;
  canView: boolean;
  canEdit: boolean;
  canManageMembers: boolean;
}
