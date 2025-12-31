import React, { useState, useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { useNavigate } from "react-router-dom";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import { cn } from "@/lib/utils";
import { WikiLink } from "./extensions/WikiLinkExtension";
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
import { usePageByTitle, useCreatePage } from "@/hooks/usePageQueries";

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  onChange,
  placeholder = "思考を書き始める...",
  className,
  autoFocus = false,
}) => {
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
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
        openOnClick: false,
        HTMLAttributes: {
          class: "internal-link",
        },
      }),
      WikiLink.configure({
        onLinkClick: handleLinkClick,
      }),
      WikiLinkSuggestionPlugin.configure({
        onStateChange: handleStateChange,
      }),
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
    (item: SuggestionItem) => {
      if (!editor || !suggestionState?.range) return;

      const { from, to } = suggestionState.range;

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
    [editor, suggestionState]
  );

  const handleSuggestionClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.view.state.tr.setMeta(wikiLinkSuggestionPluginKey, { close: true })
    );
  }, [editor]);

  return (
    <div ref={editorContainerRef} className={cn("relative", className)}>
      <EditorContent editor={editor} />

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
    </div>
  );
};

export default TiptapEditor;
