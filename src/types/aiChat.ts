/** 会話 */
export interface Conversation {
  id: string; // UUID
  title: string; // 自動生成タイトル
  /**
   * Legacy flat transcript (pre–message-tree). Migrated to {@link messageMap} on load.
   * 旧形式のフラット履歴（メッセージツリー導入前）。読み込み時に {@link messageMap} へ移行する。
   */
  messages?: ChatMessage[];
  /**
   * Messages indexed by id (tree). Preferred over {@link messages}.
   * id をキーにしたメッセージマップ（ツリー）。{@link messages} より優先。
   */
  messageMap?: MessageMap;
  /** First message id in the tree, or null when empty. / ツリー先頭メッセージ ID、空なら null */
  rootMessageId?: string | null;
  /** Current visible leaf id for the active branch. / 表示中ブランチの末端メッセージ ID */
  activeLeafId?: string | null;
  pageContext?: PageContextSnapshot; // 会話開始時のコンテキストスナップショット
  createdAt: number;
  updatedAt: number;
}

/**
 * ツール実行状況の 1 エントリ。
 * A single tool execution status entry.
 */
export interface ToolExecution {
  toolName: string;
  status: "running" | "completed";
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
  /**
   * ストリーミング中のツール実行状況リスト（Claude Code のみ）。
   * Tool execution status list during streaming (Claude Code only).
   */
  toolExecutions?: ToolExecution[];
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
}

/**
 * Chat message node in a branched transcript (parent pointer).
 * 分岐可能な会話ログ上のメッセージノード（親ポインタ付き）。
 */
export interface TreeChatMessage extends ChatMessage {
  parentId: string | null;
}

/**
 * All messages in a conversation keyed by id.
 * 会話内の全メッセージを id で引けるマップ。
 */
export type MessageMap = Record<string, TreeChatMessage>;

/**
 * Branched transcript state for one conversation (client-side).
 * 1 会話の分岐付きログ状態（クライアント側）。
 */
export interface ChatTreeState {
  messageMap: MessageMap;
  rootMessageId: string | null;
  activeLeafId: string | null;
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

/**
 * React Router `location.state` when opening `/ai/:id` from the landing page with a first message.
 * ランディングから最初のメッセージ付きで `/ai/:id` を開くときの `location.state`。
 */
export interface AIChatDetailLocationState {
  initialMessage?: string;
  initialReferencedPages?: ReferencedPage[];
}

/** AIチャットのページD&Dに使うMIMEタイプ */
export const ZEDI_PAGE_MIME_TYPE = "application/x-zedi-page";

/** 参照ページの最大数 */
export const MAX_REFERENCED_PAGES = 5;

/** ページコンテキスト（各ページが提供） */
export interface PageContext {
  type: "editor" | "home" | "search" | "other";
  pageId?: string;
  /**
   * Owning note id of the page being edited (local metadata only).
   * Linked personal pages inside a note keep this undefined.
   * 編集中ページ自身の所属ノート ID（ローカルメタデータのみ）。
   * ノート内に表示している linked personal page は `undefined` のままにする。
   */
  noteId?: string;
  /**
   * Linked local workspace root for Claude Code cwd (desktop, not sent to API server).
   * Claude Code cwd 用のローカルワークスペース（デスクトップ、API サーバには送らない）。
   */
  claudeWorkspaceRoot?: string;
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
