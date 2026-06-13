import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  saveStorageSettings,
  loadStorageSettings,
  clearStorageSettings,
  isStorageConfigured,
  getDefaultStorageSettings,
} from "./storageSettings";
import { encrypt, decrypt } from "./encryption";
import { isStorageConfiguredForUpload } from "@/lib/storage";
import { DEFAULT_STORAGE_SETTINGS, type StorageSettings } from "@/types/storage";

const STORAGE_KEY = "zedi-storage-settings";

vi.mock("./encryption", () => ({
  encrypt: vi.fn((text: string) => Promise.resolve(`encrypted:${text}`)),
  decrypt: vi.fn((text: string) => Promise.resolve(text.replace("encrypted:", ""))),
}));

vi.mock("@/i18n", () => ({
  default: { t: (key: string) => key },
}));

vi.mock("@/lib/storage", () => ({
  isStorageConfiguredForUpload: vi.fn(() => true),
}));

const mockedEncrypt = vi.mocked(encrypt);
const mockedDecrypt = vi.mocked(decrypt);
const mockedIsConfigured = vi.mocked(isStorageConfiguredForUpload);

function externalSettings(overrides: Partial<StorageSettings> = {}): StorageSettings {
  return {
    preferDefaultStorage: false,
    provider: "github",
    config: { githubToken: "ghp_secret", githubRepository: "owner/repo" },
    isConfigured: true,
    ...overrides,
  };
}

describe("storageSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockedEncrypt.mockImplementation((text: string) => Promise.resolve(`encrypted:${text}`));
    mockedDecrypt.mockImplementation((text: string) =>
      Promise.resolve(text.replace("encrypted:", "")),
    );
    mockedIsConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("saveStorageSettings", () => {
    it("機微フィールドを暗号化して保存し、非機微フィールドはそのまま保存する", async () => {
      await saveStorageSettings(externalSettings());

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      expect(stored.config.githubToken).toBe("encrypted:ghp_secret");
      expect(stored.config.githubRepository).toBe("owner/repo");
      expect(mockedEncrypt).toHaveBeenCalledWith("ghp_secret");
    });

    it("空の機微フィールドは暗号化しない", async () => {
      await saveStorageSettings(externalSettings({ config: { githubToken: "" } }));

      expect(mockedEncrypt).not.toHaveBeenCalled();
    });

    it("保存に失敗した場合は i18n エラーメッセージで throw する", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mockedEncrypt.mockRejectedValueOnce(new Error("boom"));

      await expect(saveStorageSettings(externalSettings())).rejects.toThrow(
        "errors.storageSettingsSaveFailed",
      );
    });
  });

  describe("loadStorageSettings", () => {
    it("保存値がない場合は null を返す", async () => {
      expect(await loadStorageSettings()).toBeNull();
    });

    it("save/load のラウンドトリップで機微フィールドが復号される", async () => {
      await saveStorageSettings(externalSettings());

      const loaded = await loadStorageSettings();

      expect(loaded?.config.githubToken).toBe("ghp_secret");
      expect(mockedDecrypt).toHaveBeenCalledWith("encrypted:ghp_secret");
    });

    it("復号に失敗したフィールドは config から取り除かれる", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(externalSettings({ config: { githubToken: "broken" } })),
      );
      mockedDecrypt.mockRejectedValueOnce(new Error("cannot decrypt"));

      const loaded = await loadStorageSettings();

      expect(loaded?.config.githubToken).toBeUndefined();
    });

    it("preferDefaultStorage が未指定なら true として扱う", async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ provider: "s3", config: {}, isConfigured: true }),
      );

      const loaded = await loadStorageSettings();

      expect(loaded?.preferDefaultStorage).toBe(true);
    });

    it("外部ストレージ優先かつ provider が s3 の場合は gyazo に補正する", async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          preferDefaultStorage: false,
          provider: "s3",
          config: {},
          isConfigured: false,
        }),
      );

      const loaded = await loadStorageSettings();

      expect(loaded?.provider).toBe("gyazo");
    });

    it("isConfigured は isStorageConfiguredForUpload の結果で決まる", async () => {
      mockedIsConfigured.mockReturnValue(false);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          preferDefaultStorage: false,
          provider: "github",
          config: {},
          isConfigured: true,
        }),
      );

      const loaded = await loadStorageSettings();

      expect(loaded?.isConfigured).toBe(false);
    });

    it("JSON が壊れている場合は設定をクリアして null を返す", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, "{ broken json");

      const loaded = await loadStorageSettings();

      expect(loaded).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("clearStorageSettings", () => {
    it("保存済みの設定を削除する", async () => {
      await saveStorageSettings(externalSettings());
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

      clearStorageSettings();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("isStorageConfigured", () => {
    it("設定が存在し isStorageConfiguredForUpload が true なら true", async () => {
      mockedIsConfigured.mockReturnValue(true);
      await saveStorageSettings(externalSettings());

      expect(await isStorageConfigured()).toBe(true);
    });

    it("設定が存在しない場合は false", async () => {
      expect(await isStorageConfigured()).toBe(false);
    });
  });

  describe("getDefaultStorageSettings", () => {
    it("デフォルト設定を空 config で返す", () => {
      expect(getDefaultStorageSettings()).toEqual({ ...DEFAULT_STORAGE_SETTINGS, config: {} });
    });
  });
});
