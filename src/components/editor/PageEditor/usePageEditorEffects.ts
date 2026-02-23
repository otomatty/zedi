import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { UseMutationResult } from "@tanstack/react-query";
import type { Page } from "@/types/page";
import { useAIChatContext } from "@/contexts/AIChatContext";

type UpdatePageMutation = UseMutationResult<
  { skipped: boolean },
  Error,
  { pageId: string; updates: Partial<Page> & { content?: string; thumbnailUrl?: string | null } },
  unknown
>;

interface UsePageEditorEffectsOptions {
  isNewPage: boolean;
  currentPageId: string | null;
  isInitialized: boolean;
  isError: boolean;
  page: Page | null | undefined;
  title: string;
  content: string;
  isWikiGenerating: boolean;
  wikiStatus: string;
  throttledTiptapContent: string | null;
  navigate: ReturnType<typeof useNavigate>;
  location: ReturnType<typeof useLocation>;
  initialize: (page: Page) => void;
  setContent: (content: string) => void;
  setSourceUrl: (url: string | undefined) => void;
  setPendingInitialContent: (content: string | null) => void;
  getTiptapContent: () => string | null;
  saveChanges: (title: string, content: string) => void;
  resetWiki: () => void;
  updatePageMutation: UpdatePageMutation;
  toast: (opts: { title: string; variant?: "destructive" }) => void;
}

export function usePageEditorEffects(options: UsePageEditorEffectsOptions) {
  const {
    isNewPage,
    currentPageId,
    isInitialized,
    isError,
    page,
    title,
    content,
    isWikiGenerating,
    wikiStatus,
    throttledTiptapContent,
    navigate,
    location,
    initialize,
    setContent,
    setSourceUrl,
    setPendingInitialContent,
    getTiptapContent,
    saveChanges,
    resetWiki,
    updatePageMutation,
    toast,
  } = options;

  const { setPageContext } = useAIChatContext();

  // /page/new への直接アクセスはホームへリダイレクト
  useEffect(() => {
    if (isNewPage) {
      navigate("/home", { replace: true });
    }
  }, [isNewPage, navigate]);

  // Load existing page
  useEffect(() => {
    if (!isNewPage && page && !isInitialized) {
      initialize(page);
    }
  }, [isNewPage, page, isInitialized, initialize]);

  // URL から作成時: state で渡された initialContent をエディタに渡す
  useEffect(() => {
    const state = location.state as {
      sourceUrl?: string;
      thumbnailUrl?: string | null;
      initialContent?: string;
    } | null;

    if (!state || !currentPageId || !isInitialized) return;

    if (typeof state.initialContent === "string") {
      setPendingInitialContent(state.initialContent);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    const { sourceUrl: stateSourceUrl, thumbnailUrl: stateThumbnailUrl } = state;
    if (stateSourceUrl || stateThumbnailUrl) {
      setSourceUrl(stateSourceUrl || "");
      updatePageMutation.mutate({
        pageId: currentPageId,
        updates: {
          sourceUrl: stateSourceUrl || undefined,
          thumbnailUrl: stateThumbnailUrl || undefined,
        },
      });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [
    location.state,
    currentPageId,
    isInitialized,
    setSourceUrl,
    updatePageMutation,
    navigate,
    location.pathname,
    setPendingInitialContent,
  ]);

  // Handle page not found
  useEffect(() => {
    if (!isNewPage && isError) {
      navigate("/");
      toast({ title: "ページが見つかりません", variant: "destructive" });
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
        toast({ title: "Wiki記事を生成しました" });
      }
      resetWiki();
    }
  }, [wikiStatus, getTiptapContent, title, saveChanges, resetWiki, toast, setContent]);

  // AI Chat context: ページコンテキストを設定
  useEffect(() => {
    if (title || currentPageId) {
      setPageContext({
        type: "editor",
        pageId: currentPageId || undefined,
        pageTitle: title,
        pageContent: content ? content.substring(0, 3000) : undefined,
      });
    }
    return () => setPageContext(null);
  }, [title, currentPageId, setPageContext]);
}
