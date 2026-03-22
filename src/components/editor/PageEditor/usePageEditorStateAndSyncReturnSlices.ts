import type { Location } from "react-router-dom";
import type { Page } from "@/types/page";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";

/**
 * Core editor + routing fields returned by the page editor state hook.
 * ページエディタ状態フックが返すコア欄（ルーティング・表示用フィールド）。
 */
export interface PageEditorCoreReturnSlice {
  isLoading: boolean;
  isInitialized: boolean;
  isNewPage: boolean;
  pageId: string;
  title: string;
  content: string;
  sourceUrl: string;
  currentPageId: string | null;
  displayLastSaved: number | null;
  pendingInitialContent: string | null;
  setPendingInitialContent: (v: string | null) => void;
  contentError: string | null;
  location: Location;
}

/**
 *
 */
export function pageEditorCoreReturnSlice(p: PageEditorCoreReturnSlice): PageEditorCoreReturnSlice {
  return p;
}

/** Wiki generator + collaboration slice of the page editor public API. */
export interface PageEditorWikiReturnSlice {
  wikiStatus: string;
  isWikiGenerating: boolean;
  isSyncingLinks: boolean;
  isLocalDocEnabled: boolean;
  collaboration: UseCollaborationReturn;
  wikiError: Error | null;
  cancelWiki: () => void;
  resetWiki: () => void;
  generateWiki: () => void;
  wikiContentForCollab: string | null;
  onWikiContentApplied: () => void;
}

/**
 *
 */
export function pageEditorWikiReturnSlice(p: PageEditorWikiReturnSlice): PageEditorWikiReturnSlice {
  return p;
}

/** Title validation, deletion, and export handlers exposed by the page editor. */
export interface PageEditorActionsReturnSlice {
  duplicatePage: Page | null;
  errorMessage: string | null;
  deleteConfirmOpen: boolean;
  deleteReason: string;
  setDeleteConfirmOpen: (v: boolean) => void;
  handleDelete: () => void;
  handleBack: () => void;
  handleConfirmDelete: () => void;
  handleCancelDelete: () => void;
  setTitle: (t: string) => void;
  setContent: (c: string) => void;
  setContentError: (e: string | null) => void;
  validateTitle: (title: string) => Promise<void>;
  saveChanges: (title: string, content: string) => void;
  handleExportMarkdown: () => void;
  handleCopyMarkdown: () => void;
}

/**
 *
 */
export function pageEditorActionsReturnSlice(
  p: PageEditorActionsReturnSlice,
): PageEditorActionsReturnSlice {
  return p;
}
