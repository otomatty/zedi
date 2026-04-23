/**
 *
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
 *
 */
export interface Link {
  sourceId: string;
  targetId: string;
  createdAt: number;
}

/**
 *
 */
export interface GhostLink {
  linkText: string;
  sourcePageId: string;
  createdAt: number;
}

/**
 *
 */
export interface PageWithLinks extends Page {
  outgoingLinks: string[]; // Page IDs
  incomingLinks: string[]; // Page IDs (backlinks)
}

/**
 *
 */
export type DateGroup = {
  date: string; // YYYY-MM-DD
  label: string; // "今日", "昨日", "12月15日（日）"
  pages: Page[];
};
