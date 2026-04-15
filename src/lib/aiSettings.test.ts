import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AI_SETTINGS_CHANGED_EVENT,
  saveAISettings,
  loadAISettings,
  clearAISettings,
  getDefaultAISettings,
  isAIConfigured,
} from "./aiSettings";
import type { AISettings } from "@/types/ai";
import { encrypt, decrypt } from "./encryption";

// encryptionモジュールのモック
vi.mock("./encryption", () => ({
  encrypt: vi.fn((text: string) => Promise.resolve(`encrypted:${text}`)),
  decrypt: vi.fn((text: string) => Promise.resolve(text.replace("encrypted:", ""))),
}));

// encryptとdecryptをvi.mockedで使えるようにする
const mockedEncrypt = vi.mocked(encrypt);

describe("aiSettings - 回帰テスト", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("saveAISettings / loadAISettings - 基本動作", () => {
    it("設定を保存して読み込める", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-api-key",
        apiMode: "user_api_key",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: true,
      };

      await saveAISettings(settings);
      const loaded = await loadAISettings();

      expect(loaded).toEqual({
        ...settings,
        apiKey: "test-api-key", // 復号化された値
        modelId: "openai:gpt-4o", // loadAISettingsで付与される
      });
      expect(encrypt).toHaveBeenCalledWith("test-api-key");
      expect(decrypt).toHaveBeenCalledWith("encrypted:test-api-key");
    });

    it("保存後に AI_SETTINGS_CHANGED_EVENT を dispatch する", async () => {
      const dispatchSpy = vi.spyOn(window, "dispatchEvent");
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "api_server",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: false,
      };
      await saveAISettings(settings);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: AI_SETTINGS_CHANGED_EVENT }),
      );
      dispatchSpy.mockRestore();
    });

    it("apiKeyが空の場合は暗号化されない", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "api_server",
        model: "gpt-4o",
        isConfigured: false,
        modelId: "openai:gpt-4o",
      };

      await saveAISettings(settings);
      const loaded = await loadAISettings();

      expect(loaded?.apiKey).toBe("");
      expect(encrypt).not.toHaveBeenCalled();
    });
  });

  describe("loadAISettings - 後方互換性（マイグレーション）", () => {
    it("apiModeがない既存設定を読み込むとapiKeyの有無に関わらずapi_serverになる（apiKeyあり）", async () => {
      // 既存の設定形式（apiModeなし）をシミュレート
      // Simulate legacy settings shape without apiMode.
      // apiKeyが残っていてもデフォルトはアプリのサーバー経由とする。
      // Even with a leftover apiKey, default to the app's server.
      const oldSettings = {
        provider: "openai",
        apiKey: "encrypted:test-key",
        model: "gpt-4o",
        isConfigured: true,
      };

      localStorage.setItem("zedi-ai-settings", JSON.stringify(oldSettings));

      const loaded = await loadAISettings();

      expect(loaded).not.toBeNull();
      expect(loaded?.apiMode).toBe("api_server");
      expect(loaded?.apiKey).toBe("test-key");
    });

    it("apiModeがない既存設定を読み込むと自動でapi_serverになる（apiKeyなし）", async () => {
      // 既存の設定形式（apiModeなし、apiKeyなし）をシミュレート
      const oldSettings = {
        provider: "openai",
        apiKey: "",
        model: "gpt-4o",
        isConfigured: false,
      };

      localStorage.setItem("zedi-ai-settings", JSON.stringify(oldSettings));

      const loaded = await loadAISettings();

      expect(loaded).not.toBeNull();
      expect(loaded?.apiMode).toBe("api_server");
      expect(loaded?.apiKey).toBe("");
    });

    it("apiModeがない既存設定を読み込むと自動でapi_serverになる（apiKeyが空白のみ）", async () => {
      const oldSettings = {
        provider: "openai",
        apiKey: "encrypted:   ",
        model: "gpt-4o",
        isConfigured: false,
      };

      localStorage.setItem("zedi-ai-settings", JSON.stringify(oldSettings));

      const loaded = await loadAISettings();

      expect(loaded).not.toBeNull();
      // 復号化後は空白のみなので、trim()で空文字列になりapi_serverになる
      expect(loaded?.apiMode).toBe("api_server");
      expect(loaded?.apiKey).toBe("   "); // 復号化された値（空白のみ）
    });

    it("apiModeが既に設定されている場合はそのまま使用", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-key",
        apiMode: "api_server", // 既に設定されている
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: true,
      };

      await saveAISettings(settings);
      const loaded = await loadAISettings();

      expect(loaded?.apiMode).toBe("api_server");
    });
  });

  describe("clearAISettings", () => {
    it("設定をクリアできる", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-key",
        apiMode: "user_api_key",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: true,
      };

      await saveAISettings(settings);
      expect(localStorage.getItem("zedi-ai-settings")).not.toBeNull();

      clearAISettings();
      expect(localStorage.getItem("zedi-ai-settings")).toBeNull();
    });
  });

  describe("isAIConfigured", () => {
    it("設定が有効な場合はtrueを返す", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-key",
        apiMode: "user_api_key",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: true,
      };

      await saveAISettings(settings);
      const result = await isAIConfigured();

      expect(result).toBe(true);
    });

    it("設定が無効な場合はfalseを返す", async () => {
      // user_api_keyでapiKeyが空の場合は未設定扱いでfalse
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "user_api_key",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: false,
      };

      await saveAISettings(settings);
      const result = await isAIConfigured();

      expect(result).toBe(false);
    });

    it("設定が存在しない場合はデフォルトでtrueを返す（api_server利用可能）", async () => {
      const result = await isAIConfigured();
      expect(result).toBe(true);
    });

    it("回帰: api_serverモードではisConfigured=false・apiKey空でもtrueを返す", async () => {
      // Wiki/Mermaid 生成ボタンがサーバーモードでもダイアログを出していた問題の回帰テスト。
      // Regression test for the wiki/mermaid buttons blocking server-mode users.
      const settings: AISettings = {
        provider: "google",
        apiKey: "",
        apiMode: "api_server",
        model: "gemini-3-flash-preview",
        modelId: "google:gemini-3-flash-preview",
        isConfigured: false,
      };

      await saveAISettings(settings);
      const result = await isAIConfigured();

      expect(result).toBe(true);
    });

    it("回帰: 旧設定（apiMode未設定・apiKeyあり）は後方互換でapi_server扱いとなりtrueを返す", async () => {
      // 既存ユーザーがアップデート後にサーバーモードに移行するパスの回帰テスト。
      // Regression test for legacy users migrating to server mode after the update.
      const oldSettings = {
        provider: "openai",
        apiKey: "encrypted:leftover-key",
        model: "gpt-4o",
        isConfigured: true,
      };
      localStorage.setItem("zedi-ai-settings", JSON.stringify(oldSettings));

      const result = await isAIConfigured();

      expect(result).toBe(true);
    });
  });

  describe("getDefaultAISettings", () => {
    it("デフォルト設定を取得できる", () => {
      const defaultSettings = getDefaultAISettings();

      expect(defaultSettings).toHaveProperty("provider");
      expect(defaultSettings).toHaveProperty("apiKey");
      expect(defaultSettings).toHaveProperty("apiMode");
      expect(defaultSettings).toHaveProperty("model");
      expect(defaultSettings).toHaveProperty("isConfigured");
      expect(defaultSettings.apiMode).toBe("api_server");
    });
  });

  describe("エラーハンドリング", () => {
    it("復号化に失敗した場合は設定をクリアしてnullを返す", async () => {
      // 無効な暗号化データをシミュレート
      const invalidSettings = {
        provider: "openai",
        apiKey: "invalid-encrypted-data",
        model: "gpt-4o",
        isConfigured: true,
      };

      localStorage.setItem("zedi-ai-settings", JSON.stringify(invalidSettings));

      // decryptがエラーを投げるようにモック
      vi.mocked(decrypt).mockRejectedValueOnce(new Error("Decryption failed"));

      const loaded = await loadAISettings();

      expect(loaded).toBeNull();
      expect(localStorage.getItem("zedi-ai-settings")).toBeNull(); // クリアされている
    });

    it("保存に失敗した場合はエラーを投げる", async () => {
      // encryptがエラーを投げるようにモック
      mockedEncrypt.mockRejectedValueOnce(new Error("Encryption failed"));

      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-key",
        apiMode: "user_api_key",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: true,
      };

      await expect(saveAISettings(settings)).rejects.toThrow("AI設定の保存に失敗しました");
    });
  });
});
