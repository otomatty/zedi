import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveGeneralSettings, loadGeneralSettings, clearGeneralSettings } from "./generalSettings";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/types/generalSettings";

const STORAGE_KEY = "zedi-general-settings";

describe("generalSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("saveGeneralSettings", () => {
    it("設定を JSON 文字列として localStorage に保存する", () => {
      const settings: GeneralSettings = {
        theme: "dark",
        editorFontSize: "large",
        locale: "en",
        executableCodeConfirmBeforeRun: false,
      };

      saveGeneralSettings(settings);

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual(settings);
    });

    it("setItem が失敗した場合は専用メッセージで throw する", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });

      expect(() => saveGeneralSettings(DEFAULT_GENERAL_SETTINGS)).toThrow(
        "一般設定の保存に失敗しました",
      );
    });
  });

  describe("loadGeneralSettings", () => {
    it("保存値がない場合はデフォルト設定を返す（コピーであり同一参照ではない）", () => {
      const loaded = loadGeneralSettings();

      expect(loaded).toEqual(DEFAULT_GENERAL_SETTINGS);
      expect(loaded).not.toBe(DEFAULT_GENERAL_SETTINGS);
    });

    it("save/load のラウンドトリップで値が保持される", () => {
      const settings: GeneralSettings = {
        theme: "light",
        editorFontSize: "small",
        locale: "en",
        executableCodeConfirmBeforeRun: false,
      };

      saveGeneralSettings(settings);

      expect(loadGeneralSettings()).toEqual(settings);
    });

    it("旧フォントサイズ 'normal' を 'small' にマイグレーションする", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ editorFontSize: "normal" }));

      expect(loadGeneralSettings().editorFontSize).toBe("small");
    });

    it("旧フォントサイズ 'x-large' を 'large' にマイグレーションする", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ editorFontSize: "x-large" }));

      expect(loadGeneralSettings().editorFontSize).toBe("large");
    });

    it("有効なフォントサイズはそのまま保持する", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ editorFontSize: "custom" }));

      expect(loadGeneralSettings().editorFontSize).toBe("custom");
    });

    it("不正なフォントサイズは 'medium' にフォールバックする", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ editorFontSize: "gigantic" }));

      expect(loadGeneralSettings().editorFontSize).toBe("medium");
    });

    it("customFontSizePx が上限 24 を超える場合は 24 にクランプする", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ customFontSizePx: 30 }));

      expect(loadGeneralSettings().customFontSizePx).toBe(24);
    });

    it("customFontSizePx が下限 12 を下回る場合は 12 にクランプする", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ customFontSizePx: 5 }));

      expect(loadGeneralSettings().customFontSizePx).toBe(12);
    });

    it("customFontSizePx が範囲内ならそのまま保持する", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ customFontSizePx: 18 }));

      expect(loadGeneralSettings().customFontSizePx).toBe(18);
    });

    it("customFontSizePx が数値でない場合は undefined になる", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ customFontSizePx: "20" }));

      expect(loadGeneralSettings().customFontSizePx).toBeUndefined();
    });

    it("customFontSizePx が有限数でない場合は undefined になる", () => {
      // JSON.stringify(Infinity) は "null" になるため、文字列として直接埋め込む
      localStorage.setItem(STORAGE_KEY, '{"customFontSizePx": null}');

      expect(loadGeneralSettings().customFontSizePx).toBeUndefined();
    });

    it("executableCodeConfirmBeforeRun が boolean の場合は保持する", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ executableCodeConfirmBeforeRun: false }));

      expect(loadGeneralSettings().executableCodeConfirmBeforeRun).toBe(false);
    });

    it("executableCodeConfirmBeforeRun が boolean でない場合はデフォルト値になる", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ executableCodeConfirmBeforeRun: "yes" }));

      expect(loadGeneralSettings().executableCodeConfirmBeforeRun).toBe(
        DEFAULT_GENERAL_SETTINGS.executableCodeConfirmBeforeRun,
      );
    });

    it("既知のフィールド（theme / locale）は parsed 値で上書きされる", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: "dark", locale: "en" }));

      const loaded = loadGeneralSettings();

      expect(loaded.theme).toBe("dark");
      expect(loaded.locale).toBe("en");
    });

    it("JSON が壊れている場合はデフォルト設定を返す", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, "{ not valid json");

      expect(loadGeneralSettings()).toEqual(DEFAULT_GENERAL_SETTINGS);
    });
  });

  describe("clearGeneralSettings", () => {
    it("保存済みの設定を削除する", () => {
      saveGeneralSettings(DEFAULT_GENERAL_SETTINGS);
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

      clearGeneralSettings();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
