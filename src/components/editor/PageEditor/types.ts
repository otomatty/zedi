import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import type { Page } from "@/types/page";

/**
 * Re-export ContentError for convenience
 */
export type { ContentError };

/**
 * Page data for the editor
 */
export interface PageEditorData {
  title: string;
  content: string;
  sourceUrl?: string;
  currentPageId: string | null;
  lastSaved: number | null;
  isInitialized: boolean;
  originalTitle: string;
}

/**
 * Title validation state
 */
export interface TitleValidationState {
  duplicatePage: Page | null;
  isValidating: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  shouldBlockSave: boolean;
}

/**
 * Wiki generator status
 */
export type WikiGeneratorStatus = "idle" | "generating" | "completed" | "error" | "cancelled";

/**
 * Props for PageEditorHeader component
 */
export interface PageEditorHeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  lastSaved: number | null;
  sourceUrl?: string;
  isWikiGenerating: boolean;
  isValidating: boolean;
  duplicatePage: Page | null;
  onBack: () => void;
  onDelete: () => void;
  onDownloadMarkdown: () => void;
  onCopyMarkdown: () => void;
  onWebClipper: () => void;
  onGenerateWiki: () => void;
  onCancelWiki: () => void;
  wikiError: string | null;
}

/**
 * Props for PageEditorAlerts component
 */
export interface PageEditorAlertsProps {
  duplicatePage: Page | null;
  title: string;
  contentError: ContentError | null;
  onDismissContentError: () => void;
  onNavigateToDuplicate: (pageId: string) => void;
}

/**
 * Props for PageEditorDialogs component
 */
export interface PageEditorDialogsProps {
  // Delete confirmation dialog
  deleteConfirmOpen: boolean;
  deleteReason: string;
  onDeleteReasonChange: (reason: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  
  // Wiki generator error dialog
  wikiError: string | null;
  onDismissWikiError: () => void;
  
  // Web clipper dialog
  webClipperOpen: boolean;
  onWebClipperOpenChange: (open: boolean) => void;
  onWebClipperImport: (
    title: string,
    content: string,
    sourceUrl: string,
    thumbnailUrl?: string | null
  ) => void;
}
