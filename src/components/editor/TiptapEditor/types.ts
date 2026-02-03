import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

/**
 * リアルタイムコラボレーション用の設定（useCollaboration の戻り値から渡す）
 */
export interface CollaborationConfig {
  ydoc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  awareness: Awareness;
  user: { name: string; color: string };
  updateCursor: (anchor: number, head: number) => void;
  updateSelection: (from: number, to: number) => void;
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
