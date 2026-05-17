/**
 * `/notes/:noteId` のタグフィルタ機能の型定義。
 * Type definitions for the `/notes/:noteId` tag filter feature.
 *
 * `?tags=` URL クエリの状態とサーバ集計レスポンスの単一型をここに集約する。
 * `SelectedTags` は判別共用型で `none-selected` / `tags` / `untagged-only`
 * の 3 状態を表す。
 *
 * Houses the discriminated union for the `?tags=` URL state plus the row shape
 * returned by `GET /api/notes/:noteId/tags`. Keeping them next to each other
 * keeps the front-end filter and the aggregation endpoint in sync.
 */

/**
 * URL クエリ `?tags=` から導出されるフィルタ状態。
 * Filter state derived from the `?tags=` URL query.
 *
 * - `kind: 'none-selected'` — フィルタ未指定。ページ一覧は全件表示。
 *   No filter applied; the page list shows everything.
 * - `kind: 'tags'` — 1 件以上のタグが選択されている (OR フィルタ)。
 *   `tags` は小文字キー (`nameLower`) で正規化済み・重複なし。
 *   One or more tags selected; tag names are lower-cased keys with no duplicates.
 * - `kind: 'untagged-only'` — `__none__` トークン: タグが 1 つも付いていない
 *   ページのみ表示。`tags` との併用は不可。
 *   The `__none__` token: only untagged pages. Cannot coexist with `tags`.
 */
export type SelectedTags =
  | { kind: "none-selected" }
  | { kind: "tags"; tags: string[] }
  | { kind: "untagged-only" };

/**
 * `GET /api/notes/:noteId/tags` の `items[]` 1 件分。
 * Single row from the note tag aggregation endpoint.
 */
export interface TagAggregationItem {
  /**
   * 表示用の表記。同じ大文字小文字無視キーに複数の表記がある場合は
   * resolved (= 同名ページが存在) 側の表記を優先する。
   * Display name, preferring the spelling from the resolved-page side when
   * multiple casings share a key.
   */
  name: string;
  /**
   * 大文字小文字無視のキー (`name.toLowerCase().trim()`)。URL クエリと
   * サーバ照合に使う。
   * Lower-cased, trimmed key used for URL queries and server-side matching.
   */
  nameLower: string;
  /** このタグが付いているページ件数 / Number of pages tagged with this name. */
  pageCount: number;
  /**
   * すべての出現が同名ページ (links 経由) に解決されているか。1 件でも
   * ghost_links 経由が混ざれば `false`。
   * Whether every occurrence resolves via `links` (true) or includes at least
   * one ghost_links row (false).
   */
  resolved: boolean;
}

/**
 * `GET /api/notes/:noteId/tags` レスポンス全体。
 * Full response shape for the note tag aggregation endpoint.
 */
export interface NoteTagAggregationResponse {
  items: TagAggregationItem[];
  /** タグが 1 つも付いていないアクティブページ数 / Active pages without any tag. */
  noneCount: number;
  /** ノート配下のアクティブページ総数 / Total active pages in the note. */
  totalPages: number;
}

/**
 * 「タグなし」フィルタを表す URL クエリトークン。
 * URL token used to request the "untagged only" filter (`?tags=__none__`).
 */
export const UNTAGGED_FILTER_TOKEN = "__none__" as const;
