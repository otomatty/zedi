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
  /**
   * デフォルトノート（`<users.name>のノート`）であるか。フロントは「マイノート」
   * バッジの表示や削除ボタンの抑止に使う。
   * Whether this is the user's default note (`<users.name>のノート`). Clients
   * use this to render the "マイノート" badge and hide the delete control.
   */
  is_default: boolean;
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
 * `GET /api/notes/:id` のページ行。Issue #823 以降、ページは常に 1 つのノートに所属し、
 * `note_id` はこのレスポンスのノート ID と一致する。
 *
 * Page row inside `GET /api/notes/:id`. After issue #823 every page belongs to
 * exactly one note; `note_id` matches the enclosing note id.
 */
export interface NotePageApiItem {
  id: string;
  owner_id: string;
  note_id: string;
  source_page_id: string | null;
  title: string | null;
  /**
   * 一覧カード描画用の先頭プレビュー (`pages.content_preview`)。本文 fetch を
   * 伴わずにカードへ表示するために、保存時に算出した短い抜粋を返す。Issue #849
   * で一時的に常時 `null` 化していたが、Issue #860 Phase 0 で復旧した。
   * Phase 1 で導入した `GET /api/notes/:noteId/pages?include=preview` がノート
   * シェルとページ一覧を分離した新経路だが、互換期間中は本フィールドも維持する
   * （Phase 6 で `pages[]` ごと撤去する予定）。
   *
   * Short head-of-body preview (`pages.content_preview`) used to render list
   * cards without fetching full page bodies. Temporarily forced to `null` by
   * Issue #849 and restored by Issue #860 Phase 0. Phase 1 added
   * `GET /api/notes/:noteId/pages?include=preview` as the new split route;
   * this field is kept for the compatibility window until `pages[]` itself
   * is removed in Phase 6.
   */
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}

/**
 * `GET /api/notes/:id` のレスポンス。呼び出し元の解決ロールと、`pages.note_id = id`
 * の全ページを含む。
 *
 * `GET /api/notes/:id` response: caller's resolved role plus every page with
 * `pages.note_id` equal to this note id.
 */
export interface NoteDetailApiResponse extends NoteApiFields {
  current_user_role: NonNullable<NoteRole>;
  pages: NotePageApiItem[];
}

/**
 * `GET /api/notes/:noteId/pages` の cursor `include` 指定で追加できるオプション
 * フィールド。`preview` は `content_preview`、`thumbnail` は `thumbnail_url` の
 * 同梱を要求する。未指定時は両フィールドとも `null` で返す（Issue #860 Phase 1）。
 *
 * Optional fields requested via `?include=` on `GET /api/notes/:noteId/pages`.
 * `preview` toggles `content_preview` and `thumbnail` toggles `thumbnail_url`;
 * both are `null` when unrequested (Issue #860 Phase 1).
 */
export type NotePageWindowInclude = "preview" | "thumbnail";

/**
 * `GET /api/notes/:noteId/pages` のページ行。keyset cursor pagination 経路で
 * 返す軽量サマリ。`content_preview` / `thumbnail_url` は `?include=` で
 * 明示的に要求された場合のみセットされ、それ以外は `null` で返る。
 *
 * Page summary returned by `GET /api/notes/:noteId/pages` (Issue #860 Phase
 * 1). `content_preview` and `thumbnail_url` are populated only when their
 * corresponding `?include=` token is present; otherwise they are `null`.
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
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}

/**
 * `GET /api/notes/:noteId/pages` の keyset cursor pagination レスポンス。
 * `next_cursor` が `null` の場合は末尾まで到達済み。
 *
 * Keyset cursor pagination response for `GET /api/notes/:noteId/pages`. A
 * `null` `next_cursor` means there are no more items.
 */
export interface NotePageWindowResponse {
  items: NotePageWindowItem[];
  next_cursor: string | null;
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
