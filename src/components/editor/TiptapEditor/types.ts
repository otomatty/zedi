import type { Editor } from "@tiptap/react";

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
  /** コンテンツエラーのコールバック */
  onContentError?: (error: ContentError | null) => void;
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
