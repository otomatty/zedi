import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { loadGeneralSettings } from "@/lib/generalSettings";

// 翻訳をドメインごとに分割（1ファイルあたりのコード量を抑える）
import jaCommon from "./locales/ja/common.json";
import jaSettings from "./locales/ja/settings.json";
import jaGeneralSettings from "./locales/ja/generalSettings.json";
import jaNav from "./locales/ja/nav.json";
import jaAiSettings from "./locales/ja/aiSettings.json";
import jaStorageSettings from "./locales/ja/storageSettings.json";
import jaAuth from "./locales/ja/auth.json";
import jaNotes from "./locales/ja/notes.json";
import jaEditor from "./locales/ja/editor.json";
import jaErrors from "./locales/ja/errors.json";
import jaLanding from "./locales/ja/landing.json";
import jaDonate from "./locales/ja/donate.json";
import jaPricing from "./locales/ja/pricing.json";
import jaOnboarding from "./locales/ja/onboarding.json";
import jaTour from "./locales/ja/tour.json";
import jaHome from "./locales/ja/home.json";
import jaAiChat from "./locales/ja/aiChat.json";
import jaInvite from "./locales/ja/invite.json";
import enCommon from "./locales/en/common.json";
import enSettings from "./locales/en/settings.json";
import enGeneralSettings from "./locales/en/generalSettings.json";
import enNav from "./locales/en/nav.json";
import enAiSettings from "./locales/en/aiSettings.json";
import enStorageSettings from "./locales/en/storageSettings.json";
import enAuth from "./locales/en/auth.json";
import enNotes from "./locales/en/notes.json";
import enEditor from "./locales/en/editor.json";
import enErrors from "./locales/en/errors.json";
import enLanding from "./locales/en/landing.json";
import enDonate from "./locales/en/donate.json";
import enPricing from "./locales/en/pricing.json";
import enOnboarding from "./locales/en/onboarding.json";
import enTour from "./locales/en/tour.json";
import enHome from "./locales/en/home.json";
import enAiChat from "./locales/en/aiChat.json";
import enInvite from "./locales/en/invite.json";

const ja = {
  common: jaCommon,
  settings: jaSettings,
  generalSettings: jaGeneralSettings,
  nav: jaNav,
  aiSettings: jaAiSettings,
  storageSettings: jaStorageSettings,
  auth: jaAuth,
  notes: jaNotes,
  editor: jaEditor,
  errors: jaErrors,
  landing: jaLanding,
  donate: jaDonate,
  pricing: jaPricing,
  onboarding: jaOnboarding,
  tour: jaTour,
  home: jaHome,
  aiChat: jaAiChat,
  invite: jaInvite,
};

const en = {
  common: enCommon,
  settings: enSettings,
  generalSettings: enGeneralSettings,
  nav: enNav,
  aiSettings: enAiSettings,
  storageSettings: enStorageSettings,
  auth: enAuth,
  notes: enNotes,
  editor: enEditor,
  errors: enErrors,
  landing: enLanding,
  donate: enDonate,
  pricing: enPricing,
  onboarding: enOnboarding,
  tour: enTour,
  home: enHome,
  aiChat: enAiChat,
  invite: enInvite,
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
