import type { NavigateFunction } from "react-router-dom";
import type { TFunction } from "i18next";
import type { Page } from "@/types/page";
import type {
  ChatAction,
  ChatMessage,
  CreatePageAction,
  CreateMultiplePagesAction,
  AppendToPageAction,
  SuggestWikiLinksAction,
} from "@/types/aiChat";
import type { PageContext } from "@/types/aiChat";
import type { PendingChatPageGenerationState } from "@/types/chatPageGeneration";
import {
  buildSuggestedWikiLinksMarkdown,
  getCreatePageOutline,
  getMissingSuggestedWikiLinkTitles,
  normalizePageTitle,
  serializeChatMessagesForPageGeneration,
} from "@/lib/aiChatActionHelpers";

type ToastFn = (opts: { title: string; variant?: "destructive" }) => void;

/**
 * Variables passed to the create-page mutation (see {@link useCreatePage}).
 * ページ作成ミューテーションに渡す変数。
 */
export type CreatePageMutationVariables = {
  title?: string;
  content?: string;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
};

/**
 * Dependencies for {@link runAIChatAction} (injected from the React hook).
 * {@link runAIChatAction} 用の依存（フックから注入）。
 */
export interface RunAIChatActionDeps {
  pageContext: PageContext | null;
  messages: ChatMessage[];
  createPageMutateAsync: (vars: CreatePageMutationVariables) => Promise<Page>;
  navigate: NavigateFunction;
  appendContentToCurrentPage: (markdown: string) => Promise<boolean>;
  getLatestPageFullContent: () => string;
  t: TFunction;
  toast: ToastFn;
}

async function handleCreatePage(
  deps: RunAIChatActionDeps,
  action: CreatePageAction,
): Promise<void> {
  const outline = getCreatePageOutline(action);
  const conversationText = serializeChatMessagesForPageGeneration(deps.messages);
  const pending: PendingChatPageGenerationState = { outline, conversationText };
  const result = await deps.createPageMutateAsync({
    title: action.title,
    content: "",
  });
  if (result?.id) {
    deps.navigate(`/page/${result.id}`, {
      state: { pendingChatPageGeneration: pending },
    });
  }
}

/**
 * Creates each page with empty body, then navigates to the **first** successfully created page
 * and runs second-stage streaming using that page’s `content` field as the outline (first non-empty wins).
 * Other created pages stay empty until edited manually.
 * 各ページを空本文で作成し、**最初**に作成できたページへ遷移。アウトラインは `pages[].content` の先頭非空を使用。
 */
async function handleCreateMultiplePages(
  deps: RunAIChatActionDeps,
  action: CreateMultiplePagesAction,
): Promise<void> {
  let firstCreatedId: string | undefined;
  let firstOutline = "";
  const conversationText = serializeChatMessagesForPageGeneration(deps.messages);
  for (const page of action.pages) {
    const created = await deps.createPageMutateAsync({
      title: page.title,
      content: "",
    });
    if (created?.id && firstCreatedId === undefined) {
      firstCreatedId = created.id;
      firstOutline = page.content?.trim() || "";
    }
  }
  if (firstCreatedId) {
    const pending: PendingChatPageGenerationState = {
      outline: firstOutline,
      conversationText,
    };
    deps.navigate(`/page/${firstCreatedId}`, {
      state: { pendingChatPageGeneration: pending },
    });
  }
}

async function handleAppendToPage(
  deps: RunAIChatActionDeps,
  action: AppendToPageAction,
): Promise<void> {
  const currentPageTitle = deps.pageContext?.pageTitle ?? "";

  if (!deps.pageContext?.pageId) {
    deps.toast({
      title: deps.t("aiChat.notifications.pageContextRequired"),
      variant: "destructive",
    });
    return;
  }

  if (normalizePageTitle(action.pageTitle) !== normalizePageTitle(currentPageTitle)) {
    deps.toast({
      title: deps.t("aiChat.notifications.appendUnavailable"),
      variant: "destructive",
    });
    return;
  }

  await deps.appendContentToCurrentPage(action.content);
  deps.toast({
    title: deps.t("aiChat.notifications.appendSuccess", {
      title: action.pageTitle,
    }),
  });
}

async function handleSuggestWikiLinks(
  deps: RunAIChatActionDeps,
  action: SuggestWikiLinksAction,
): Promise<void> {
  if (!deps.pageContext?.pageId) {
    deps.toast({
      title: deps.t("aiChat.notifications.pageContextRequired"),
      variant: "destructive",
    });
    return;
  }

  const targetTitles = action.links
    .map((link) => link.existingPageTitle ?? link.keyword)
    .map((title) => title.trim())
    .filter(Boolean);
  const missingTitles = getMissingSuggestedWikiLinkTitles(
    deps.getLatestPageFullContent(),
    targetTitles,
  );

  if (missingTitles.length === 0) {
    deps.toast({ title: deps.t("aiChat.notifications.noNewWikiLinks") });
    return;
  }

  await deps.appendContentToCurrentPage(buildSuggestedWikiLinksMarkdown(missingTitles));
  deps.toast({
    title: deps.t("aiChat.notifications.wikiLinksAdded", {
      count: missingTitles.length,
    }),
  });
}

/**
 * Executes one AI chat action (create page, append, wiki links, etc.).
 * AIチャットの単一アクションを実行する。
 */
export async function runAIChatAction(
  deps: RunAIChatActionDeps,
  action: ChatAction,
): Promise<void> {
  switch (action.type) {
    case "create-page":
      await handleCreatePage(deps, action);
      return;
    case "create-multiple-pages":
      await handleCreateMultiplePages(deps, action);
      return;
    case "append-to-page":
      await handleAppendToPage(deps, action);
      return;
    case "suggest-wiki-links":
      await handleSuggestWikiLinks(deps, action);
      return;
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
    }
  }
}
