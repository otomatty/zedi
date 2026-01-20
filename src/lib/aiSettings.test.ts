import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
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
const mockedDecrypt = vi.mocked(decrypt);

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
        isConfigured: true,
      };

      await saveAISettings(settings);
      const loaded = await loadAISettings();

      expect(loaded).toEqual({
        ...settings,
        apiKey: "test-api-key", // 復号化された値
      });
      expect(encrypt).toHaveBeenCalledWith("test-api-key");
      expect(decrypt).toHaveBeenCalledWith("encrypted:test-api-key");
    });

    it("apiKeyが空の場合は暗号化されない", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "api_server",
        model: "gpt-4o",
        isConfigured: false,
      };

      await saveAISettings(settings);
      const loaded = await loadAISettings();

      expect(loaded?.apiKey).toBe("");
      expect(encrypt).not.toHaveBeenCalled();
    });
  });

  describe("loadAISettings - 後方互換性（マイグレーション）", () => {
    it("apiModeがない既存設定を読み込むと自動でuser_api_keyになる（apiKeyあり）", async () => {
      // 既存の設定形式（apiModeなし）をシミュレート
      const oldSettings = {
        provider: "openai",
        apiKey: "encrypted:test-key",
        model: "gpt-4o",
        isConfigured: true,
      };

      localStorage.setItem("zedi-ai-settings", JSON.stringify(oldSettings));

      const loaded = await loadAISettings();

      expect(loaded).not.toBeNull();
      expect(loaded?.apiMode).toBe("user_api_key");
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
        isConfigured: true,
      };

      await saveAISettings(settings);
      const result = await isAIConfigured();

      expect(result).toBe(true);
    });

    it("設定が無効な場合はfalseを返す", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "api_server",
        model: "gpt-4o",
        isConfigured: false,
      };

      await saveAISettings(settings);
      const result = await isAIConfigured();

      expect(result).toBe(false);
    });

    it("設定が存在しない場合はfalseを返す", async () => {
      const result = await isAIConfigured();
      expect(result).toBe(false);
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
        isConfigured: true,
      };

      await expect(saveAISettings(settings)).rejects.toThrow(
        "AI設定の保存に失敗しました"
      );
    });
  });
});
