import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { loadGeneralSettings } from "@/lib/generalSettings";

// 翻訳をドメインごとに分割（1ファイルあたりのコード量を抑える）
import jaCommon from "./locales/ja/common.json";
import jaSettings from "./locales/ja/settings.json";
import jaGeneralSettings from "./locales/ja/generalSettings.json";
import jaNav from "./locales/ja/nav.json";
import enCommon from "./locales/en/common.json";
import enSettings from "./locales/en/settings.json";
import enGeneralSettings from "./locales/en/generalSettings.json";
import enNav from "./locales/en/nav.json";

const ja = {
  common: jaCommon,
  settings: jaSettings,
  generalSettings: jaGeneralSettings,
  nav: jaNav,
};

const en = {
  common: enCommon,
  settings: enSettings,
  generalSettings: enGeneralSettings,
  nav: enNav,
};

// localStorage の設定から初期言語を取得
const savedSettings = loadGeneralSettings();
const savedLocale = savedSettings.locale;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    lng: savedLocale,
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
