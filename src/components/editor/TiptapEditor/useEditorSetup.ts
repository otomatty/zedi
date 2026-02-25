import { useCallback, useEffect, useMemo, useRef } from "react";
import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { WikiLinkSuggestionHandle } from "../extensions/WikiLinkSuggestion";
import type { SlashSuggestionHandle } from "./SlashSuggestionLayer";
import { createEditorExtensions, defaultEditorProps } from "./editorConfig";
import type { TiptapEditorProps } from "./types";

interface UseEditorSetupOptions {
  content: TiptapEditorProps["content"];
  onChange: TiptapEditorProps["onChange"];
  placeholder: string;
  autoFocus: boolean;
  pageId: string;
  isReadOnly: boolean;
  onContentError: TiptapEditorProps["onContentError"];
  collaborationConfig: TiptapEditorProps["collaborationConfig"];
  editorRef: React.MutableRefObject<Editor | null>;
  lastSelectionRef: React.MutableRefObject<{ from: number; to: number } | null>;
  handleLinkClick: (title: string, exists: boolean) => void;
  handleStateChange: (state: WikiLinkSuggestionState) => void;
  handleSlashStateChange: (state: SlashSuggestionState) => void;
  handleRetryUpload: (nodeId: string) => void;
  handleRemoveUpload: (nodeId: string) => void;
  getProviderLabel: () => string;
  canDeleteFromStorage: (src: string) => boolean;
  handleDeleteFromStorage: (src: string) => Promise<void>;
  handleCopyImageUrl: (src: string) => void;
  getToken: () => Promise<string | null>;
  suggestionState: WikiLinkSuggestionState | null;
  slashState: SlashSuggestionState | null;
  suggestionRef: React.RefObject<WikiLinkSuggestionHandle | null>;
  slashRef: React.RefObject<SlashSuggestionHandle | null>;
}

export function useEditorSetup(options: UseEditorSetupOptions) {
  const {
    content,
    onChange,
    placeholder,
    autoFocus,
    pageId,
    isReadOnly,
    onContentError,
    collaborationConfig,
    editorRef,
    lastSelectionRef,
    handleLinkClick,
    handleStateChange,
    handleSlashStateChange,
    handleRetryUpload,
    handleRemoveUpload,
    getProviderLabel,
    canDeleteFromStorage,
    handleDeleteFromStorage,
    handleCopyImageUrl,
    getToken,
    suggestionState,
    slashState,
    suggestionRef,
    slashRef,
  } = options;

  const isEditorInitializedRef = useRef(false);
  const lastReportedContentRef = useRef<string | null>(null);

  const initialParsedContent = useMemo(() => {
    if (!content) return undefined;
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse content:", e);
      return undefined;
    }
  }, [content]);

  useEffect(() => {
    if (!content || initialParsedContent !== undefined) return;
    if (lastReportedContentRef.current === content) return;
    lastReportedContentRef.current = content;
    onContentError?.({
      message: "コンテンツの解析に失敗しました。データが破損している可能性があります。",
      removedNodeTypes: [],
      removedMarkTypes: [],
      wasSanitized: false,
    });
  }, [content, initialParsedContent, onContentError]);

  const useCollaborationMode = Boolean(
    collaborationConfig?.xmlFragment && collaborationConfig?.user,
  );

  const slashStateRef = useRef(slashState);
  slashStateRef.current = slashState;
  const suggestionStateRef = useRef(suggestionState);
  suggestionStateRef.current = suggestionState;

  const editor = useEditor(
    {
      extensions: createEditorExtensions({
        placeholder,
        onLinkClick: handleLinkClick,
        onStateChange: handleStateChange,
        onSlashStateChange: handleSlashStateChange,
        imageUploadOptions: {
          onRetry: handleRetryUpload,
          onRemove: handleRemoveUpload,
          getProviderLabel,
        },
        imageOptions: {
          getProviderLabel,
          canDeleteFromStorage,
          onDeleteFromStorage: handleDeleteFromStorage,
          onCopyUrl: handleCopyImageUrl,
          getAuthenticatedImageUrl: async (url: string) => {
            const token = await getToken();
            if (!token) return null;
            try {
              const r = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!r.ok) return null;
              return URL.createObjectURL(await r.blob());
            } catch {
              return null;
            }
          },
        },
        collaboration:
          useCollaborationMode && collaborationConfig
            ? {
                document: collaborationConfig.ydoc,
                field: "default",
                awareness: collaborationConfig.awareness,
                user: collaborationConfig.user,
              }
            : undefined,
      }),
      content: useCollaborationMode ? undefined : initialParsedContent,
      autofocus: autoFocus ? "end" : false,
      editable: !isReadOnly,
      immediatelyRender: false,
      editorProps: {
        ...defaultEditorProps,
        handleKeyDown: (_view, event) => {
          if (slashStateRef.current?.active && slashRef.current)
            return slashRef.current.onKeyDown(event);
          if (suggestionStateRef.current?.active && suggestionRef.current)
            return suggestionRef.current.onKeyDown(event);
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        if (!isEditorInitializedRef.current) {
          if (JSON.stringify(editor.getJSON()).length <= 50) return;
          isEditorInitializedRef.current = true;
        }
        onChange(JSON.stringify(editor.getJSON()));
      },
      onCreate: () => {
        if (initialParsedContent) isEditorInitializedRef.current = true;
      },
      onSelectionUpdate: ({ editor }) => {
        const { from, to } = editor.state.selection;
        lastSelectionRef.current = { from, to };
        if (useCollaborationMode && collaborationConfig?.awareness) {
          collaborationConfig.updateCursor(from, to);
          collaborationConfig.updateSelection(from, to);
        }
      },
    },
    [pageId, useCollaborationMode],
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor, editorRef]);

  const handleInsertMermaid = useCallback(
    (code: string) => {
      if (!editor) return;
      editor.chain().focus().deleteSelection().insertMermaid(code).run();
    },
    [editor],
  );

  return { editor, handleInsertMermaid, isEditorInitializedRef };
}
