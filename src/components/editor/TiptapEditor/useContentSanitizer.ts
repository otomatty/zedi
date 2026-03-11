import { useEffect, useRef } from "react";
import { Editor } from "@tiptap/react";
import {
  sanitizeTiptapContent,
  buildContentErrorMessage,
  type SanitizeResult,
} from "@/lib/contentUtils";

export interface ContentError {
  message: string;
  removedNodeTypes: string[];
  removedMarkTypes: string[];
  wasSanitized: boolean;
}

interface UseContentSanitizerOptions {
  editor: Editor | null;
  content: string;
  onError?: (error: ContentError | null) => void;
  onContentUpdated?: (initialized: boolean) => void;
  isCollaborationMode?: boolean;
}

/**
 * Hook to sanitize Tiptap content and report errors
 * This hook handles content sanitization when the content prop changes
 */
export function useContentSanitizer({
  editor,
  content,
  onError,
  onContentUpdated,
  isCollaborationMode = false,
}: UseContentSanitizerOptions): void {
  const lastSanitizeResultRef = useRef<SanitizeResult | null>(null);

  // Update editor content when prop changes (e.g., when page data is loaded)
  // This is the only place where sanitization happens to avoid duplicate calls
  useEffect(() => {
    if (editor && content) {
      // Sanitize content to remove unsupported node/mark types
      const sanitizeResult = sanitizeTiptapContent(content);
      lastSanitizeResultRef.current = sanitizeResult;

      try {
        const parsedContent = JSON.parse(sanitizeResult.content);

        // Report error if content was sanitized
        if (sanitizeResult.hadErrors && onError) {
          const errorMessage = buildContentErrorMessage(sanitizeResult);
          onError({
            message: errorMessage,
            removedNodeTypes: sanitizeResult.removedNodeTypes,
            removedMarkTypes: sanitizeResult.removedMarkTypes,
            wasSanitized: true,
          });
        } else if (!sanitizeResult.hadErrors && onError) {
          // Clear error if no issues
          onError(null);
        }

        // Only update if content is different to avoid cursor jumping
        const currentContent = JSON.stringify(editor.getJSON());

        if (currentContent !== sanitizeResult.content) {
          if (isCollaborationMode) {
            // コラボレーションモード時は setContent を呼ばない。
            // Y.Doc が唯一のコンテンツソースであり、React state の content で
            // 上書きすると Y.Doc に二重書き込みが発生しコンテンツが複製される。
            console.error(
              "[Collab] Blocked setContent in collaboration mode to prevent Y.Doc duplication",
              {
                currentContentLength: currentContent.length,
                incomingContentLength: sanitizeResult.content.length,
              },
            );
          } else {
            editor.commands.setContent(parsedContent);
          }

          // Notify that content was updated
          if (sanitizeResult.content.length > 50) {
            onContentUpdated?.(true);
          }
        } else {
          // If content matches, also notify
          if (sanitizeResult.content.length > 50) {
            onContentUpdated?.(true);
          }
        }
      } catch (e) {
        // If content is not valid JSON even after sanitization, report error
        console.error("Failed to parse content:", e);
        if (onError) {
          onError({
            message: `コンテンツの解析に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
            removedNodeTypes: [],
            removedMarkTypes: [],
            wasSanitized: false,
          });
        }
      }
    } else if (editor && !content) {
      // Clear error if content is empty
      if (onError) {
        onError(null);
      }
    }
  }, [editor, content, onError, onContentUpdated, isCollaborationMode]);
}
