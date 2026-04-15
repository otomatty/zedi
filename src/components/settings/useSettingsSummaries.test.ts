import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSettingsSummaries } from "./useSettingsSummaries";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { value?: string }) =>
      key === "settings.summary.general.theme" && opts?.value
        ? `Theme: ${opts.value}`
        : key === "settings.summary.general.fontSize" && opts?.value
          ? `Font: ${opts.value}`
          : key === "settings.summary.general.locale" && opts?.value
            ? `Locale: ${opts.value}`
            : key,
    i18n: { language: "ja" },
  }),
}));

const mockGeneral = {
  settings: { theme: "system", locale: "ja" },
  isLoading: false,
  editorFontSizePx: 16,
};
const mockAi = {
  settings: {
    apiMode: "api_server" as const,
    isConfigured: true,
    modelId: "openai:gpt-4o",
  },
  isLoading: false,
};
const mockStorage = {
  settings: {
    preferDefaultStorage: true,
    provider: "s3" as const,
  },
  isLoading: false,
  testResult: null as { success: boolean; message: string } | null,
};
const mockProfile = { displayName: "Test User" };

vi.mock("@/hooks/useGeneralSettings", () => ({
  useGeneralSettings: () => mockGeneral,
}));
vi.mock("@/hooks/useAISettings", () => ({
  useAISettings: () => mockAi,
}));
vi.mock("@/hooks/useStorageSettings", () => ({
  useStorageSettings: () => mockStorage,
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ displayName: mockProfile.displayName }),
}));

describe("useSettingsSummaries", () => {
  beforeEach(() => {
    mockGeneral.settings = { theme: "system", locale: "ja" };
    mockGeneral.isLoading = false;
    mockGeneral.editorFontSizePx = 16;
    mockAi.settings = { apiMode: "api_server", isConfigured: true, modelId: "openai:gpt-4o" };
    mockAi.isLoading = false;
    mockStorage.settings = { preferDefaultStorage: true, provider: "s3" };
    mockStorage.isLoading = false;
    mockStorage.testResult = null;
    mockProfile.displayName = "Test User";
  });

  it("returns general summary when not loading", () => {
    const { result } = renderHook(() => useSettingsSummaries());
    expect(result.current.general).toBeTruthy();
    expect(typeof result.current.general).toBe("string");
    expect(result.current.general).toContain("·");
  });

  it("returns empty general summary when general is loading", () => {
    mockGeneral.isLoading = true;
    const { result } = renderHook(() => useSettingsSummaries());
    expect(result.current.general).toBe("");
  });

  it("returns ai summary when not loading", () => {
    const { result } = renderHook(() => useSettingsSummaries());
    expect(result.current.ai).toBeTruthy();
    expect(typeof result.current.ai).toBe("string");
  });

  it("returns empty ai summary when ai is loading", () => {
    mockAi.isLoading = true;
    const { result } = renderHook(() => useSettingsSummaries());
    expect(result.current.ai).toBe("");
  });

  it("returns storage summary when not loading", () => {
    const { result } = renderHook(() => useSettingsSummaries());
    expect(result.current.storage).toBeTruthy();
    expect(result.current.storage).toContain("·");
  });

  it("returns empty storage summary when storage is loading", () => {
    mockStorage.isLoading = true;
    const { result } = renderHook(() => useSettingsSummaries());
    expect(result.current.storage).toBe("");
  });

  it("includes profile set text when displayName is set", () => {
    mockProfile.displayName = "Alice";
    const { result } = renderHook(() => useSettingsSummaries());
    expect(result.current.general).toContain("settings.summary.general.profileSet");
  });

  it("includes profile unset text when displayName is empty", () => {
    mockProfile.displayName = "";
    const { result } = renderHook(() => useSettingsSummaries());
    expect(result.current.general).toContain("settings.summary.general.profileUnset");
  });

  describe("ai summary - server mode configured-state regression", () => {
    it("回帰: api_serverモードではisConfigured=falseでも設定済みと表示する", () => {
      // サーバーモードは API キー不要のため、isConfigured フラグに関わらず「設定済み」扱い。
      // Server mode needs no API key, so it is always treated as configured.
      mockAi.settings = {
        apiMode: "api_server",
        isConfigured: false,
        modelId: "google:gemini-3-flash-preview",
      };
      const { result } = renderHook(() => useSettingsSummaries());
      expect(result.current.ai).toContain("settings.summary.ai.configured");
      expect(result.current.ai).not.toContain("settings.summary.ai.notSet");
    });

    it("user_api_keyモードでisConfigured=falseなら未設定と表示する", () => {
      mockAi.settings = {
        // @ts-expect-error — 簡略化したテスト用モック / simplified test mock
        apiMode: "user_api_key",
        isConfigured: false,
        modelId: "openai:gpt-4o",
      };
      const { result } = renderHook(() => useSettingsSummaries());
      expect(result.current.ai).toContain("settings.summary.ai.notSet");
    });

    it("user_api_keyモードでisConfigured=trueなら設定済みと表示する", () => {
      mockAi.settings = {
        // @ts-expect-error — 簡略化したテスト用モック / simplified test mock
        apiMode: "user_api_key",
        isConfigured: true,
        modelId: "openai:gpt-4o",
      };
      const { result } = renderHook(() => useSettingsSummaries());
      expect(result.current.ai).toContain("settings.summary.ai.configured");
    });
  });
});
