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
  /**
   * `/notes/:noteId` のタグフィルタバーをオーナーが既定で表示するか。
   * Owner-declared default for the tag filter bar above the page list.
   */
  show_tag_filter_bar: boolean;
  /**
   * フィルタバーの既定選択タグ (小文字キー、`__none__` トークンを含み得る)。
   * Default tags selected on first load (lower-cased keys; may contain `__none__`).
   */
  default_filter_tags: string[];
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
 * `GET /api/notes/:id` のレスポンス。呼び出し元の解決ロールのみを含む
 * 「note shell」。Issue #860 Phase 6 で `pages[]` を撤去し、ページ一覧は
 * cursor pagination の `GET /api/notes/:noteId/pages`、wiki link / AI chat
 * scope のような全ページタイトルが必要な経路は `GET /api/notes/:noteId/page-titles`
 * を使うように分離した。
 *
 * `GET /api/notes/:id` response — the "note shell". Returns only note
 * attributes and the caller's resolved role. Issue #860 Phase 6 removed the
 * `pages[]` field; visible page lists now come from the cursor-paginated
 * `GET /api/notes/:noteId/pages` and full-set title lookups (wiki-link,
 * AI-chat scope) come from `GET /api/notes/:noteId/page-titles`.
 */
export interface NoteDetailApiResponse extends NoteApiFields {
  current_user_role: NonNullable<NoteRole>;
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
 * `GET /api/notes/:noteId/page-titles` のページ行。Issue #860 Phase 6 の
 * 軽量タイトルインデックス。`pages.contentPreview` / `thumbnailUrl` /
 * `sourceUrl` 等は含まず、wiki link の解決・AI chat scope の sync・
 * `NoteAddPageDialog` の重複判定など「ノート全ページのタイトル文字列だけ」
 * 必要な consumer 向けに最小フィールドだけ返す。
 *
 * Page row returned by `GET /api/notes/:noteId/page-titles` (Issue #860 Phase
 * 6). Carries only the four fields needed by full-set consumers (wiki-link
 * resolver, AI-chat scope sync, add-dialog dedup) — preview / thumbnail /
 * source_url are intentionally absent so the payload stays small even on
 * notes with thousands of pages.
 */
export interface NotePageTitleItem {
  id: string;
  title: string;
  is_deleted: boolean;
  updated_at: Date;
}

/**
 * `GET /api/notes/:noteId/page-titles` のレスポンス。`updated_at DESC, id DESC`
 * のサーバ順を維持してフラット配列で返す（Phase 1 の `/pages` と同じ並び）。
 *
 * Response for `GET /api/notes/:noteId/page-titles`. Returns a flat array
 * preserving the server order (`updated_at DESC, id DESC`) to match the
 * Phase 1 `/pages` window endpoint.
 */
export interface NotePageTitleIndexResponse {
  items: NotePageTitleItem[];
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

/**
 * `GET /api/notes/:noteId/tags` の `items[]` 1 件分。
 * Single row from the note tag aggregation endpoint.
 *
 * - `name` は表示名 (resolved 側を優先)。
 * - `name_lower` は大文字小文字無視のキー。
 * - `page_count` はこのタグが付いているアクティブページの distinct 件数。
 * - `resolved` はすべての出現が `links` 経由 (同名ページが存在) であれば `true`、
 *   1 件でも `ghost_links` 経由が混ざれば `false`。
 *
 * `name` is the display spelling (resolved-side wins); `name_lower` is the
 * case-insensitive key; `page_count` is the distinct count of active pages
 * tagged with this name; `resolved` is `true` only when every occurrence
 * resolves via `links`.
 */
export interface NoteTagAggregationItem {
  name: string;
  name_lower: string;
  page_count: number;
  resolved: boolean;
}

/**
 * `GET /api/notes/:noteId/tags` のレスポンス全体。
 * Full response shape for the note tag aggregation endpoint.
 *
 * `none_count` は「`links` / `ghost_links` どちらにも `link_type='tag'` の
 * 出辺を持たないアクティブページ」の件数。「タグなし」フィルタの件数表示と、
 * UI で「タグなし」チップを出すかの判定に使う。
 *
 * `none_count` is the number of active pages with no outgoing tag edge in
 * either `links` or `ghost_links`; the UI uses it for the "untagged" chip
 * count and visibility.
 */
export interface NoteTagAggregationResponse {
  items: NoteTagAggregationItem[];
  none_count: number;
  total_pages: number;
}
