/** 会話 */
export interface Conversation {
  id: string;                   // UUID
  title: string;                // 自動生成タイトル
  messages: ChatMessage[];
  pageContext?: PageContextSnapshot; // 会話開始時のコンテキストスナップショット
  createdAt: number;
  updatedAt: number;
}

/** メッセージ */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;              // テキスト（Markdown）
  actions?: ChatAction[];       // AI提案のアクションカード
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

export interface CreatePageAction {
  type: "create-page";
  title: string;
  content: string;              // Markdown
  suggestedLinks: string[];     // WikiLink 候補
  reason: string;               // AI がなぜ提案したかの説明
}

export interface AppendToPageAction {
  type: "append-to-page";
  pageId: string;
  pageTitle: string;
  content: string;
  reason: string;
}

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

export interface SuggestWikiLinksAction {
  type: "suggest-wiki-links";
  links: Array<{
    keyword: string;
    existingPageId?: string;     // 既存ページがある場合のID
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
export const ZEDI_PAGE_MIME_TYPE = 'application/x-zedi-page';

/** 参照ページの最大数 */
export const MAX_REFERENCED_PAGES = 5;

/** ページコンテキスト（各ページが提供） */
export interface PageContext {
  type: "editor" | "home" | "search" | "other";
  pageId?: string;
  pageTitle?: string;
  pageContent?: string;
  recentPageTitles?: string[];
  searchQuery?: string;
}

/** コンテキストのスナップショット（会話保存用） */
export interface PageContextSnapshot {
  type: PageContext["type"];
  pageId?: string;
  pageTitle?: string;
}
