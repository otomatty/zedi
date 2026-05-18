import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// 翻訳をドメインごとに分割（1ファイルあたりのコード量を抑える）
// Translations are split per domain to keep individual files small.
import jaCommon from "./locales/ja/common.json";
import jaNav from "./locales/ja/nav.json";
import jaAuth from "./locales/ja/auth.json";
import jaUsers from "./locales/ja/users.json";
import jaAudit from "./locales/ja/audit.json";
import jaWikiHealth from "./locales/ja/wikiHealth.json";
import jaActivityLog from "./locales/ja/activityLog.json";
import jaAiModels from "./locales/ja/aiModels.json";
import jaErrors from "./locales/ja/errors.json";
import enCommon from "./locales/en/common.json";
import enNav from "./locales/en/nav.json";
import enAuth from "./locales/en/auth.json";
import enUsers from "./locales/en/users.json";
import enAudit from "./locales/en/audit.json";
import enWikiHealth from "./locales/en/wikiHealth.json";
import enActivityLog from "./locales/en/activityLog.json";
import enAiModels from "./locales/en/aiModels.json";
import enErrors from "./locales/en/errors.json";

const ja = {
  common: jaCommon,
  nav: jaNav,
  auth: jaAuth,
  users: jaUsers,
  audit: jaAudit,
  wikiHealth: jaWikiHealth,
  activityLog: jaActivityLog,
  aiModels: jaAiModels,
  errors: jaErrors,
};

const en = {
  common: enCommon,
  nav: enNav,
  auth: enAuth,
  users: enUsers,
  audit: enAudit,
  wikiHealth: enWikiHealth,
  activityLog: enActivityLog,
  aiModels: enAiModels,
  errors: enErrors,
};

/**
 * 管理画面用 i18n インスタンス。
 * 本体アプリと同じ localStorage キー（`zedi-i18next-lng`）を共有して、
 * 言語設定が両画面間で一貫するようにする。
 *
 * Admin i18n instance. Shares the same localStorage key as the main app
 * (`zedi-i18next-lng`) so language preference stays consistent across surfaces.
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    fallbackLng: "ja",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "zedi-i18next-lng",
    },
  });

export default i18n;
