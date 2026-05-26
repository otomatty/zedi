/**
 * Map the app UI language to Wiki Compose graph `contentLocale`.
 * アプリ UI 言語を Wiki Compose グラフの `contentLocale` に対応づける。
 */
import i18n from "@/i18n";

/**
 * Supported Wiki Compose content locales (matches API `contentLocale`).
 * Wiki Compose の生成言語（API の `contentLocale` と一致）。
 */
export type ComposeContentLocale = "ja" | "en";

/**
 * Returns `ja` or `en` from the active i18next language.
 * 現在の i18next 言語から `ja` または `en` を返す。
 */
export function resolveComposeContentLocale(): ComposeContentLocale {
  const primary = i18n.language?.split("-")[0]?.toLowerCase();
  return primary === "en" ? "en" : "ja";
}
