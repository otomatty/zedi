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
 * ページ間のリンク（source → target）。
 * Link between two pages (source → target).
 */
export interface Link {
  sourceId: string;
  targetId: string;
  createdAt: number;
}

/**
 * 対象ページがまだ存在しない WikiLink（未解決リンク）。
 * Unresolved WikiLink whose target page does not yet exist.
 */
export interface GhostLink {
  linkText: string;
  sourcePageId: string;
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
