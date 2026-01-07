import React, { useState, useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { cn } from "@/lib/utils";
import {
  wikiLinkSuggestionPluginKey,
  type WikiLinkSuggestionState,
} from "./extensions/wikiLinkSuggestionPlugin";
import {
  WikiLinkSuggestion,
  type SuggestionItem,
  type WikiLinkSuggestionHandle,
} from "./extensions/WikiLinkSuggestion";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";
import { useCheckGhostLinkReferenced } from "@/hooks/usePageQueries";
import { useContentSanitizer, type ContentError } from "./TiptapEditor/useContentSanitizer";
import { useWikiLinkNavigation } from "./TiptapEditor/useWikiLinkNavigation";
import { useWikiLinkStatusSync } from "./TiptapEditor/useWikiLinkStatusSync";
import { useEditorSelectionMenu } from "./TiptapEditor/useEditorSelectionMenu";
import { createEditorExtensions, defaultEditorProps } from "./TiptapEditor/editorConfig";
import { CreatePageDialog } from "./TiptapEditor/CreatePageDialog";
import type { TiptapEditorProps } from "./TiptapEditor/types";
import { Button } from "@/components/ui/button";
import { GitBranch, Image as ImageIcon, Loader2 } from "lucide-react";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useToast } from "@/hooks/use-toast";

