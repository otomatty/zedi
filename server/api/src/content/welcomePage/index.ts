/**
 * ウェルカムページ「Zedi (ツェディ) の使い方」のコンテンツ定義。
 * Welcome page ("How to use Zedi") content definitions.
 *
 * ユーザーのセットアップウィザード完了時に、選択されたロケールに対応する
 * Tiptap JSON を選び、Y.Doc 化して pages / page_contents に挿入する。
 * 作成時のロケールで固定し、後から言語切替しても再生成しない（ユーザーが
 * 編集している可能性があるため）。
 *
 * Selected at wizard completion time based on the user's chosen locale, the
 * Tiptap JSON here is converted to a Y.Doc and persisted via pages /
 * page_contents. Content is frozen at creation time; later locale changes do
 * not regenerate (the user may have edited the page).
 */
import type { TiptapNode } from "../../lib/articleExtractor.js";
import { welcomePageJa } from "./ja.js";
import { welcomePageEn } from "./en.js";

/**
 * 対応ロケール。新規追加時は `welcomePageContent` を拡張する。
 * Supported locales; extend `welcomePageContent` when adding more.
 */
export type WelcomePageLocale = "ja" | "en";

/**
 * ウェルカムページのタイトル（ロケール別、pages.title に使用）。
 * Welcome page title per locale (used for pages.title).
 */
export const WELCOME_PAGE_TITLE: Record<WelcomePageLocale, string> = {
  ja: "Zedi (ツェディ) の使い方",
  en: "How to use Zedi",
};

/**
 * ロケール別の Tiptap ドキュメント。
 * Tiptap doc per locale.
 */
export const welcomePageContent: Record<WelcomePageLocale, TiptapNode> = {
  ja: welcomePageJa,
  en: welcomePageEn,
};

/**
 * 与えられたロケール文字列から有効な WelcomePageLocale を導出する。
 * 未対応ロケールは `ja` にフォールバックする（デフォルト言語）。
 *
 * Resolves a valid WelcomePageLocale from an arbitrary locale string.
 * Unsupported locales fall back to `ja` (the default language).
 */
export function resolveWelcomePageLocale(input: string | null | undefined): WelcomePageLocale {
  const base = (input ?? "").toLowerCase().split(/[-_]/)[0];
  return base === "en" ? "en" : "ja";
}
