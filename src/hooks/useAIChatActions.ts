import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { useNavigate } from "react-router-dom";
import { useAIChatContext } from "@/contexts/AIChatContext";
import type {
  ChatAction,
  CreatePageAction,
  CreateMultiplePagesAction,
  AppendToPageAction,
  SuggestWikiLinksAction,
} from "@/types/aiChat";
import type { PageContext } from "@/types/aiChat";
import { useCreatePage, useUpdatePage, useSyncWikiLinks } from "@/hooks/usePageQueries";
import { useNotePages } from "@/hooks/useNoteQueries";
import {
  appendMarkdownToTiptapContent,
  buildSuggestedWikiLinksMarkdown,
  getMissingSuggestedWikiLinkTitles,
  normalizePageTitle,
} from "@/lib/aiChatActionHelpers";
import { extractWikiLinksFromContent } from "@/lib/wikiLinkUtils";

/**
 *
 */
export interface UseAIChatActionsOptions {
  pageContext: PageContext | null;
}

/**
 *
 */
export function useAIChatActions({ pageContext }: UseAIChatActionsOptions) {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const { toast } = useToast();
  /**
   *
   */
  const navigate = useNavigate();
  /**
   *
   */
  const { contentAppendHandlerRef } = useAIChatContext();
  /**
   *
   */
  const createPageMutation = useCreatePage();
  /**
   *
   */
  const updatePageMutation = useUpdatePage();
  // 編集対象ページ自身の所属ノート（`pageContext.noteId`）に応じて WikiLink
  // 同期のスコープを切り替える（Issue #713 Phase 4）。ノート内のページ一覧は
  // `useNotePages` から取得し、`syncLinks` が同一ノート内のタイトルを正しく
  // 解決できるようにする。linked personal page は `noteId` を持たないので、
  // 個人スコープのまま処理する。`noteId` が空のときは fetch しない。
  //
  // Switch WikiLink sync scope based on the current page's owning note
  // (`pageContext.noteId`, issue #713 Phase 4). Linked personal pages keep
  // this unset even when rendered inside a note, so they continue to use the
  // personal scope. The note's page list is fetched via `useNotePages` and
  // fed into `useSyncWikiLinks` so same-note references resolve to real links
  // instead of ghost entries.
  const scopeNoteId = pageContext?.noteId ?? null;
  const notePagesQuery = useNotePages(scopeNoteId ?? "", undefined, Boolean(scopeNoteId));
  const { syncLinks } = useSyncWikiLinks({
    pageNoteId: scopeNoteId,
    notePages: scopeNoteId ? notePagesQuery.data : undefined,
  });

  /**
   *
   */
  const latestPageContentRef = useRef(pageContext?.pageFullContent ?? "");

  useEffect(() => {
    latestPageContentRef.current = pageContext?.pageFullContent ?? "";
  }, [pageContext?.pageFullContent]);

  /**
   *
   */
  const appendContentToCurrentPage = useCallback(
    async (markdown: string): Promise<boolean> => {
      /**
       *
       */
      const currentPageId = pageContext?.pageId;
      if (!currentPageId) return false;

      /**
       *
       */
      const previousContent = latestPageContentRef.current;
      /**
       *
       */
      const nextContent = appendMarkdownToTiptapContent(latestPageContentRef.current, markdown);
      await updatePageMutation.mutateAsync({
        pageId: currentPageId,
        updates: { content: nextContent },
      });
      latestPageContentRef.current = nextContent;
      contentAppendHandlerRef.current?.(nextContent);
      try {
        await syncLinks(currentPageId, extractWikiLinksFromContent(nextContent));
      } catch (err) {
        console.error("Failed to sync wiki links after updating page content:", err);
        try {
          await updatePageMutation.mutateAsync({
            pageId: currentPageId,
            updates: { content: previousContent },
          });
          latestPageContentRef.current = previousContent;
          contentAppendHandlerRef.current?.(previousContent);
        } catch (rollbackErr) {
          console.error(
            "Failed to roll back page content after wiki link sync failure:",
            rollbackErr,
          );
          latestPageContentRef.current = nextContent;
          contentAppendHandlerRef.current?.(nextContent);
        }
        throw err;
      }
      return true;
    },
    [pageContext?.pageId, syncLinks, updatePageMutation, contentAppendHandlerRef],
  );

  /**
   *
   */
  const handleExecuteAction = useCallback(
    async (action: ChatAction) => {
      try {
        if (action.type === "create-page") {
          /**
           *
           */
          const pageAction = action as CreatePageAction;
          /**
           *
           */
          const result = await createPageMutation.mutateAsync({
            title: pageAction.title,
            content: pageAction.content,
          });
          if (result?.id) {
            navigate(`/pages/${result.id}`);
          }
        } else if (action.type === "create-multiple-pages") {
          /**
           *
           */
          const multiAction = action as CreateMultiplePagesAction;
          for (/**
           *
           */
          const page of multiAction.pages) {
            await createPageMutation.mutateAsync({
              title: page.title,
              content: page.content,
            });
          }
        } else if (action.type === "append-to-page") {
          /**
           *
           */
          const appendAction = action as AppendToPageAction;
          /**
           *
           */
          const currentPageTitle = pageContext?.pageTitle ?? "";

          if (!pageContext?.pageId) {
            toast({
              title: t("aiChat.notifications.pageContextRequired"),
              variant: "destructive",
            });
            return;
          }

          if (normalizePageTitle(appendAction.pageTitle) !== normalizePageTitle(currentPageTitle)) {
            toast({
              title: t("aiChat.notifications.appendUnavailable"),
              variant: "destructive",
            });
            return;
          }

          await appendContentToCurrentPage(appendAction.content);
          toast({
            title: t("aiChat.notifications.appendSuccess", {
              title: appendAction.pageTitle,
            }),
          });
        } else if (action.type === "suggest-wiki-links") {
          /**
           *
           */
          const wikiLinkAction = action as SuggestWikiLinksAction;

          if (!pageContext?.pageId) {
            toast({
              title: t("aiChat.notifications.pageContextRequired"),
              variant: "destructive",
            });
            return;
          }

          /**
           *
           */
          const targetTitles = wikiLinkAction.links
            .map((link) => link.existingPageTitle ?? link.keyword)
            .map((title) => title.trim())
            .filter(Boolean);
          /**
           *
           */
          const missingTitles = getMissingSuggestedWikiLinkTitles(
            latestPageContentRef.current,
            targetTitles,
          );

          if (missingTitles.length === 0) {
            toast({ title: t("aiChat.notifications.noNewWikiLinks") });
            return;
          }

          await appendContentToCurrentPage(buildSuggestedWikiLinksMarkdown(missingTitles));
          toast({
            title: t("aiChat.notifications.wikiLinksAdded", {
              count: missingTitles.length,
            }),
          });
        }
      } catch (err) {
        console.error("Failed to execute action:", err);
        toast({
          title: t("aiChat.notifications.actionFailed"),
          variant: "destructive",
        });
      }
    },
    [appendContentToCurrentPage, createPageMutation, navigate, pageContext, t, toast],
  );

  return { handleExecuteAction };
}