// Re-export types for consumers
export type { ContentError } from "./TiptapEditor/useContentSanitizer";
export type { TiptapEditorProps } from "./TiptapEditor/types";

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  onChange,
  placeholder = "思考を書き始める...",
  className,
  autoFocus = false,
  pageId,
  isReadOnly = false,
  onContentError,
}) => {
  const { checkReferenced } = useCheckGhostLinkReferenced();

  // WikiLink navigation hook
  const {
    handleLinkClick,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  } = useWikiLinkNavigation();

  const [suggestionState, setSuggestionState] =
    useState<WikiLinkSuggestionState | null>(null);
  const [suggestionPos, setSuggestionPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const suggestionRef = useRef<WikiLinkSuggestionHandle>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Mermaid generator state
  const [mermaidDialogOpen, setMermaidDialogOpen] = useState(false);
  const [selectedTextForMermaid, setSelectedTextForMermaid] = useState("");

  // Selection menu hook
  const {
    showMenu: showSelectionMenu,
    menuPosition: selectionMenuPos,
    selectedText,
    handleOpenMermaidDialog: handleOpenMermaidDialogFromHook,
    handleSelectionUpdate,
  } = useEditorSelectionMenu({
    containerRef: editorContainerRef,
    onOpenMermaidDialog: (text) => {
      setSelectedTextForMermaid(text);
      setMermaidDialogOpen(true);
    },
  });

  // Image upload hook
  const { uploadImage, isUploading, isConfigured: isStorageConfigured } = useImageUpload();
  const { toast } = useToast();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flag to track if editor has been initialized with content
  // Prevents onUpdate from overwriting content before page data is loaded
  const isEditorInitializedRef = useRef(false);

  const handleStateChange = useCallback((state: WikiLinkSuggestionState) => {
    setSuggestionState(state);
  }, []);

  // Parse initial content (sanitization will be done in useContentSanitizer hook)
  let initialParsedContent: unknown = undefined;

  if (content) {
    try {
      // Parse content without sanitization here - sanitization will be done in useContentSanitizer
      initialParsedContent = JSON.parse(content);
    } catch (e) {
      // If content is not valid JSON, report error
      console.error("Failed to parse content:", e);
      if (onContentError) {
        onContentError({
          message: "コンテンツの解析に失敗しました。データが破損している可能性があります。",
          removedNodeTypes: [],
          removedMarkTypes: [],
          wasSanitized: false,
        });
      }
    }
  }

  const editor = useEditor({
    extensions: createEditorExtensions({
      placeholder,
      onLinkClick: handleLinkClick,
      onStateChange: handleStateChange,
    }),
    content: initialParsedContent,
    autofocus: autoFocus ? "end" : false,
    editable: !isReadOnly,
    // Prevent SSR hydration issues
    immediatelyRender: false,
    editorProps: {
      ...defaultEditorProps,
      handleKeyDown: (view, event) => {
        if (suggestionState?.active && suggestionRef.current) {
          return suggestionRef.current.onKeyDown(event);
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      // Only call onChange after editor has been properly initialized with content
      // This prevents overwriting page content with empty editor state
      if (!isEditorInitializedRef.current) {
        const currentJson = JSON.stringify(editor.getJSON());
        const isEmpty = currentJson.length <= 50; // Empty doc is ~47 chars
        
        // If user is typing in a new/empty page, mark as initialized
        if (!isEmpty) {
          isEditorInitializedRef.current = true;
        } else {
          return;
        }
      }
      const json = JSON.stringify(editor.getJSON());
      onChange(json);
    },
    onCreate: () => {
      // If content was provided at initialization, mark as initialized
      if (initialParsedContent) {
        isEditorInitializedRef.current = true;
      }
    },
    onSelectionUpdate: handleSelectionUpdate,
  });

  // isReadOnlyの変更を検知してエディターの編集可能状態を更新
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  // Use content sanitizer hook
  useContentSanitizer({
    editor,
    content,
    onError: onContentError,
    onContentUpdated: (initialized) => {
      if (initialized) {
        isEditorInitializedRef.current = true;
      }
    },
  });

  // Use WikiLink status sync hook
  useWikiLinkStatusSync({
    editor,
    content,
    pageId: pageId || undefined,
    onChange,
  });

  // Update suggestion position
  useEffect(() => {
    if (!editor || !suggestionState?.active || !suggestionState.range) {
      setSuggestionPos(null);
      return;
    }

    const { from } = suggestionState.range;
    const coords = editor.view.coordsAtPos(from);
    const containerRect = editorContainerRef.current?.getBoundingClientRect();

    if (containerRect) {
      setSuggestionPos({
        top: coords.bottom - containerRect.top + 4,
        left: coords.left - containerRect.left,
      });
    }
  }, [editor, suggestionState]);

  const handleSuggestionSelect = useCallback(
    async (item: SuggestionItem) => {
      if (!editor || !suggestionState?.range) return;

      const { from, to } = suggestionState.range;

      // Check if this link text is referenced in other pages (ghost_links)
      let referenced = false;
      if (!item.exists) {
        referenced = await checkReferenced(item.title, pageId);
      }

      // Delete the [[ trigger text
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent([
          {
            type: "text",
            marks: [
              {
                type: "wikiLink",
                attrs: {
                  title: item.title,
                  exists: item.exists,
                  referenced: referenced,
                },
              },
            ],
            text: `[[${item.title}]]`,
          },
        ])
        .run();

      // Close suggestion
      editor.view.dispatch(
        editor.view.state.tr.setMeta(wikiLinkSuggestionPluginKey, {
          close: true,
        })
      );
    },
    [editor, suggestionState, checkReferenced, pageId]
  );

  const handleSuggestionClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.view.state.tr.setMeta(wikiLinkSuggestionPluginKey, { close: true })
    );
  }, [editor]);

  // Handle Mermaid generation (use hook's handler)
  const handleOpenMermaidDialog = handleOpenMermaidDialogFromHook;

  const handleInsertMermaid = useCallback(
    (code: string) => {
      if (!editor) return;
      // 選択テキストを削除してMermaidを挿入
      editor.chain().focus().deleteSelection().insertMermaid(code).run();
    },
    [editor]
  );

  // Image upload handler
  const handleImageUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!editor) return;

      const imageFiles = Array.from(files).filter((file) =>
        file.type.startsWith("image/")
      );

      if (imageFiles.length === 0) return;

      // Check if storage is configured
      if (!isStorageConfigured) {
        toast({
          title: "ストレージ未設定",
          description: "設定画面で画像ストレージを設定してください",
          variant: "destructive",
        });
        return;
      }

      for (const file of imageFiles) {
        try {
          const url = await uploadImage(file);
          editor
            .chain()
            .focus()
            .setImage({ src: url, alt: file.name })
            .run();
        } catch (error) {
          toast({
            title: "アップロード失敗",
            description:
              error instanceof Error ? error.message : "画像のアップロードに失敗しました",
            variant: "destructive",
          });
        }
      }
    },
    [editor, uploadImage, isStorageConfigured, toast]
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleImageUpload(e.target.files);
        // Reset input value to allow selecting the same file again
        e.target.value = "";
      }
    },
    [handleImageUpload]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (e.dataTransfer?.files?.length) {
        handleImageUpload(e.dataTransfer.files);
      }
    },
    [handleImageUpload]
  );

  // Handle paste events for images
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length > 0) {
        event.preventDefault();
        const files = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        handleImageUpload(files);
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("paste", handlePaste);

    return () => {
      editorElement.removeEventListener("paste", handlePaste);
    };
  }, [editor, handleImageUpload]);

  return (
    <div
      ref={editorContainerRef}
      className={cn("relative", className, isDraggingOver && "ring-2 ring-primary ring-dashed")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      <EditorContent editor={editor} />

      {/* Drag overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-primary/10 flex items-center justify-center pointer-events-none z-40">
          <div className="bg-background border-2 border-dashed border-primary rounded-lg p-4 text-center">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground">画像をドロップしてアップロード</p>
          </div>
        </div>
      )}

      {/* Upload progress indicator */}
      {isUploading && (
        <div className="absolute top-2 right-2 bg-background border rounded-lg shadow-lg p-2 flex items-center gap-2 z-50">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm">アップロード中...</span>
        </div>
      )}

      {/* Selection Menu - テキスト選択時に表示 */}
      {showSelectionMenu && selectionMenuPos && (
        <div
          className="absolute z-50 flex items-center gap-1 bg-background border rounded-lg shadow-lg p-1"
          style={{
            top: selectionMenuPos.top,
            left: selectionMenuPos.left,
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={handleOpenMermaidDialog}
            className="text-xs"
          >
            <GitBranch className="h-4 w-4 mr-1" />
            ダイアグラム生成
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs"
            disabled={isUploading}
          >
            <ImageIcon className="h-4 w-4 mr-1" />
            画像を挿入
          </Button>
        </div>
      )}

      {/* Wiki Link Suggestion Popup */}
      {suggestionState?.active && suggestionPos && editor && (
        <div
          className="absolute z-50"
          style={{
            top: suggestionPos.top,
            left: suggestionPos.left,
          }}
        >
          <WikiLinkSuggestion
            ref={suggestionRef}
            editor={editor}
            query={suggestionState.query}
            range={suggestionState.range!}
            onSelect={handleSuggestionSelect}
            onClose={handleSuggestionClose}
          />
        </div>
      )}

      {/* Mermaid Generator Dialog */}
      <MermaidGeneratorDialog
        open={mermaidDialogOpen}
        onOpenChange={setMermaidDialogOpen}
        selectedText={selectedTextForMermaid}
        onInsert={handleInsertMermaid}
      />

      {/* Create Page Confirmation Dialog */}
      <CreatePageDialog
        open={createPageDialogOpen}
        pageTitle={pendingCreatePageTitle}
        onConfirm={handleConfirmCreate}
        onCancel={handleCancelCreate}
      />
    </div>
  );
};

export default TiptapEditor;
