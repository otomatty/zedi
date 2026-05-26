/**
 * Map the app UI language to Wiki Compose graph `contentLocale`.
 * アプリ UI 言語を Wiki Compose グラフの `contentLocale` に対応づける。
 */
import i18n from "@/i18n";

export type ComposeContentLocale = "ja" | "en";

/** Returns `ja` or `en` from the active i18next language. */
export function resolveComposeContentLocale(): ComposeContentLocale {
  const primary = i18n.language?.split("-")[0]?.toLowerCase();
  return primary === "en" ? "en" : "ja";
}
