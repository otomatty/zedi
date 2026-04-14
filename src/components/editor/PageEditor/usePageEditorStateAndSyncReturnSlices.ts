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
 * Identity helper that narrows / preserves the core slice type for consumers.
 * コアスライスの型をそのまま返すアイデンティティヘルパー（呼び出し側の型推論用）。
 *
 * @param p - Core slice from the page editor hook / ページエディタフックのコア戻り値
 * @returns Same object / 同一オブジェクト
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
 * Identity helper that narrows / preserves the wiki slice type for consumers.
 * Wiki コラボ・生成まわりスライスの型をそのまま返すアイデンティティヘルパー。
 *
 * @param p - Wiki slice from the page editor hook / ページエディタフックの Wiki 戻り値
 * @returns Same object / 同一オブジェクト
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
  handleOpenDuplicatePage: (targetPageId: string) => void;
  setTitle: (t: string) => void;
  setContent: (c: string) => void;
  setContentError: (e: string | null) => void;
  validateTitle: (title: string) => Promise<void>;
  saveChanges: (title: string, content: string) => void;
  handleExportMarkdown: () => void;
  handleCopyMarkdown: () => void;
}

/**
 * Identity helper that narrows / preserves the actions slice type for consumers.
 * 保存・削除・エクスポート等のアクションスライスの型をそのまま返すアイデンティティヘルパー。
 *
 * @param p - Actions slice from the page editor hook / ページエディタフックのアクション戻り値
 * @returns Same object / 同一オブジェクト
 */
export function pageEditorActionsReturnSlice(
  p: PageEditorActionsReturnSlice,
): PageEditorActionsReturnSlice {
  return p;
}
