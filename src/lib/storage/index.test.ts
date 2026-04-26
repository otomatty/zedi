import { describe, it, expect } from "vitest";
import {
  getStorageProvider,
  isProviderConfigured,
  getSettingsForUpload,
  isStorageConfiguredForUpload,
  type StorageProviderContext,
} from "./index";
import { GyazoProvider } from "./providers/GyazoProvider";
import { GitHubProvider } from "./providers/GitHubProvider";
import { GoogleDriveProvider } from "./providers/GoogleDriveProvider";
import { S3Provider } from "./providers/S3Provider";
import type { StorageSettings, StorageProviderConfig, StorageProviderType } from "@/types/storage";

const ctx: StorageProviderContext = {
  getToken: async () => "fake-token",
  baseUrl: "https://api.example.com",
};

function settings(
  provider: StorageProviderType | "cloudflare-r2",
  config: StorageProviderConfig = {},
  overrides: Partial<StorageSettings> = {},
): StorageSettings {
  return {
    provider: provider as StorageProviderType,
    config,
    isConfigured: true,
    preferDefaultStorage: false,
    ...overrides,
  };
}

describe("getStorageProvider factory", () => {
  describe("s3 (default storage)", () => {
    it("returns an S3Provider when context.getToken is supplied", () => {
      const provider = getStorageProvider(settings("s3"), ctx);
      expect(provider).toBeInstanceOf(S3Provider);
    });

    it("throws when context is missing", () => {
      expect(() => getStorageProvider(settings("s3"))).toThrow(/getToken が必要です/);
    });

    it("throws when context.getToken is missing", () => {
      expect(() =>
        getStorageProvider(settings("s3"), {
          // 型を維持するため明示的に未定義を渡す
          // explicitly pass undefined to keep the type contract
          getToken: undefined as unknown as StorageProviderContext["getToken"],
        }),
      ).toThrow(/getToken が必要です/);
    });

    it("treats legacy 'cloudflare-r2' as 's3' (mutation: legacy migration branch)", () => {
      const provider = getStorageProvider(settings("cloudflare-r2"), ctx);
      expect(provider).toBeInstanceOf(S3Provider);
    });
  });

  describe("gyazo", () => {
    it("returns a GyazoProvider when token is configured", () => {
      const provider = getStorageProvider(settings("gyazo", { gyazoAccessToken: "tok" }));
      expect(provider).toBeInstanceOf(GyazoProvider);
    });

    it("throws when gyazoAccessToken is missing", () => {
      expect(() => getStorageProvider(settings("gyazo", {}))).toThrow(
        /Gyazo Access Token が設定されていません/,
      );
    });
  });

  describe("github", () => {
    it("returns a GitHubProvider when repository + token are present", () => {
      const provider = getStorageProvider(
        settings("github", {
          githubRepository: "owner/repo",
          githubToken: "tok",
          githubBranch: "main",
          githubPath: "images",
        }),
      );
      expect(provider).toBeInstanceOf(GitHubProvider);
    });

    it("throws when repository is missing", () => {
      expect(() => getStorageProvider(settings("github", { githubToken: "tok" }))).toThrow(
        /GitHub の設定が不完全です/,
      );
    });

    it("throws when token is missing", () => {
      expect(() =>
        getStorageProvider(settings("github", { githubRepository: "owner/repo" })),
      ).toThrow(/GitHub の設定が不完全です/);
    });
  });

  describe("google-drive", () => {
    it("returns a GoogleDriveProvider when clientId + accessToken are set", () => {
      const provider = getStorageProvider(
        settings("google-drive", {
          googleDriveClientId: "id",
          googleDriveClientSecret: "secret",
          googleDriveAccessToken: "access",
          googleDriveRefreshToken: "refresh",
          googleDriveFolderId: "folder",
        }),
      );
      expect(provider).toBeInstanceOf(GoogleDriveProvider);
    });

    it("falls back to empty strings when optional clientSecret/refreshToken are missing", () => {
      const provider = getStorageProvider(
        settings("google-drive", {
          googleDriveClientId: "id",
          googleDriveAccessToken: "access",
        }),
      );
      expect(provider).toBeInstanceOf(GoogleDriveProvider);
    });

    it("throws when clientId is missing", () => {
      expect(() =>
        getStorageProvider(settings("google-drive", { googleDriveAccessToken: "access" })),
      ).toThrow(/Google Drive の設定が不完全です/);
    });

    it("throws when accessToken is missing", () => {
      expect(() =>
        getStorageProvider(settings("google-drive", { googleDriveClientId: "id" })),
      ).toThrow(/Google Drive の設定が不完全です/);
    });
  });

  it("throws on an unknown provider", () => {
    // any-cast で未知 provider をシミュレート / cast to simulate an unknown provider
    expect(() =>
      getStorageProvider(settings("totally-unknown" as unknown as StorageProviderType)),
    ).toThrow(/Unknown storage provider/);
  });
});

