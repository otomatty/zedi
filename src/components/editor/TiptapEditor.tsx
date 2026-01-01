import React, { useState, useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { useNavigate } from "react-router-dom";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import { cn } from "@/lib/utils";
import { WikiLink } from "./extensions/WikiLinkExtension";
import { Mermaid } from "./extensions/MermaidExtension";
import {
  WikiLinkSuggestionPlugin,
  wikiLinkSuggestionPluginKey,
  type WikiLinkSuggestionState,
} from "./extensions/wikiLinkSuggestionPlugin";
import {
  WikiLinkSuggestion,
  type SuggestionItem,
  type WikiLinkSuggestionHandle,
} from "./extensions/WikiLinkSuggestion";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";
import {
  usePageByTitle,
  useCreatePage,
  useCheckGhostLinkReferenced,
} from "@/hooks/usePageQueries";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  pageId?: string;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  onChange,
  placeholder = "思考を書き始める...",
  className,
  autoFocus = false,
  pageId,
}) => {
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const { checkReferenced } = useCheckGhostLinkReferenced();
  const [linkTitleToFind, setLinkTitleToFind] = useState<string | null>(null);
  const { data: foundPage } = usePageByTitle(linkTitleToFind || "");

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
  const [selectionMenuPos, setSelectionMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);

  // Pending link action
  const pendingLinkActionRef = useRef<{
    title: string;
    exists: boolean;
  } | null>(null);

  const handleStateChange = useCallback((state: WikiLinkSuggestionState) => {
    setSuggestionState(state);
  }, []);

  // Handle link click - navigate to page or create new
  const handleLinkClick = useCallback(
    async (title: string, exists: boolean) => {
      if (exists) {
        // Store the title to find and let useEffect handle navigation
        pendingLinkActionRef.current = { title, exists };
        setLinkTitleToFind(title);
      } else {
        // Create new page and navigate
        try {
          const newPage = await createPageMutation.mutateAsync({
            title,
            content: "",
          });
          navigate(`/page/${newPage.id}`);
        } catch (error) {
          console.error("Failed to create page:", error);
        }
      }
    },
    [createPageMutation, navigate]
  );

  // Navigate when found page changes
  useEffect(() => {
    if (foundPage && pendingLinkActionRef.current?.exists) {
      navigate(`/page/${foundPage.id}`);
      pendingLinkActionRef.current = null;
      setLinkTitleToFind(null);
    }
  }, [foundPage, navigate]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      // Typography for smart quotes and dashes
      Typography,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: "external-link text-blue-600 hover:underline cursor-pointer",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      WikiLink.configure({
        onLinkClick: handleLinkClick,
      }),
      WikiLinkSuggestionPlugin.configure({
        onStateChange: handleStateChange,
      }),
      Mermaid,
    ],
    content: content ? JSON.parse(content) : undefined,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: "tiptap-editor focus:outline-none",
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        if (target.hasAttribute("data-wiki-link")) {
          const title = target.getAttribute("data-title");
          const exists = target.getAttribute("data-exists") === "true";
          if (title) {
            handleLinkClick(title, exists);
          }
          return true;
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        if (suggestionState?.active && suggestionRef.current) {
          return suggestionRef.current.onKeyDown(event);
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON());
      onChange(json);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;
      const selectedText = editor.state.doc.textBetween(from, to, " ");

      // 10文字以上の選択時にメニューを表示
      if (hasSelection && selectedText.trim().length >= 10) {
        const coords = editor.view.coordsAtPos(from);
        const containerRect =
          editorContainerRef.current?.getBoundingClientRect();

        if (containerRect) {
          setSelectionMenuPos({
            top: coords.top - containerRect.top - 40,
            left: coords.left - containerRect.left,
          });
          setShowSelectionMenu(true);
        }
      } else {
        setShowSelectionMenu(false);
      }
    },
  });

  // Update editor content when prop changes (e.g., when page data is loaded)
  useEffect(() => {
    if (editor && content) {
      try {
        const parsedContent = JSON.parse(content);
        // Only update if content is different to avoid cursor jumping
        const currentContent = JSON.stringify(editor.getJSON());
        if (currentContent !== content) {
          editor.commands.setContent(parsedContent);
        }
      } catch (e) {
        // If content is not valid JSON, ignore
        console.warn("Invalid content JSON:", e);
      }
    }
  }, [editor, content]);

  // Update WikiLink referenced status when page loads
  useEffect(() => {
    if (!editor || !content) return;

    const updateWikiLinkReferencedStatus = async () => {
      const { doc, tr } = editor.state;
      let hasChanges = false;

      // Find all wikiLink marks in the document
      doc.descendants((node, pos) => {
        if (node.isText && node.marks.length > 0) {
          node.marks.forEach((mark) => {
            if (mark.type.name === "wikiLink" && !mark.attrs.exists) {
              // Check if this ghost link is referenced elsewhere
              checkReferenced(mark.attrs.title, pageId).then((isReferenced) => {
                if (isReferenced !== mark.attrs.referenced) {
                  // Update the mark with new referenced status
                  const from = pos;
                  const to = pos + node.nodeSize;

                  editor
                    .chain()
                    .setTextSelection({ from, to })
                    .extendMarkRange("wikiLink")
                    .updateAttributes("wikiLink", { referenced: isReferenced })
                    .run();

                  hasChanges = true;
                }
              });
            }
          });
        }
      });
    };

    // Run after a short delay to ensure content is loaded
    const timer = setTimeout(updateWikiLinkReferencedStatus, 100);
    return () => clearTimeout(timer);
  }, [editor, content, checkReferenced, pageId]);

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

  // Handle Mermaid generation
  const handleOpenMermaidDialog = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (selectedText.trim()) {
      setSelectedTextForMermaid(selectedText);
      setMermaidDialogOpen(true);
    }
  }, [editor]);

  const handleInsertMermaid = useCallback(
    (code: string) => {
      if (!editor) return;
      // 選択テキストを削除してMermaidを挿入
      editor.chain().focus().deleteSelection().insertMermaid(code).run();
    },
    [editor]
  );

  return (
    <div ref={editorContainerRef} className={cn("relative", className)}>
      <EditorContent editor={editor} />

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
    </div>
  );
};

export default TiptapEditor;
