import type { MutableRefObject } from "react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

/**
 * リアルタイムコラボレーション用の設定（useCollaboration の戻り値から渡す）
 * Collaboration configuration forwarded to TiptapEditor.
 */
export interface CollaborationConfig {
  ydoc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  /** Awareness instance. Required for collaborative mode; undefined in local mode (no WebSocket). */
  awareness?: Awareness;
  user: { name: string; color: string };
  updateCursor: (anchor: number, head: number) => void;
  updateSelection: (from: number, to: number) => void;
  /**
   * `useCollaboration` の `isSynced` 状態。初期同期が完了したかを示す。
   * 編集ロックや、初期同期後の一度きりの正規化（WikiLink mark 化など）に使う。
   *
   * Mirrors `useCollaboration().isSynced`. Editors use this to gate input
   * before initial sync completes and to trigger one-shot post-sync
   * normalization passes (e.g. promoting plain `[[Title]]` text to wikiLink
   * marks loaded from Hocuspocus). Issue #880.
   */
  isSynced: boolean;
}

/**
 * Props for TiptapEditor component
 */
export interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  pageId?: string;
  pageTitle?: string;
  /** 読み取り専用モード（生成中など） */
  isReadOnly?: boolean;
  /** ツールバーを表示するか */
  showToolbar?: boolean;
  /** コンテンツエラーのコールバック */
  onContentError?: (error: ContentError | null) => void;
  /** リアルタイムコラボレーション（Y.js）有効時のみ渡す。渡すと content は Y.Doc から取得 */
  collaborationConfig?: CollaborationConfig;
  /** 親がコンテンツにフォーカスするためのコールバック。editor 準備後に ref.current に focus() を代入 */
  focusContentRef?: MutableRefObject<(() => void) | null>;
  /**
   * カーソル位置にコンテンツを挿入するコールバック ref。editor 準備後に代入。
   * TipTap の `insertContent` に渡せる任意のコンテンツ（JSON ノード配列等）を受け取る。
   * Ref to insert content at the editor's cursor position; assigned when the editor is ready.
   * Accepts any content that TipTap's `insertContent` can handle (e.g. array of JSON nodes).
   */
  insertAtCursorRef?: MutableRefObject<((content: unknown) => boolean) | null>;
  /** URL から作成時など、Y.Doc が空のときに一度だけ反映する Tiptap JSON 文字列 */
  initialContent?: string;
  /** initialContent をエディタに反映したあとに呼ぶ */
  onInitialContentApplied?: () => void;
  /** Wiki生成中（この間はリンク判定をスキップしてちらつきを防ぐ） */
  isWikiGenerating?: boolean;
  /** コラボモード時、Wiki生成内容を Y.Doc に反映する用。反映後に onWikiContentApplied を呼ぶ */
  wikiContentForCollab?: string | null;
  onWikiContentApplied?: () => void;
  /**
   * 編集中ページが所属するノート ID。`null` は個人ページ、文字列値はノート
   * ネイティブページ。WikiLink のサジェスト・解決候補をノート／個人スコープに
   * 絞るために使用する。Issue #713 Phase 4 を参照。
   *
   * Owning note ID of the page being edited. `null` is a personal page; a
   * string identifies a note-native page. Used to scope WikiLink suggestions
   * and resolution to the same note (or personal pages). See issue #713
   * Phase 4.
   */
  pageNoteId?: string | null;
}

/**
 * Content error information
 * Re-exported from useContentSanitizer for convenience
 */
export interface ContentError {
  message: string;
  removedNodeTypes: string[];
  removedMarkTypes: string[];
  wasSanitized: boolean;
}

/**
 * Suggestion item for WikiLink autocomplete
 */
export interface SuggestionItem {
  title: string;
  exists: boolean;
}

/**
 * Position for floating UI elements
 */
export interface FloatingPosition {
  top: number;
  left: number;
}

/**
 * Handle for WikiLink suggestion component
 */
export interface WikiLinkSuggestionHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}
