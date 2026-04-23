/**
 * ノート API の型定義
 */
import type { Note } from "../../schema/index.js";

// ── Domain Types ────────────────────────────────────────────────────────────

/**
 * ノートに対する呼び出し元のロール。`null` は閲覧権なし。
 * Caller's resolved role on a note. `null` = no access.
 */
export type NoteRole = "owner" | "editor" | "viewer" | "guest" | null;
/**
 * ノートの公開範囲（`notes.visibility`）。
 * Note visibility value (`notes.visibility`).
 */
export type NoteVisibility = Note["visibility"];
/**
 * ノートの編集権限設定（`notes.edit_permission`）。
 * Note edit-permission setting (`notes.edit_permission`).
 */
export type NoteEditPermission = Note["editPermission"];
/**
 * ノートメンバーのロール。招待・権限管理で使う。
 * Note-member role used by invitation / permission management.
 */
export type NoteMemberRole = "viewer" | "editor";

// ── API Response Interfaces ─────────────────────────────────────────────────

/**
 * ノートの共通フィールド（`GET /api/notes` 系と `GET /api/notes/:id` で共有）。
 * Shared note fields across `GET /api/notes` list and `/api/notes/:id`.
 */
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

/**
 * `GET /api/notes` のリスト項目。呼び出し元のロールやページ / メンバー数など
 * 一覧表示用のメタ情報を含む。
 * List item returned by `GET /api/notes`, enriched with the caller's role and
 * page / member counts for UI list rendering.
 */
export interface NoteListApiItem extends NoteApiFields {
  role: "owner" | NoteMemberRole;
  page_count: number;
  member_count: number;
}

/**
 * `GET /api/notes/:id` のページ行。`note_id` が NULL なら個人ページがこのノート
 * にリンクされているだけ、値ありならノートネイティブページ。
 * Page row returned inside `GET /api/notes/:id`. `note_id` = null → linked
 * personal page; non-null → note-native page.
 */
export interface NotePageApiItem {
  id: string;
  owner_id: string;
  /**
   * ページのスコープ。`null` なら個人ページがこのノートに「リンク」されている
   * だけ（所有者の /home にも現れる）。値ありなら、このノートに所属するノート
   * ネイティブページ (`pages.note_id = noteId`)。クライアントはこれを見て
   * 「個人に取り込み」のような note-native 専用アクションを出し分ける。
   * Issue #713 Phase 3。
   *
   * Page scope. `null` means the page is a linked personal page (still on the
   * owner's /home). A non-null value means a note-native page owned by this
   * note (`pages.note_id = noteId`). Clients use this to gate note-native-only
   * actions such as "copy to personal". See issue #713 Phase 3.
   */
  note_id: string | null;
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

/**
 * `GET /api/notes/:id` のレスポンス。呼び出し元の解決ロールと、このノート
 * 表示に含まれる全ページ（リンクされた個人ページ + ノートネイティブ）を含む。
 * `note_id` が NULL の行はリンクされた個人ページ（所有者の /home にも出る）、
 * 値ありの行はこのノートに所属するノートネイティブページ。
 * `GET /api/notes/:id` response: caller's resolved role plus every page shown
 * in this note view (linked personal + note-native). A `note_id` of `null`
 * means a linked personal page (also on the owner's `/home`); a non-null
 * value means a note-native page owned by this note.
 */
export interface NoteDetailApiResponse extends NoteApiFields {
  current_user_role: NonNullable<NoteRole>;
  pages: NotePageApiItem[];
}

/**
 * `GET /api/notes/discover` のノート行（発見タブ用のサマリ）。
 * Note row for the discover tab returned by `GET /api/notes/discover`.
 */
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

/**
 * `GET /api/notes/discover` のレスポンス。公式ノートとそれ以外に分けて返す。
 * `GET /api/notes/discover` response, split into official and community notes.
 */
export interface DiscoverApiResponse {
  official: DiscoverApiItem[];
  notes: DiscoverApiItem[];
}
