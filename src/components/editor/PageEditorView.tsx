import React, { useEffect, useCallback } from "react";
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
import { generateAutoTitle, isContentNotEmpty, extractFirstImage } from "@/lib/contentUtils";
import { useToast } from "@/hooks/use-toast";
import { useWikiGenerator } from "@/hooks/useWikiGenerator";
import { useStorageSettings } from "@/hooks/useStorageSettings";
import { getStorageProviderById } from "@/types/storage";
import { useCollaboration } from "@/hooks/useCollaboration";
import { useAuth } from "@/hooks/useAuth";

const PageEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const {
    settings: storageSettings,
    isLoading: isStorageLoading,
  } = useStorageSettings();
  const isStorageConfigured = !isStorageLoading && storageSettings.isConfigured;
  const currentStorageProvider = getStorageProviderById(storageSettings.provider);

  const isNewPage = id === "new";
  const pageId = isNewPage ? "" : id || "";
  const { isSignedIn } = useAuth();

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

  // C-Collab-2: 個人ページ(/page/:id)は常に local モードで動作させる。
  // これにより Hocuspocus WebSocket には接続せず、Y.Doc + y-indexeddb のみ。
  const isLocalDocEnabled = Boolean(currentPageId && !isNewPage && isSignedIn);
  const collaboration = useCollaboration({
    pageId: currentPageId ?? "",
    enabled: isLocalDocEnabled,
    mode: "local",
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
    onSave: async (updates) => {
      if (!currentPageId) return false;

      // コンテンツから先頭画像を抽出してサムネイルとして設定
      const thumbnailUrl = extractFirstImage(updates.content) || undefined;

      const result = await updatePageMutation.mutateAsync({
        pageId: currentPageId,
        updates: {
          ...updates,
          thumbnailUrl,
        },
      });

      return !result.skipped;
    },
    onSaveContentOnly: async (content) => {
      if (!currentPageId) return false;

      // コンテンツから先頭画像を抽出してサムネイルとして設定
      const thumbnailUrl = extractFirstImage(content) || undefined;

      const result = await updatePageMutation.mutateAsync({
        pageId: currentPageId,
        updates: {
          content,
          thumbnailUrl,
        },
      });

      return !result.skipped;
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

  // Handle navigation state (from FAB URL creation)
  useEffect(() => {
    const state = location.state as {
      sourceUrl?: string;
      thumbnailUrl?: string | null;
    } | null;

    if (state && currentPageId && isInitialized) {
      const { sourceUrl: stateSourceUrl, thumbnailUrl: stateThumbnailUrl } = state;

      if (stateSourceUrl || stateThumbnailUrl) {
        // Update page with sourceUrl and thumbnailUrl from navigation state
        setSourceUrl(stateSourceUrl || "");
        updatePageMutation.mutate({
          pageId: currentPageId,
          updates: {
            sourceUrl: stateSourceUrl || undefined,
            thumbnailUrl: stateThumbnailUrl || undefined,
          },
        });

        // Clear the state to prevent re-processing
        navigate(location.pathname, { replace: true, state: null });
      }
    }
  }, [location.state, currentPageId, isInitialized, setSourceUrl, updatePageMutation, navigate, location.pathname]);

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

  const handleGoToStorageSettings = useCallback(() => {
    const returnTo = `${location.pathname}${location.search}`;
    const search = new URLSearchParams({ returnTo }).toString();
    navigate(`/settings/storage?${search}`);
  }, [navigate, location.pathname, location.search]);

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
        currentStorageProvider={currentStorageProvider}
        isStorageConfigured={isStorageConfigured}
        isStorageLoading={isStorageLoading}
        onGoToStorageSettings={handleGoToStorageSettings}
        onBack={handleBack}
        onDelete={handleDelete}
        onExportMarkdown={handleExportMarkdown}
        onCopyMarkdown={handleCopyMarkdown}
        onGenerateWiki={handleGenerateWiki}
        collaboration={undefined}
      />

      <PageEditorAlerts
        duplicatePage={duplicatePage}
        errorMessage={errorMessage}
        title={title}
        onOpenDuplicatePage={handleOpenDuplicatePage}
        isWikiGenerating={isWikiGenerating}
        onCancelWiki={cancelWiki}
        contentError={contentError}
      />

      <PageEditorContent
        content={content}
        title={title}
        sourceUrl={sourceUrl}
        currentPageId={currentPageId}
        pageId={pageId}
        isNewPage={isNewPage}
        isWikiGenerating={isWikiGenerating}
        onContentChange={handleContentChange}
        onContentError={handleContentError}
        collaboration={
          isLocalDocEnabled ? { ...collaboration } : undefined
        }
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
      />
    </div>
  );
};

export default PageEditor;
