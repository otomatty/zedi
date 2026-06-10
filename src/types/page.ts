/**
 * Wiki ページ本体（エディタで扱う永続化済みコンテンツを含む）。
 * Wiki page including persisted editor content.
 */
export interface Page {
  id: string;
  ownerUserId: string;
  /**
   * 所属ノート ID。すべてのページはちょうど 1 つのノートに属する（Issue #823）。
   * 旧「個人ページ」（`noteId === null`）は Issue #1020 でソースから根絶済み。
   *
   * Owning note ID. Every page belongs to exactly one note (issue #823); the
   * legacy "personal page" (`noteId === null`) concept was eradicated at the
   * source by issue #1020.
   */
  noteId: string;
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
   * 所属ノート ID。`Page.noteId` と同じ non-null 契約（Issue #823 / #1020）。
   * Owning note ID; same non-null contract as `Page.noteId` (issues #823 / #1020).
   */
  noteId: string;
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
