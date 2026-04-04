import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { WikiLinkSuggestionHandle } from "../extensions/WikiLinkSuggestion";
import type { SlashSuggestionHandle } from "./SlashSuggestionLayer";
import { createEditorExtensions, defaultEditorProps } from "./editorConfig";
import type { TiptapEditorProps } from "./types";

/**
 * Keeps latest `workspaceRoot` in a ref without re-running `useEditor` (Issue #461).
 * `useEditor` を再実行せずに最新のワークスペースルートを ref に保持する（Issue #461）。
 */
function useWorkspaceRootRef(workspaceRoot: string | null) {
  const r = useRef(workspaceRoot);
  useLayoutEffect(() => {
    r.current = workspaceRoot;
  }, [workspaceRoot]);
  return r;
}

/**
 * Keeps latest `noteId` in a ref without re-running `useEditor` (Issue #461).
 * `useEditor` を再実行せずに最新のノート ID を ref に保持する（Issue #461）。
 */
function useNoteIdRef(noteId: string | null) {
  const r = useRef(noteId);
  useLayoutEffect(() => {
    r.current = noteId;
  }, [noteId]);
  return r;
}

interface UseEditorSetupOptions {
  content: TiptapEditorProps["content"];
  onChange: TiptapEditorProps["onChange"];
  placeholder: string;
  autoFocus: boolean;
  pageId: string;
  isReadOnly: boolean;
  onContentError: TiptapEditorProps["onContentError"];
  collaborationConfig: TiptapEditorProps["collaborationConfig"];
  editorRef: MutableRefObject<Editor | null>;
  lastSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
  handleLinkClick: (title: string) => void;
  handleStateChange: (state: WikiLinkSuggestionState) => void;
  handleSlashStateChange: (state: SlashSuggestionState) => void;
  handleRetryUpload: (nodeId: string) => void;
  handleRemoveUpload: (nodeId: string) => void;
  getProviderLabel: (providerId?: string | null) => string;
  canDeleteFromStorage: (providerId?: string | null) => boolean;
  handleDeleteFromStorage: (url: string, providerId?: string | null) => Promise<void>;
  handleCopyImageUrl: (src: string) => void;
  suggestionState: WikiLinkSuggestionState | null;
  slashState: SlashSuggestionState | null;
  suggestionRef: RefObject<WikiLinkSuggestionHandle | null>;
  slashRef: RefObject<SlashSuggestionHandle | null>;
  /** Note-linked workspace root for `@file:` (Issue #461). / `@file:` 用ワークスペースルート */
  workspaceRoot: string | null;
  /** Current note id for Tauri workspace registry reads (Issue #461). */
  noteId: string | null;
}

/**
 * Tiptap `useEditor` wiring: extensions, collaboration, note `@file:` root (Issue #461).
 * Tiptap の `useEditor` 拡張・コラボレーション・ノート連動 `@file:` ルート（Issue #461）。
 */
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
    suggestionState,
    slashState,
    suggestionRef,
    slashRef,
    workspaceRoot,
    noteId,
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
  const suggestionStateRef = useRef(suggestionState);
  useEffect(() => {
    slashStateRef.current = slashState;
    suggestionStateRef.current = suggestionState;
  }, [slashState, suggestionState]);

  const workspaceRootRef = useWorkspaceRootRef(workspaceRoot);
  const noteIdRef = useNoteIdRef(noteId);

  const editor = useEditor(
    {
      /* eslint-disable react-hooks/refs -- createEditorExtensions runs at render but refs are only read in ProseMirror/Tiptap handlers (not during render) */
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
            try {
              const r = await fetch(url, {
                credentials: "include",
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
        fileReference: {
          getWorkspaceRoot: () => workspaceRootRef.current,
          getNoteId: () => noteIdRef.current,
        },
      }),
      /* eslint-enable react-hooks/refs */
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

  /** Inserts a Mermaid diagram at the current selection. / 現在の選択位置に Mermaid を挿入する。 */
  const handleInsertMermaid = useCallback(
    (code: string) => {
      if (!editor) return;
      editor.chain().focus().deleteSelection().insertMermaid(code).run();
    },
    [editor],
  );

  return { editor, handleInsertMermaid, isEditorInitializedRef };
}
