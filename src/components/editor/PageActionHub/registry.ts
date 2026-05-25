import { Image as ImageIcon, Sparkles, Wand2 } from "lucide-react";
import { ThumbnailSearchAction } from "./actions/ThumbnailSearchAction";
import { ThumbnailGenerateAction } from "./actions/ThumbnailGenerateAction";
import { WikiComposeAction } from "./actions/WikiComposeAction";
import type { PageAction, PageActionContext } from "./types";

/**
 * アクションが共通で要求するゲート条件。サムネイル系は読み取り専用・未サインイン・
 * サムネイル既存・空タイトルのいずれでも非表示にする。
 *
 * Shared availability gate for thumbnail actions: hidden when read-only,
 * signed out, thumbnail already present, or title empty/whitespace.
 */
function isThumbnailActionAvailable(ctx: PageActionContext): boolean {
  if (ctx.isReadOnly) return false;
  if (!ctx.isSignedIn) return false;
  if (ctx.hasThumbnail) return false;
  if (ctx.pageTitle.trim().length === 0) return false;
  return true;
}

/**
 * Wiki Compose 入口。タイトルがあり、Compose URL が組み立て可能なときのみ表示。
 * Available when the page has a title and a Compose route is configured.
 */
function isWikiComposeActionAvailable(ctx: PageActionContext): boolean {
  if (ctx.isReadOnly) return false;
  if (!ctx.isSignedIn) return false;
  if (ctx.pageTitle.trim().length === 0) return false;
  if (!ctx.wikiComposeHref?.trim()) return false;
  return true;
}

/**
 * Phase 1 で利用可能なアクション一覧。配列順序が一覧グリッド上の表示順を兼ねる。
 * 後続フェーズで WebClipper / Mermaid / AI / テンプレートを末尾に追加していく。
 *
 * Phase 1 registry. Order matches the visual order of the list grid; future
 * phases append WebClipper / Mermaid / AI summarizer / templates after these.
 */
export const PAGE_ACTIONS: ReadonlyArray<PageAction> = [
  {
    id: "thumbnail.search",
    labelI18nKey: "editor.pageActionHub.actions.thumbnailSearch.label",
    descriptionI18nKey: "editor.pageActionHub.actions.thumbnailSearch.description",
    icon: ImageIcon,
    category: "thumbnail",
    insertStrategy: "head",
    isAvailable: isThumbnailActionAvailable,
    Component: ThumbnailSearchAction,
  },
  {
    id: "thumbnail.generate",
    labelI18nKey: "editor.pageActionHub.actions.thumbnailGenerate.label",
    descriptionI18nKey: "editor.pageActionHub.actions.thumbnailGenerate.description",
    icon: Wand2,
    category: "thumbnail",
    insertStrategy: "head",
    isAvailable: isThumbnailActionAvailable,
    Component: ThumbnailGenerateAction,
  },
  {
    id: "wiki.compose",
    labelI18nKey: "editor.pageActionHub.actions.wikiCompose.label",
    descriptionI18nKey: "editor.pageActionHub.actions.wikiCompose.description",
    icon: Sparkles,
    category: "ai",
    insertStrategy: "custom",
    isAvailable: isWikiComposeActionAvailable,
    Component: WikiComposeAction,
  },
];

/**
 * `ctx` に対して `isAvailable` を通過したアクションのみを返す。
 * Returns only actions whose `isAvailable` gate passes for the given `ctx`.
 */
export function getAvailablePageActions(ctx: PageActionContext): PageAction[] {
  return PAGE_ACTIONS.filter((action) => action.isAvailable(ctx));
}

/**
 * ID で記述を引く。未知 ID は undefined。
 * Look up a registered action by id, or undefined if not registered.
 */
export function getPageActionById(id: string): PageAction | undefined {
  return PAGE_ACTIONS.find((action) => action.id === id);
}
