/**
 * ノート API の型定義
 */
import type { Note } from "../../schema/index.js";

// ── Domain Types ────────────────────────────────────────────────────────────

export type NoteRole = "owner" | "editor" | "viewer" | "guest" | null;
export type NoteVisibility = Note["visibility"];
export type NoteEditPermission = Note["editPermission"];
export type NoteMemberRole = "viewer" | "editor";

// ── API Response Interfaces ─────────────────────────────────────────────────

export interface NoteApiFields {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: NoteVisibility;
  edit_permission: NoteEditPermission;
  is_official: boolean;
  view_count: number;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}

export interface NoteListApiItem extends NoteApiFields {
  role: "owner" | NoteMemberRole;
  page_count: number;
  member_count: number;
}

export interface NotePageApiItem {
  id: string;
  owner_id: string;
  source_page_id: string | null;
  title: string | null;
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
  sort_order: number;
  added_by_user_id: string;
  added_at: Date;
}

export interface NoteDetailApiResponse extends NoteApiFields {
  current_user_role: NonNullable<NoteRole>;
  pages: NotePageApiItem[];
}

export interface DiscoverApiItem {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: NoteVisibility;
  edit_permission: NoteEditPermission;
  is_official: boolean;
  view_count: number;
  created_at: Date;
  updated_at: Date;
  owner_display_name: string | null;
  owner_avatar_url: string | null;
  page_count: number;
}

export interface DiscoverApiResponse {
  official: DiscoverApiItem[];
  notes: DiscoverApiItem[];
}
