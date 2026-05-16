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

/**
 * Dependencies and state passed into `usePageEditorEffects` (navigation, page data, mutations, editor callbacks).
 * `usePageEditorEffects` に渡す依存関係と状態（ナビゲーション、ページデータ、ミューテーション、エディタコールバック）。
 */
export interface UsePageEditorEffectsOptions {
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
  setWikiContentForCollab: (content: string | null) => void;
  setSourceUrl: (url: string | undefined) => void;
  setPendingInitialContent: (content: string | null) => void;
  getTiptapContent: () => string | null;
  saveChanges: (title: string, content: string) => void;
  /**
   * Wiki 完了 effect 用。setWikiContentForCollab を null にしないため resetWiki ではなくこちらを呼ぶ。
   * For the wiki completion effect. Call this instead of resetWiki to avoid nullifying setWikiContentForCollab.
   */
  resetWikiBase: () => void;
  updatePageMutation: UpdatePageMutation;
  toast: (opts: { title: string; variant?: "destructive" }) => void;
}

/**
 * ページエディタの副作用（ナビゲーション・初期化・Wiki生成反映・AIチャットコンテキスト設定）。
 * Page editor side effects: navigation, initialization, wiki content sync, and AI chat context setup.
 */
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
    setWikiContentForCollab,
    setSourceUrl,
    setPendingInitialContent,
    getTiptapContent,
    saveChanges,
    resetWikiBase,
    updatePageMutation,
    toast,
  } = options;

  const { setPageContext, contentAppendHandlerRef } = useAIChatContext();

  // /pages/new への直接アクセスはデフォルトノート (/notes/me) へリダイレクト。
  // /home は #884 で廃止予定のため /notes/me に統一する。
  // Direct visits to /pages/new redirect to the caller's default note
  // (/notes/me). /home is being retired in #884 so we route to /notes/me.
  useEffect(() => {
    if (isNewPage) {
      navigate("/notes/me", { replace: true });
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

  // Wiki生成中のコンテンツをエディターに反映（React state + コラボ時は Y.Doc 用に別途渡す）
  useEffect(() => {
    if (isWikiGenerating && throttledTiptapContent) {
      setContent(throttledTiptapContent);
      setWikiContentForCollab(throttledTiptapContent);
    }
  }, [isWikiGenerating, throttledTiptapContent, setContent, setWikiContentForCollab]);

  // Wiki生成完了時に保存（React state + コラボ時は Y.Doc 用に別途渡す）
  // resetWiki ではなく resetWikiBase を呼ぶ: resetWiki は setWikiContentForCollab(null) も行うため、
  // 同 effect 内で setWikiContentForCollab(tiptapContent) と同バッチになりコラボに内容が渡らない。
  // Use resetWikiBase instead of resetWiki: resetWiki also calls setWikiContentForCollab(null),
  // which would batch with setWikiContentForCollab(tiptapContent) in the same effect, preventing content from reaching collab.
  useEffect(() => {
    if (wikiStatus === "completed") {
      const tiptapContent = getTiptapContent();
      if (tiptapContent) {
        setContent(tiptapContent);
        setWikiContentForCollab(tiptapContent);
        saveChanges(title, tiptapContent);
        toast({ title: "Wiki記事を生成しました" });
      }
      resetWikiBase();
    }
  }, [
    wikiStatus,
    getTiptapContent,
    title,
    saveChanges,
    resetWikiBase,
    toast,
    setContent,
    setWikiContentForCollab,
  ]);

  // AI Chat context: ページコンテキストを設定
  useEffect(() => {
    if (title || currentPageId) {
      setPageContext({
        type: "editor",
        pageId: currentPageId || undefined,
        pageTitle: title,
        pageContent: content ? content.substring(0, 3000) : undefined,
        pageFullContent: content || undefined,
      });
    }
    return () => setPageContext(null);
  }, [title, currentPageId, content, setPageContext]);

  // AI追記時にエディタ内容を同期するハンドラを登録
  useEffect(() => {
    if (currentPageId) {
      contentAppendHandlerRef.current = setContent;
      return () => {
        contentAppendHandlerRef.current = null;
      };
    }
    return undefined;
  }, [currentPageId, setContent, contentAppendHandlerRef]);
}
