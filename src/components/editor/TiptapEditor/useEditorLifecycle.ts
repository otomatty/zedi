import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { useContentSanitizer } from "./useContentSanitizer";
import { useWikiLinkStatusSync } from "./useWikiLinkStatusSync";
import { usePasteImageHandler } from "./usePasteImageHandler";
import type { TiptapEditorProps } from "./types";

interface UseEditorLifecycleOptions {
  editor: Editor | null;
  content: TiptapEditorProps["content"];
  onChange: TiptapEditorProps["onChange"];
  onContentError: TiptapEditorProps["onContentError"];
  isReadOnly: boolean;
  pageId: string;
  isWikiGenerating?: boolean;
  collaborationConfig: TiptapEditorProps["collaborationConfig"];
  focusContentRef: TiptapEditorProps["focusContentRef"];
  initialContent: TiptapEditorProps["initialContent"];
  onInitialContentApplied: TiptapEditorProps["onInitialContentApplied"];
  handleImageUpload: (files: FileList | File[]) => void;
  isEditorInitializedRef: React.MutableRefObject<boolean>;
}

export function useEditorLifecycle({
  editor,
  content,
  onChange,
  onContentError,
  isReadOnly,
  pageId,
  isWikiGenerating = false,
  collaborationConfig,
  focusContentRef,
  initialContent,
  onInitialContentApplied,
  handleImageUpload,
  isEditorInitializedRef,
}: UseEditorLifecycleOptions) {
  const initialContentAppliedRef = useRef(false);

  useEffect(() => {
    if (!focusContentRef || !editor) return;
    focusContentRef.current = () => editor.commands.focus();
    return () => {
      focusContentRef.current = null;
    };
  }, [editor, focusContentRef]);

  useEffect(() => {
    if (!editor || !collaborationConfig || !initialContent || initialContentAppliedRef.current)
      return;
    const timer = setTimeout(() => {
      if (initialContentAppliedRef.current) return;
      // ProseMirror empty doc (doc + one empty paragraph) has nodeSize 4, not 2
      const doc = editor.state.doc;
      const isEmpty =
        doc.nodeSize <= 4 || (doc.childCount === 1 && (doc.firstChild?.content.size ?? 0) === 0);
      if (!isEmpty) return;
      try {
        editor.commands.setContent(JSON.parse(initialContent));
        initialContentAppliedRef.current = true;
        onInitialContentApplied?.();
      } catch (e) {
        console.error("Failed to apply initial content from URL clip", e);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [editor, collaborationConfig, initialContent, onInitialContentApplied]);

  usePasteImageHandler({ editor, handleImageUpload });

  useEffect(() => {
    if (editor) editor.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  useContentSanitizer({
    editor,
    content,
    onError: onContentError,
    onContentUpdated: (initialized) => {
      if (initialized) isEditorInitializedRef.current = true;
    },
  });

  useWikiLinkStatusSync({
    editor,
    content,
    pageId: pageId || undefined,
    onChange,
    skipSync: isWikiGenerating,
  });
}