describe("isProviderConfigured", () => {
  it.each([
    ["gyazo", { gyazoAccessToken: "tok" }, true],
    ["gyazo", {}, false],
    ["github", { githubRepository: "o/r", githubToken: "t" }, true],
    ["github", { githubRepository: "o/r" }, false],
    ["github", { githubToken: "t" }, false],
    ["google-drive", { googleDriveClientId: "id", googleDriveAccessToken: "ac" }, true],
    ["google-drive", { googleDriveClientId: "id" }, false],
    ["google-drive", { googleDriveAccessToken: "ac" }, false],
    ["s3", {}, true],
  ] as const)("(%s, %o) → %s", (provider, config, expected) => {
    expect(isProviderConfigured(provider as StorageProviderType, config)).toBe(expected);
  });

  it("returns false for an unknown provider", () => {
    expect(isProviderConfigured("nope" as unknown as StorageProviderType, {})).toBe(false);
  });
});

describe("getSettingsForUpload", () => {
  it("returns s3 defaults when preferDefaultStorage is undefined (default branch)", () => {
    const out = getSettingsForUpload({
      provider: "gyazo",
      config: { gyazoAccessToken: "tok" },
      isConfigured: true,
    });
    expect(out).toEqual({
      provider: "s3",
      config: {},
      isConfigured: true,
    });
  });

  it("returns s3 defaults when preferDefaultStorage is true", () => {
    const out = getSettingsForUpload({
      provider: "github",
      config: { githubRepository: "o/r", githubToken: "t" },
      isConfigured: true,
      preferDefaultStorage: true,
    });
    expect(out.provider).toBe("s3");
    expect(out.config).toEqual({});
  });

  it("preserves the original settings when preferDefaultStorage is false", () => {
    const original: StorageSettings = {
      provider: "gyazo",
      config: { gyazoAccessToken: "tok" },
      isConfigured: true,
      preferDefaultStorage: false,
    };
    expect(getSettingsForUpload(original)).toBe(original);
  });
});

describe("isStorageConfiguredForUpload", () => {
  it("returns true when default storage is preferred", () => {
    expect(
      isStorageConfiguredForUpload({
        provider: "s3",
        config: {},
        isConfigured: true,
      }),
    ).toBe(true);

    expect(
      isStorageConfiguredForUpload({
        provider: "gyazo",
        config: {},
        isConfigured: true,
        preferDefaultStorage: true,
      }),
    ).toBe(true);
  });

  it("returns false for s3 when external storage is preferred (s3 cannot be 'external')", () => {
    expect(
      isStorageConfiguredForUpload({
        provider: "s3",
        config: {},
        isConfigured: true,
        preferDefaultStorage: false,
      }),
    ).toBe(false);
  });

  it("returns true for an external provider only when its config is complete", () => {
    expect(
      isStorageConfiguredForUpload({
        provider: "gyazo",
        config: { gyazoAccessToken: "tok" },
        isConfigured: true,
        preferDefaultStorage: false,
      }),
    ).toBe(true);

    expect(
      isStorageConfiguredForUpload({
        provider: "gyazo",
        config: {},
        isConfigured: true,
        preferDefaultStorage: false,
      }),
    ).toBe(false);
  });
});
