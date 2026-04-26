/**
 * Wiki ページ本体（エディタで扱う永続化済みコンテンツを含む）。
 * Wiki page including persisted editor content.
 */
export interface Page {
  id: string;
  ownerUserId: string;
  /**
   * 所属ノート ID。`null` は個人ページ、文字列値はそのノートに所属する
   * ノートネイティブページ。個人 `/home` のグリッドには `null` のページのみ
   * を表示する。Issue #713 を参照。
   *
   * Owning note ID. `null` is a personal page; a string identifies a
   * note-native page. Personal `/home` only renders the `null` ones. See
   * issue #713.
   */
  noteId: string | null;
  title: string;
  content: string; // Tiptap JSON stringified
  contentPreview?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

/**
 * Lightweight page summary without content
 * Use for list views to minimize data transfer and reduce Turso Rows Read
 */
export interface PageSummary {
  id: string;
  ownerUserId: string;
  /**
   * 所属ノート ID。`null` は個人ページ、文字列値はそのノートに所属する
   * ノートネイティブページ。個人 `/home` のグリッドには `null` のページのみ
   * を表示する。Issue #713 を参照。
   *
   * Owning note ID. `null` is a personal page; a string identifies a
   * note-native page. Personal `/home` only renders the `null` ones. See
   * issue #713.
   */
  noteId: string | null;
  title: string;
  contentPreview?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

/**
 * `links` / `ghost_links` で共有する種別識別子。サーバ側 `link_type` カラムに対応。
 * Link kind shared by `links` / `ghost_links`; mirrors the server `link_type` column.
 *
 * - `"wiki"`: WikiLink `[[Title]]` (legacy default).
 * - `"tag"`:  Hashtag `#name` (issue #725 Phase 1)。
 */
export type LinkType = "wiki" | "tag";

/** `link_type` に許容される文字列値。 / Allowed `link_type` values. */
export const LINK_TYPES: readonly LinkType[] = ["wiki", "tag"] as const;

/**
 * ページ間のリンク（source → target）。`linkType` で WikiLink とタグを区別する。
 * Link between two pages (source → target); `linkType` distinguishes WikiLink vs. tag.
 */
export interface Link {
  sourceId: string;
  targetId: string;
  /**
   * `'wiki'` | `'tag'`。Issue #725 で追加。未指定の旧コードパスは `'wiki'` として扱う。
   * Added by issue #725; legacy callers default to `'wiki'`.
   */
  linkType: LinkType;
  createdAt: number;
}

/**
 * 対象ページがまだ存在しない WikiLink / タグ（未解決リンク）。`linkType` で種別を区別する。
 * Unresolved WikiLink or tag; `linkType` distinguishes which flavor is ghosted.
 */
export interface GhostLink {
  linkText: string;
  sourcePageId: string;
  linkType: LinkType;
  createdAt: number;
}

/**
 * 前方リンク・被リンク ID を付加したページ（グラフ系 UI 用）。
 * Page augmented with outgoing/incoming link IDs for graph-style UIs.
 */
export interface PageWithLinks extends Page {
  outgoingLinks: string[]; // Page IDs
  incomingLinks: string[]; // Page IDs (backlinks)
}

/**
 * 日付ごとにまとめたページグループ（ホーム画面の日付別表示用）。
 * Pages grouped by date (used by the home date-based view).
 */
export type DateGroup = {
  date: string; // YYYY-MM-DD
  label: string; // "今日", "昨日", "12月15日（日）"
  pages: Page[];
};
