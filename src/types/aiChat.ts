/** 会話 */
export interface Conversation {
  id: string; // UUID
  title: string; // 自動生成タイトル
  messages: ChatMessage[];
  pageContext?: PageContextSnapshot; // 会話開始時のコンテキストスナップショット
  createdAt: number;
  updatedAt: number;
}

/** メッセージ */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string; // テキスト（Markdown）
  actions?: ChatAction[]; // AI提案のアクションカード
  referencedPages?: ReferencedPage[]; // このメッセージに添付された参照ページ
  /** このメッセージの生成に使用されたモデル表示名 */
  modelDisplayName?: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
}

/** AI がプロアクティブに提案するアクション */
export type ChatAction =
  | CreatePageAction
  | AppendToPageAction
  | CreateMultiplePagesAction
  | SuggestWikiLinksAction;

/**
 * Proposes creating a single new page from chat (Markdown body + optional outline for staged generation).
 * チャットから新規ページ作成を提案するアクション（本文 Markdown・第2段階用アウトライン任意）。
 */
export interface CreatePageAction {
  type: "create-page";
  title: string;
  content: string; // Markdown
  /** Bullet outline for the create-page card / second-stage body generation (preferred). / カード用箇条書き・第2段階生成用 */
  outline?: string;
  suggestedLinks: string[]; // WikiLink 候補
  reason: string; // AI がなぜ提案したかの説明
}

/**
 * Proposes appending Markdown to the currently open editor page (title must match context).
 * 現在開いているエディタページへ Markdown を追記する提案（タイトルはコンテキストと一致が必要）。
 */
export interface AppendToPageAction {
  type: "append-to-page";
  pageTitle: string; // クライアントでタイトル→ID解決する
  pageId?: string; // 既存解決時は省略可
  content: string;
  reason: string;
}

/**
 * Proposes creating multiple linked pages at once (bulk create + optional link graph).
 * 複数ページを一括作成し、リンク構造を指定する提案。
 */
export interface CreateMultiplePagesAction {
  type: "create-multiple-pages";
  pages: Array<{
    title: string;
    content: string;
    suggestedLinks: string[];
  }>;
  linkStructure: Array<{ from: string; to: string }>;
  reason: string;
}

/**
 * Proposes inserting wiki-style links for keywords that may map to existing or new pages.
 * キーワードに対応する Wiki リンク挿入を提案する（既存ページとの紐付け可）。
 */
export interface SuggestWikiLinksAction {
  type: "suggest-wiki-links";
  links: Array<{
    keyword: string;
    existingPageId?: string; // 既存ページがある場合のID
    existingPageTitle?: string;
  }>;
  reason: string;
}

/** ドラッグ&ドロップで参照されたページ */
export interface ReferencedPage {
  id: string;
  title: string;
}

/** AIチャットのページD&Dに使うMIMEタイプ */
export const ZEDI_PAGE_MIME_TYPE = "application/x-zedi-page";

/** 参照ページの最大数 */
export const MAX_REFERENCED_PAGES = 5;

/** ページコンテキスト（各ページが提供） */
export interface PageContext {
  type: "editor" | "home" | "search" | "other";
  pageId?: string;
  pageTitle?: string;
  pageContent?: string;
  /** Full editor content for local actions such as AI-driven page updates. */
  pageFullContent?: string;
  recentPageTitles?: string[];
  searchQuery?: string;
}

/** コンテキストのスナップショット（会話保存用） */
export interface PageContextSnapshot {
  type: PageContext["type"];
  pageId?: string;
  pageTitle?: string;
}
