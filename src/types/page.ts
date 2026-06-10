/**
 * Wiki ページ本体（エディタで扱う永続化済みコンテンツを含む）。
 * Wiki page including persisted editor content.
 */
export interface Page {
  id: string;
  ownerUserId: string;
  /**
   * 所属ノート ID。`null` は「個人ページ（`note_id IS NULL`）」を表す。
   *
   * Issue #823/#825 はデフォルトノート導入に伴いこの概念を廃止する方針だが、
   * ストレージ層（`PageMetadata.noteId: string | null`）・ゲストストア
   * (`pageStore`)・IndexedDB の個人ページ判定 (`noteId === null`) が依然として
   * `null` を生成・依存しているため、フロントのドメイン型も実態に合わせて
   * `string | null` とする（`strict: true` 化で型穴を顕在化）。`null` をソース
   * から完全に除去して non-null へ再 tighten するのは個人ページ概念の根絶
   * エピックで対応する。
   *
   * Owning note ID. `null` denotes a legacy "personal page" (`note_id IS NULL`).
   * Issues #823/#825 aim to retire this concept, but the storage layer
   * (`PageMetadata.noteId: string | null`), the guest store (`pageStore`), and
   * IndexedDB's personal-page filter (`noteId === null`) still produce and rely
   * on `null`, so the frontend domain type matches reality as `string | null`
   * (surfaced by enabling `strict: true`). Eliminating `null` at the source and
   * re-tightening to non-null is tracked by the personal-page removal epic.
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
   * 所属ノート ID。`Page.noteId` と同様、`null` は個人ページを表す暫定形。
   * 詳細と今後の方針（個人ページ概念の根絶エピック）は `Page.noteId` を参照。
   *
   * Owning note ID. Like `Page.noteId`, `null` denotes a personal page as an
   * interim shape; see `Page.noteId` for details and the planned removal epic.
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
