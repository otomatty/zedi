import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { ContentError } from "./TiptapEditor/useContentSanitizer";
import { usePageEditorState } from "./PageEditor/usePageEditorState";
import { useEditorAutoSave } from "./PageEditor/useEditorAutoSave";
import { usePageDeletion } from "./PageEditor/usePageDeletion";
import { useMarkdownExport } from "./PageEditor/useMarkdownExport";
import { usePageEditorKeyboard } from "./PageEditor/usePageEditorKeyboard";
import { PageEditorHeader } from "./PageEditor/PageEditorHeader";
import { PageEditorAlerts } from "./PageEditor/PageEditorAlerts";
import { PageEditorContent } from "./PageEditor/PageEditorContent";
import { PageEditorDialogs } from "./PageEditor/PageEditorDialogs";
import {
  usePage,
  useUpdatePage,
  useSyncWikiLinks,
} from "@/hooks/usePageQueries";
import { useTitleValidation } from "@/hooks/useTitleValidation";
import { generateAutoTitle, isContentNotEmpty } from "@/lib/contentUtils";
import { useToast } from "@/hooks/use-toast";
import { useWikiGenerator } from "@/hooks/useWikiGenerator";

const PageEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const isNewPage = id === "new";
  const pageId = isNewPage ? "" : id || "";

  // /page/new への直接アクセスはホームへリダイレクト
  // （ページ作成はuseCreateNewPageフック経由で行う）
  useEffect(() => {
    if (isNewPage) {
      navigate("/", { replace: true });
    }
  }, [isNewPage, navigate]);

  // React Query hooks
  const { data: page, isLoading, isError } = usePage(pageId);
  const updatePageMutation = useUpdatePage();
  const { syncLinks } = useSyncWikiLinks();

  const [webClipperOpen, setWebClipperOpen] = useState(false);

  // Page editor state hook
  const {
    title,
    content,
    sourceUrl,
    currentPageId,
    lastSaved,
    isInitialized,
    originalTitle,
    contentError,
    setTitle,
    setContent,
    setSourceUrl,
    setContentError,
    initialize,
    reset,
    updateLastSaved,
  } = usePageEditorState({
    pageId,
    isNewPage,
    onInitialized: (page) => {
      // 既存ページのタイトルで状態を初期化（重複チェックは行わない）
      initializeWithTitle(page.title);
    },
  });

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

  // Wiki Generator
  const {
    status: wikiStatus,
    error: wikiError,
    generate: generateWiki,
    cancel: cancelWiki,
    reset: resetWiki,
    throttledTiptapContent,
    getTiptapContent,
  } = useWikiGenerator();

  const isWikiGenerating = wikiStatus === "generating";

  // Page deletion hook
  const {
    deleteConfirmOpen,
    deleteReason,
    setDeleteConfirmOpen,
    handleDelete,
    handleBack,
    handleConfirmDelete,
    handleCancelDelete,
  } = usePageDeletion({
    currentPageId,
    title,
    content,
    shouldBlockSave,
  });

  // Markdown export hook
  const { handleExportMarkdown, handleCopyMarkdown } = useMarkdownExport(
    title,
    content
  );

  // Keyboard shortcuts hook
  usePageEditorKeyboard({ onBack: handleBack });

  // Auto-save hook
  const { saveChanges, lastSaved: autoSaveLastSaved } = useEditorAutoSave({
    pageId: currentPageId,
    debounceMs: 500,
    shouldBlockSave,
    onSave: (updates) => {
      if (currentPageId) {
        updatePageMutation.mutate({
          pageId: currentPageId,
          updates,
        });
      }
    },
    onSaveContentOnly: (content) => {
      if (currentPageId) {
        updatePageMutation.mutate({
          pageId: currentPageId,
          updates: { content },
        });
      }
    },
    syncWikiLinks: syncLinks,
    onSaveSuccess: () => {
      updateLastSaved(Date.now());
    },
  });

  // Use auto-save's lastSaved if available, otherwise use state's lastSaved
  const displayLastSaved = autoSaveLastSaved ?? lastSaved;

  // Load existing page
  useEffect(() => {
    if (!isNewPage && page && !isInitialized) {
      initialize(page);
    }
  }, [isNewPage, page, isInitialized, initialize]);

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

  // Wiki生成中のコンテンツをエディターに反映
  useEffect(() => {
    if (isWikiGenerating && throttledTiptapContent) {
      setContent(throttledTiptapContent);
    }
  }, [isWikiGenerating, throttledTiptapContent, setContent]);

  // Wiki生成完了時に保存
  useEffect(() => {
    if (wikiStatus === "completed") {
      const tiptapContent = getTiptapContent();
      if (tiptapContent) {
        setContent(tiptapContent);
        saveChanges(title, tiptapContent);
        toast({
          title: "Wiki記事を生成しました",
        });
      }
      resetWiki();
    }
  }, [
    wikiStatus,
    getTiptapContent,
    title,
    saveChanges,
    resetWiki,
    toast,
    setContent,
  ]);

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
    [title, saveChanges, validateTitle, setContent, setTitle]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      validateTitle(newTitle);
      saveChanges(newTitle, content);
    },
    [content, saveChanges, validateTitle, setTitle]
  );

  // コンテンツエラーのコールバック
  const handleContentError = useCallback(
    (error: ContentError | null) => {
      setContentError(error);
    },
    [setContentError]
  );

  // 既存ページを開くハンドラー
  const handleOpenDuplicatePage = useCallback(() => {
    if (duplicatePage) {
      navigate(`/page/${duplicatePage.id}`);
    }
  }, [duplicatePage, navigate]);

  // Wiki生成を開始
  const handleGenerateWiki = useCallback(() => {
    generateWiki(title);
  }, [generateWiki, title]);

  // Wiki生成エラーダイアログを閉じてAI設定へ遷移
  const handleGoToAISettings = useCallback(() => {
    resetWiki();
    const returnTo = `${location.pathname}${location.search}`;
    const search = new URLSearchParams({ returnTo }).toString();
    navigate(`/settings/ai?${search}`);
  }, [resetWiki, navigate, location.pathname, location.search]);

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
              updateLastSaved(Date.now());
              toast({
                title: "Webページを取り込みました",
              });
            },
          }
        );
      }
    },
    [
      currentPageId,
      updatePageMutation,
      toast,
      setTitle,
      setContent,
      setSourceUrl,
      updateLastSaved,
    ]
  );

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
      <PageEditorHeader
        title={title}
        onTitleChange={handleTitleChange}
        lastSaved={displayLastSaved}
        hasContent={isContentNotEmpty(content)}
        wikiStatus={wikiStatus}
        errorMessage={errorMessage}
        isTitleEmpty={isTitleEmpty}
        isNewPage={isNewPage}
        onBack={handleBack}
        onDelete={handleDelete}
        onExportMarkdown={handleExportMarkdown}
        onCopyMarkdown={handleCopyMarkdown}
        onWebClipper={() => setWebClipperOpen(true)}
        onGenerateWiki={handleGenerateWiki}
      />

      <PageEditorAlerts
        duplicatePage={duplicatePage}
        errorMessage={errorMessage}
        isTitleEmpty={isTitleEmpty}
        title={title}
        isNewPage={isNewPage}
        onOpenDuplicatePage={handleOpenDuplicatePage}
        isWikiGenerating={isWikiGenerating}
        onCancelWiki={cancelWiki}
        contentError={contentError}
      />

      <PageEditorContent
        content={content}
        sourceUrl={sourceUrl}
        currentPageId={currentPageId}
        pageId={pageId}
        isNewPage={isNewPage}
        isWikiGenerating={isWikiGenerating}
        onContentChange={handleContentChange}
        onContentError={handleContentError}
      />

      <PageEditorDialogs
        deleteConfirmOpen={deleteConfirmOpen}
        deleteReason={deleteReason}
        onDeleteConfirmOpenChange={setDeleteConfirmOpen}
        onConfirmDelete={handleConfirmDelete}
        onCancelDelete={handleCancelDelete}
        wikiStatus={wikiStatus}
        wikiErrorMessage={wikiError?.message || null}
        onResetWiki={resetWiki}
        onGoToAISettings={handleGoToAISettings}
        webClipperOpen={webClipperOpen}
        onWebClipperOpenChange={setWebClipperOpen}
        onWebClipped={handleWebClipped}
      />
    </div>
  );
};

export default PageEditor;
