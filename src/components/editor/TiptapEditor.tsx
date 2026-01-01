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
  useWikiLinkExistsChecker,
} from "@/hooks/usePageQueries";
import {
  extractWikiLinksFromContent,
  getUniqueWikiLinkTitles,
} from "@/lib/wikiLinkUtils";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const { checkExistence } = useWikiLinkExistsChecker();
  const [linkTitleToFind, setLinkTitleToFind] = useState<string | null>(null);
  const { data: foundPage, isFetched } = usePageByTitle(linkTitleToFind || "");

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

  // Create page confirmation dialog state
  const [createPageDialogOpen, setCreatePageDialogOpen] = useState(false);
  const [pendingCreatePageTitle, setPendingCreatePageTitle] = useState<
    string | null
  >(null);

  const handleStateChange = useCallback((state: WikiLinkSuggestionState) => {
    setSuggestionState(state);
  }, []);

  // Handle link click - navigate to page or create new
  // WikiLinkクリック時は常に既存ページの存在をチェック
  const handleLinkClick = useCallback(
    async (title: string, _exists: boolean) => {
      // まず既存ページを検索（タイトルの完全一致）
      pendingLinkActionRef.current = { title, exists: true };
      setLinkTitleToFind(title);
    },
    []
  );

  // Navigate when found page changes
  useEffect(() => {
    const handleNavigation = async () => {
      // linkTitleToFindが設定されていない場合は何もしない
      if (!linkTitleToFind || !pendingLinkActionRef.current) return;

      const { title } = pendingLinkActionRef.current;

      // タイトルが一致しない場合は何もしない
      if (linkTitleToFind !== title) return;

      // クエリがまだ完了していない場合は待機
      if (!isFetched) return;

      // ユーザーがクリックしていない場合は何もしない（初期レンダリング対策）
      if (!title.trim()) return;

      if (foundPage) {
        // 既存ページが見つかった場合はそのページに移動
        navigate(`/page/${foundPage.id}`);
      } else {
        // ページが見つからなかった場合は確認ダイアログを表示
        setPendingCreatePageTitle(title);
        setCreatePageDialogOpen(true);
      }

      // 状態をクリア
      pendingLinkActionRef.current = null;
      setLinkTitleToFind(null);
    };

    handleNavigation();
  }, [foundPage, isFetched, linkTitleToFind, navigate]);

  // Handle create page confirmation
  const handleConfirmCreatePage = useCallback(async () => {
    if (!pendingCreatePageTitle) return;

    try {
      const newPage = await createPageMutation.mutateAsync({
        title: pendingCreatePageTitle,
        content: "",
      });
      setCreatePageDialogOpen(false);
      setPendingCreatePageTitle(null);
      navigate(`/page/${newPage.id}`);
    } catch (error) {
      console.error("Failed to create page:", error);
    }
  }, [pendingCreatePageTitle, createPageMutation, navigate]);

  const handleCancelCreatePage = useCallback(() => {
    setCreatePageDialogOpen(false);
    setPendingCreatePageTitle(null);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        // StarterKit doesn't include Link by default
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
    // Prevent SSR hydration issues
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap-editor focus:outline-none",
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

  // Track if WikiLink status has been updated for current pageId
  const wikiLinkStatusUpdatedRef = useRef<string | null>(null);

  // Update WikiLink exists and referenced status when page loads
  useEffect(() => {
    if (!editor || !content || !pageId) return;

    // Skip if already updated for this page
    if (wikiLinkStatusUpdatedRef.current === pageId) return;

    const updateWikiLinkStatus = async () => {
      // Extract all WikiLinks from content
      const wikiLinks = extractWikiLinksFromContent(content);

      console.group(`🔗 WikiLink Status Check (pageId: ${pageId})`);
      console.log("Extracted WikiLinks from content:", wikiLinks);

      if (wikiLinks.length === 0) {
        console.log("No WikiLinks found in content");
        console.groupEnd();
        wikiLinkStatusUpdatedRef.current = pageId;
        return;
      }

      // Get unique titles to check
      const titles = getUniqueWikiLinkTitles(wikiLinks);
      console.log("Unique titles to check:", titles);

      // Check existence and referenced status for all titles
      const { pageTitles, referencedTitles } = await checkExistence(
        titles,
        pageId
      );

      console.log("Existing page titles (from DB):", [...pageTitles]);
      console.log("Referenced titles (ghost_links from other pages):", [
        ...referencedTitles,
      ]);

      // If pageTitles is empty, the check might not be ready yet - retry later
      // But only if we have titles to check
      if (pageTitles.size === 0 && titles.length > 0) {
        console.warn(
          "⚠️ pageTitles is empty - checkExistence may not be ready yet. Will retry..."
        );
        console.groupEnd();
        // Don't mark as updated - will retry on next render
        return;
      }

      // Find and update WikiLink marks in the document
      const { doc } = editor.state;
      const updates: Array<{
        from: number;
        to: number;
        exists: boolean;
        referenced: boolean;
        title: string;
        oldExists: boolean;
        oldReferenced: boolean;
      }> = [];

      doc.descendants((node, pos) => {
        if (node.isText && node.marks.length > 0) {
          node.marks.forEach((mark) => {
            if (mark.type.name === "wikiLink") {
              const normalizedTitle = (mark.attrs.title as string)
                .toLowerCase()
                .trim();
              const newExists = pageTitles.has(normalizedTitle);
              const newReferenced = referencedTitles.has(normalizedTitle);

              console.log(
                `  📄 "${mark.attrs.title}" (normalized: "${normalizedTitle}"):`
              );
              console.log(
                `     Current: exists=${mark.attrs.exists}, referenced=${mark.attrs.referenced}`
              );
              console.log(
                `     Should be: exists=${newExists}, referenced=${newReferenced}`
              );
              console.log(
                `     Page exists in DB: ${newExists ? "✅ YES" : "❌ NO"}`
              );

              // Only update if status changed
              if (
                mark.attrs.exists !== newExists ||
                mark.attrs.referenced !== newReferenced
              ) {
                console.log(`     🔄 WILL UPDATE`);
                updates.push({
                  from: pos,
                  to: pos + node.nodeSize,
                  exists: newExists,
                  referenced: newReferenced,
                  title: mark.attrs.title,
                  oldExists: mark.attrs.exists,
                  oldReferenced: mark.attrs.referenced,
                });
              } else {
                console.log(`     ✓ No change needed`);
              }
            }
          });
        }
      });

      // Mark as updated for this page
      wikiLinkStatusUpdatedRef.current = pageId;

      // Apply updates (in reverse order to maintain positions)
      if (updates.length > 0) {
        console.log(`\n📝 Applying ${updates.length} update(s)...`);
        for (const update of updates.reverse()) {
          console.log(
            `   Updating "${update.title}": exists ${update.oldExists} → ${update.exists}, referenced ${update.oldReferenced} → ${update.referenced}`
          );
          editor
            .chain()
            .setTextSelection({ from: update.from, to: update.to })
            .extendMarkRange("wikiLink")
            .updateAttributes("wikiLink", {
              exists: update.exists,
              referenced: update.referenced,
            })
            .run();
        }

        // Trigger onChange to persist the changes
        const json = JSON.stringify(editor.getJSON());
        onChange(json);
        console.log("✅ Changes persisted");
      } else {
        console.log("\n✓ No updates needed - all WikiLinks are up to date");
      }
      console.groupEnd();
    };

    // Run after a short delay to ensure content is loaded
    const timer = setTimeout(updateWikiLinkStatus, 150);
    return () => clearTimeout(timer);
  }, [editor, content, checkExistence, pageId, onChange]);

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

      {/* Create Page Confirmation Dialog */}
      <AlertDialog
        open={createPageDialogOpen}
        onOpenChange={setCreatePageDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ページを作成しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingCreatePageTitle}
              」というタイトルのページはまだ存在しません。
              新しいページを作成しますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelCreatePage}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreatePage}>
              作成する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TiptapEditor;
