import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Trash2,
  MoreHorizontal,
  Loader2,
  Download,
  Copy,
  Link2,
  AlertTriangle,
  ExternalLink,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import TiptapEditor from "./TiptapEditor";
import { WikiGeneratorButton } from "./WikiGeneratorButton";
import { WebClipperDialog } from "./WebClipperDialog";
import { SourceUrlBadge } from "./SourceUrlBadge";
import Container from "@/components/layout/Container";
import {
  usePage,
  useCreatePage,
  useUpdatePage,
  useDeletePage,
  useSyncWikiLinks,
} from "@/hooks/usePageQueries";
import { useTitleValidation } from "@/hooks/useTitleValidation";
import { formatTimeAgo } from "@/lib/dateUtils";
import { generateAutoTitle } from "@/lib/contentUtils";
import { extractWikiLinksFromContent } from "@/lib/wikiLinkUtils";
import {
  downloadMarkdown,
  copyMarkdownToClipboard,
} from "@/lib/markdownExport";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

// モジュールスコープで作成済みのページIDを追跡（Strict Mode対策）
// key: createKey (id || "new-page"), value: 作成されたページID
const createdPageMap = new Map<string, string>();

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
  const { syncLinks } = useSyncWikiLinks();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [webClipperOpen, setWebClipperOpen] = useState(false);
  const [originalTitle, setOriginalTitle] = useState<string>("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState<string>("");

  // Refs for debouncing
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ページIDが変わった時にモジュールスコープの追跡をクリーンアップ
  useEffect(() => {
    return () => {
      // コンポーネントのアンマウント時にcreatingPageIdsをクリーンアップしない
      // Strict Modeの再マウント時に重複作成を防ぐため
    };
  }, [id]);

  // ページIDが変わった時に状態をリセット
  useEffect(() => {
    // 別のページに遷移した場合、状態をリセットして再読み込みを促す
    if (currentPageId && currentPageId !== pageId && !isNewPage) {
      setIsInitialized(false);
      setCurrentPageId(null);
      setTitle("");
      setContent("");
      setSourceUrl(undefined);
      setLastSaved(null);
      setOriginalTitle("");
    }
  }, [pageId, currentPageId, isNewPage]);

  // タイトル重複チェック
  const {
    duplicatePage,
    isValidating,
    isEmpty: isTitleEmpty,
    errorMessage,
    validateTitle,
    initializeWithTitle,
    shouldBlockSave,
  } = useTitleValidation({
    currentPageId: currentPageId || undefined,
    isNewPage,
    debounceMs: 300,
  });

  // Create new page
  useEffect(() => {
    if (!isNewPage || currentPageId || isInitialized) {
      return;
    }

    // モジュールスコープのMapを使って一度だけ実行されるようにする（Strict Modeの二重レンダリング対策）
    const createKey = id || "new-page";

    // 既に作成済みのページがある場合は、その状態を復元
    const existingPageId = createdPageMap.get(createKey);
    if (existingPageId && existingPageId !== "pending") {
      // 実際のページIDがある場合は復元
      setCurrentPageId(existingPageId);
      setTitle("");
      setContent("");
      setIsInitialized(true);
      window.history.replaceState(null, "", `/page/${existingPageId}`);
      return;
    }

    // まだ作成処理が開始されていない場合のみ作成
    if (!createdPageMap.has(createKey)) {
      // 作成開始をマーク
      createdPageMap.set(createKey, "pending");
      createPageMutation.mutate(
        { title: "", content: "" },
        {
          onSuccess: (newPage) => {
            // 作成されたページIDを保存
            createdPageMap.set(createKey, newPage.id);
            setCurrentPageId(newPage.id);
            setTitle("");
            setContent("");
            setLastSaved(newPage.updatedAt);
            setIsInitialized(true);
            // Update URL without navigation
            window.history.replaceState(null, "", `/page/${newPage.id}`);
          },
          onError: () => {
            createdPageMap.delete(createKey); // エラー時はリトライ可能に
            toast({
              title: "ページの作成に失敗しました",
              variant: "destructive",
            });
            navigate("/");
          },
        }
      );
    }
    // 作成中（pending）の場合は何もしない - onSuccessが呼ばれるのを待つ
  }, [
    isNewPage,
    currentPageId,
    isInitialized,
    createPageMutation,
    navigate,
    toast,
    id,
  ]);

  // Strict Mode対策: pending状態のページが作成完了したら状態を復元
  useEffect(() => {
    if (!isNewPage || currentPageId || isInitialized) {
      return;
    }

    const createKey = id || "new-page";
    const existingPageId = createdPageMap.get(createKey);

    // pendingではない実際のページIDがある場合は復元
    if (existingPageId && existingPageId !== "pending") {
      setCurrentPageId(existingPageId);
      setTitle("");
      setContent("");
      setIsInitialized(true);
      window.history.replaceState(null, "", `/page/${existingPageId}`);
    }
  }, [isNewPage, currentPageId, isInitialized, id]);

  // Load existing page
  useEffect(() => {
    if (!isNewPage && page && !isInitialized) {
      setCurrentPageId(page.id);
      setTitle(page.title);
      setOriginalTitle(page.title);
      setContent(page.content);
      setSourceUrl(page.sourceUrl);
      setLastSaved(page.updatedAt);
      setIsInitialized(true);
      // 既存ページのタイトルで状態を初期化（重複チェックは行わない）
      initializeWithTitle(page.title);
    }
  }, [isNewPage, page, isInitialized, initializeWithTitle]);

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

  // Debounced save function (タイトル重複時は保存をブロック)
  const saveChanges = useCallback(
    (newTitle: string, newContent: string, forceBlockTitle = false) => {
      if (!currentPageId) return;

      // WikiLinkを抽出して同期する関数
      const syncWikiLinksFromContent = async (contentToSync: string) => {
        const wikiLinks = extractWikiLinksFromContent(contentToSync);
        if (wikiLinks.length > 0) {
          await syncLinks(currentPageId, wikiLinks);
        }
      };

      // タイトル重複時は保存をブロック
      if (forceBlockTitle || shouldBlockSave) {
        // コンテンツのみ保存（タイトルは元のまま）
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          updatePageMutation.mutate(
            {
              pageId: currentPageId,
              updates: { content: newContent },
            },
            {
              onSuccess: () => {
                setLastSaved(Date.now());
                // WikiLink同期
                syncWikiLinksFromContent(newContent);
              },
            }
          );
        }, 500);
        return;
      }

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
              // WikiLink同期
              syncWikiLinksFromContent(newContent);
            },
          }
        );
      }, 500); // 500ms debounce
    },
    [currentPageId, updatePageMutation, shouldBlockSave, syncLinks]
  );

  // Auto-save on changes
  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      // Auto-generate title if empty
      const autoTitle = !title ? generateAutoTitle(newContent) : title;
      if (!title && autoTitle !== "無題のページ") {
        setTitle(autoTitle);
        validateTitle(autoTitle);
      }
      saveChanges(autoTitle || title, newContent);
    },
    [title, saveChanges, validateTitle]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      validateTitle(newTitle);
      // タイトル重複チェックは非同期なので、保存はvalidateTitleの結果を待たずに行う
      // shouldBlockSaveがtrueの場合はsaveChanges内でコンテンツのみ保存される
      saveChanges(newTitle, content);
    },
    [content, saveChanges, validateTitle]
  );

  // 既存ページを開くハンドラー
  const handleOpenDuplicatePage = useCallback(() => {
    if (duplicatePage) {
      navigate(`/page/${duplicatePage.id}`);
    }
  }, [duplicatePage, navigate]);

  // Wiki生成結果をエディタに反映
  const handleWikiGenerated = useCallback(
    (tiptapContent: string) => {
      setContent(tiptapContent);
      saveChanges(title, tiptapContent);
    },
    [title, saveChanges]
  );

  // Web Clipper結果をエディタに反映
  const handleWebClipped = useCallback(
    (
      clippedTitle: string,
      clippedContent: string,
      clippedSourceUrl: string,
      thumbnailUrl?: string | null
    ) => {
      setTitle(clippedTitle);
      setContent(clippedContent);
      setSourceUrl(clippedSourceUrl);

      if (currentPageId) {
        updatePageMutation.mutate(
          {
            pageId: currentPageId,
            updates: {
              title: clippedTitle,
              content: clippedContent,
              sourceUrl: clippedSourceUrl,
              thumbnailUrl: thumbnailUrl || undefined,
            },
          },
          {
            onSuccess: () => {
              setLastSaved(Date.now());
              toast({
                title: "Webページを取り込みました",
              });
            },
          }
        );
      }
    },
    [currentPageId, updatePageMutation, toast]
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
    const hasContent = isContentNotEmpty(content);
    const isTitleEmptyOrUntitled = !title.trim();

    // 削除が必要なケースを判定
    // 1. タイトル重複警告がある場合
    // 2. タイトルが空（無題）の場合
    const shouldDeleteForDuplicate = currentPageId && shouldBlockSave;
    const shouldDeleteForEmptyTitle = currentPageId && isTitleEmptyOrUntitled;

    if (shouldDeleteForDuplicate || shouldDeleteForEmptyTitle) {
      // コンテンツがある場合は確認ダイアログを表示
      if (hasContent) {
        if (shouldDeleteForDuplicate) {
          setDeleteReason("重複するタイトルのページ");
        } else {
          setDeleteReason("タイトルが未入力のページ");
        }
        setDeleteConfirmOpen(true);
        return;
      }

      // コンテンツがない場合はそのまま削除
      deletePageMutation.mutate(currentPageId);
      if (shouldDeleteForDuplicate) {
        toast({
          title: "重複するタイトルのため、ページを削除しました",
        });
      } else {
        toast({
          title: "タイトルが未入力のため、ページを削除しました",
        });
      }
    }
    navigate("/");
  }, [
    navigate,
    currentPageId,
    title,
    content,
    deletePageMutation,
    shouldBlockSave,
    toast,
    isContentNotEmpty,
  ]);

  // 削除確認ダイアログで「削除」を選択した場合
  const handleConfirmDelete = useCallback(() => {
    if (currentPageId) {
      deletePageMutation.mutate(currentPageId);
      toast({
        title: `${deleteReason}を削除しました`,
      });
    }
    setDeleteConfirmOpen(false);
    navigate("/");
  }, [currentPageId, deletePageMutation, deleteReason, navigate, toast]);

  // 削除確認ダイアログで「キャンセル」を選択した場合
  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
  }, []);

  // Cmd+H ショートカットをインターセプトしてhandleBackを呼び出す
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+H / Ctrl+H - ホームに戻る（handleBackを通す）
      if ((e.metaKey || e.ctrlKey) && e.key === "h") {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
      }
    };

    // captureフェーズでイベントをキャッチ（GlobalShortcutsProviderより先に処理）
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleBack]);

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
              className={`border-0 bg-transparent text-lg font-medium focus-visible:ring-0 px-0 h-auto py-1 ${
                errorMessage || (!isNewPage && isTitleEmpty && title === "")
                  ? "text-destructive"
                  : ""
              }`}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Wiki Generator Button - タイトルがあり本文が空の場合のみ表示 */}
            <WikiGeneratorButton
              title={title}
              hasContent={isContentNotEmpty(content)}
              onGenerated={handleWikiGenerated}
            />
            {/* Web Clipper Button - 本文が空の場合のみ表示 */}
            {!isContentNotEmpty(content) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setWebClipperOpen(true)}
                  >
                    <Link2 className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>URLから取り込み</TooltipContent>
              </Tooltip>
            )}
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
                <DropdownMenuItem onClick={() => setWebClipperOpen(true)}>
                  <Link2 className="mr-2 h-4 w-4" />
                  URLから取り込み
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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

      {/* タイトル警告エリア */}
      {(duplicatePage || (!isNewPage && isTitleEmpty && title === "")) && (
        <div className="border-b border-border bg-destructive/10">
          <Container>
            {/* タイトル重複警告 */}
            {duplicatePage && (
              <Alert
                variant="destructive"
                className="border-0 bg-transparent py-3"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span className="text-sm">{errorMessage}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenDuplicatePage}
                    className="shrink-0"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    開く
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {/* 既存ページで空タイトル警告 */}
            {!isNewPage && isTitleEmpty && title === "" && !duplicatePage && (
              <Alert
                variant="destructive"
                className="border-0 bg-transparent py-3"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  タイトルを入力してください
                </AlertDescription>
              </Alert>
            )}
          </Container>
        </div>
      )}

      {/* Editor */}
      <main className="flex-1 py-6">
        <Container>
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Source URL Badge - クリップしたページの場合に表示 */}
            {sourceUrl && <SourceUrlBadge sourceUrl={sourceUrl} />}

            <TiptapEditor
              content={content}
              onChange={handleContentChange}
              autoFocus={isNewPage}
              className="min-h-[calc(100vh-200px)]"
              pageId={currentPageId || pageId || undefined}
            />
          </div>
        </Container>
      </main>

      {/* Web Clipper Dialog */}
      <WebClipperDialog
        open={webClipperOpen}
        onOpenChange={setWebClipperOpen}
        onClipped={handleWebClipped}
      />

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ページを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteReason}
              は保存できません。このページにはコンテンツが含まれています。削除してもよろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PageEditor;
