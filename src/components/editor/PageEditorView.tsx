import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Trash2,
  MoreHorizontal,
  Loader2,
  Download,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import TiptapEditor from "./TiptapEditor";
import { WikiGeneratorButton } from "./WikiGeneratorButton";
import Container from "@/components/layout/Container";
import {
  usePage,
  useCreatePage,
  useUpdatePage,
  useDeletePage,
} from "@/hooks/usePageQueries";
import { formatTimeAgo } from "@/lib/dateUtils";
import { generateAutoTitle } from "@/lib/contentUtils";
import {
  downloadMarkdown,
  copyMarkdownToClipboard,
} from "@/lib/markdownExport";
import { useToast } from "@/hooks/use-toast";

const PageEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isNewPage = id === "new";
  const pageId = isNewPage ? "" : id || "";

  // React Query hooks
  const { data: page, isLoading, isError } = usePage(pageId);
  const createPageMutation = useCreatePage();
  const updatePageMutation = useUpdatePage();
  const deletePageMutation = useDeletePage();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Refs for debouncing
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create new page
  useEffect(() => {
    if (isNewPage && !currentPageId && !createPageMutation.isPending) {
      createPageMutation.mutate(
        { title: "", content: "" },
        {
          onSuccess: (newPage) => {
            setCurrentPageId(newPage.id);
            setTitle("");
            setContent("");
            setLastSaved(newPage.updatedAt);
            setIsInitialized(true);
            // Update URL without navigation
            window.history.replaceState(null, "", `/page/${newPage.id}`);
          },
          onError: () => {
            toast({
              title: "ページの作成に失敗しました",
              variant: "destructive",
            });
            navigate("/");
          },
        }
      );
    }
  }, [isNewPage, currentPageId, createPageMutation, navigate, toast]);

  // Load existing page
  useEffect(() => {
    if (!isNewPage && page && !isInitialized) {
      setCurrentPageId(page.id);
      setTitle(page.title);
      setContent(page.content);
      setLastSaved(page.updatedAt);
      setIsInitialized(true);
    }
  }, [isNewPage, page, isInitialized]);

  // Handle page not found
  useEffect(() => {
    if (!isNewPage && isError) {
      navigate("/");
      toast({
        title: "ページが見つかりません",
        variant: "destructive",
      });
    }
  }, [isNewPage, isError, navigate, toast]);

  // Debounced save function
  const saveChanges = useCallback(
    (newTitle: string, newContent: string) => {
      if (!currentPageId) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        updatePageMutation.mutate(
          {
            pageId: currentPageId,
            updates: { title: newTitle, content: newContent },
          },
          {
            onSuccess: () => {
              setLastSaved(Date.now());
            },
          }
        );
      }, 500); // 500ms debounce
    },
    [currentPageId, updatePageMutation]
  );

  // Auto-save on changes
  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      // Auto-generate title if empty
      const autoTitle = !title ? generateAutoTitle(newContent) : title;
      if (!title && autoTitle !== "無題のページ") {
        setTitle(autoTitle);
      }
      saveChanges(autoTitle || title, newContent);
    },
    [title, saveChanges]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      saveChanges(newTitle, content);
    },
    [content, saveChanges]
  );

  // Wiki生成結果をエディタに反映
  const handleWikiGenerated = useCallback(
    (tiptapContent: string) => {
      setContent(tiptapContent);
      saveChanges(title, tiptapContent);
    },
    [title, saveChanges]
  );

  // コンテンツが空でないかチェック（Tiptap JSON形式）
  const isContentNotEmpty = useCallback((contentJson: string): boolean => {
    if (!contentJson) return false;
    try {
      const parsed = JSON.parse(contentJson);
      // doc.contentが空または空の段落のみかチェック
      if (!parsed.content || parsed.content.length === 0) return false;
      // 空の段落のみの場合もfalse
      const hasRealContent = parsed.content.some(
        (node: { type: string; content?: unknown[] }) => {
          if (node.type === "paragraph") {
            return node.content && node.content.length > 0;
          }
          return true; // 段落以外のノード（見出しなど）があればtrue
        }
      );
      return hasRealContent;
    } catch {
      return contentJson.trim().length > 0;
    }
  }, []);

  const handleDelete = useCallback(() => {
    if (currentPageId) {
      deletePageMutation.mutate(currentPageId, {
        onSuccess: () => {
          toast({
            title: "ページを削除しました",
          });
          navigate("/");
        },
        onError: () => {
          toast({
            title: "削除に失敗しました",
            variant: "destructive",
          });
        },
      });
    }
  }, [currentPageId, deletePageMutation, navigate, toast]);

  const handleBack = useCallback(() => {
    // Delete page if it's new and has no title or content
    if (isNewPage && currentPageId && !title.trim() && !content.trim()) {
      deletePageMutation.mutate(currentPageId);
    }
    navigate("/");
  }, [navigate, isNewPage, currentPageId, title, content, deletePageMutation]);

  // Export handlers
  const handleExportMarkdown = useCallback(() => {
    downloadMarkdown(title, content);
    toast({
      title: "Markdownファイルをダウンロードしました",
    });
  }, [title, content, toast]);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      await copyMarkdownToClipboard(title, content);
      toast({
        title: "Markdownをクリップボードにコピーしました",
      });
    } catch (error) {
      toast({
        title: "コピーに失敗しました",
        variant: "destructive",
      });
    }
  }, [title, content, toast]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Show loading state
  if (!isNewPage && isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show loading for new page creation
  if (isNewPage && !isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-14 items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex-1 min-w-0">
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="ページタイトル"
              className="border-0 bg-transparent text-lg font-medium focus-visible:ring-0 px-0 h-auto py-1"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Wiki Generator Button - タイトルがあり本文が空の場合のみ表示 */}
            <WikiGeneratorButton
              title={title}
              hasContent={isContentNotEmpty(content)}
              onGenerated={handleWikiGenerated}
            />
            {lastSaved && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {formatTimeAgo(lastSaved)}に保存
              </span>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportMarkdown}>
                  <Download className="mr-2 h-4 w-4" />
                  Markdownでエクスポート
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyMarkdown}>
                  <Copy className="mr-2 h-4 w-4" />
                  Markdownをコピー
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Container>
      </header>

      {/* Editor */}
      <main className="flex-1 py-6">
        <Container>
          <div className="max-w-2xl mx-auto">
            <TiptapEditor
              content={content}
              onChange={handleContentChange}
              autoFocus={isNewPage}
              className="min-h-[calc(100vh-200px)]"
            />
          </div>
        </Container>
      </main>
    </div>
  );
};

export default PageEditor;
