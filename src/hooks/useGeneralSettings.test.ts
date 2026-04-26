/**
 * Tests for {@link useGeneralSettings}.
 * {@link useGeneralSettings} のテスト。
 *
 * Issue #743: cover load/save lifecycle, theme/locale sync, font-size clamping,
 * and error handling on persistence failures.
 * Issue #743: 読み込み/保存ライフサイクル、テーマ/言語同期、フォントサイズの clamp、
 * 永続化失敗時のエラーハンドリングを検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockSetTheme = vi.fn();
const mockChangeLanguage = vi.fn();
const mockLoadGeneralSettings = vi.fn();
const mockSaveGeneralSettings = vi.fn();

// `useTheme()` / `useTranslation()` の戻り値はレンダーごとに同一参照に固定する。
// 内部 effect の依存配列が `[setTheme, i18n]` のため、毎回新しい参照を返すと
// effect が再実行され、テスト中の状態更新が `loadGeneralSettings` の戻り値で
// 上書きされてしまう。
// Stabilize hook return values across renders. The component-side effect
// depends on `[setTheme, i18n]`, so unstable references cause it to re-run
// after every state update and clobber the test's local mutations.
const stableI18n = { changeLanguage: mockChangeLanguage };
const stableTheme = { setTheme: mockSetTheme };

vi.mock("next-themes", () => ({
  useTheme: () => stableTheme,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: stableI18n,
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/generalSettings", () => ({
  loadGeneralSettings: () => mockLoadGeneralSettings(),
  saveGeneralSettings: (settings: unknown) => mockSaveGeneralSettings(settings),
}));

import { DEFAULT_GENERAL_SETTINGS } from "@/types/generalSettings";
import { useGeneralSettings } from "./useGeneralSettings";

describe("useGeneralSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadGeneralSettings.mockReturnValue({ ...DEFAULT_GENERAL_SETTINGS });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads stored settings and syncs theme + locale on mount", async () => {
    mockLoadGeneralSettings.mockReturnValue({
      ...DEFAULT_GENERAL_SETTINGS,
      theme: "dark",
      locale: "en",
    });

    const { result } = renderHook(() => useGeneralSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings.theme).toBe("dark");
    expect(result.current.settings.locale).toBe("en");
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
  });

  it("updateTheme persists, updates state, and syncs next-themes", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockSaveGeneralSettings.mockClear();
    mockSetTheme.mockClear();

    act(() => {
      result.current.updateTheme("light");
    });

    expect(result.current.settings.theme).toBe("light");
    expect(mockSetTheme).toHaveBeenCalledWith("light");
    expect(mockSaveGeneralSettings).toHaveBeenCalledTimes(1);
    expect(mockSaveGeneralSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light" }),
    );
  });

  it("updateEditorFontSize persists the new preset", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockSaveGeneralSettings.mockClear();

    act(() => {
      result.current.updateEditorFontSize("large");
    });

    expect(result.current.settings.editorFontSize).toBe("large");
    expect(mockSaveGeneralSettings).toHaveBeenCalledWith(
      expect.objectContaining({ editorFontSize: "large" }),
    );
  });

  it("updateCustomFontSizePx clamps below 12", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateCustomFontSizePx(2);
    });

    expect(result.current.settings.customFontSizePx).toBe(12);
  });

  it("updateCustomFontSizePx clamps above 24", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateCustomFontSizePx(99);
    });

    expect(result.current.settings.customFontSizePx).toBe(24);
  });

  it("updateCustomFontSizePx keeps values within range as-is", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateCustomFontSizePx(20);
    });

    expect(result.current.settings.customFontSizePx).toBe(20);
  });

  it("updateLocale persists and triggers i18n.changeLanguage", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockChangeLanguage.mockClear();
    mockSaveGeneralSettings.mockClear();

    act(() => {
      result.current.updateLocale("en");
    });

    expect(result.current.settings.locale).toBe("en");
    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
    expect(mockSaveGeneralSettings).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
  });

  it("updateExecutableCodeConfirmBeforeRun toggles persisted flag", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockSaveGeneralSettings.mockClear();

    act(() => {
      result.current.updateExecutableCodeConfirmBeforeRun(false);
    });

    expect(result.current.settings.executableCodeConfirmBeforeRun).toBe(false);
    expect(mockSaveGeneralSettings).toHaveBeenCalledWith(
      expect.objectContaining({ executableCodeConfirmBeforeRun: false }),
    );
  });

  it("save returns true and toggles isSaving flag", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let saved = false;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(true);
    expect(result.current.isSaving).toBe(false);
  });

  it("save returns false and logs when saveGeneralSettings throws", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockSaveGeneralSettings.mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);
  });

  it("editorFontSizePx resolves preset px from FONT_SIZE_OPTIONS", async () => {
    mockLoadGeneralSettings.mockReturnValue({
      ...DEFAULT_GENERAL_SETTINGS,
      editorFontSize: "large",
    });

    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.editorFontSizePx).toBe(18);
  });

  it("editorFontSizePx resolves customFontSizePx when editorFontSize is custom", async () => {
    mockLoadGeneralSettings.mockReturnValue({
      ...DEFAULT_GENERAL_SETTINGS,
      editorFontSize: "custom",
      customFontSizePx: 22,
    });

    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.editorFontSizePx).toBe(22);
  });

  it("editorFontSizePx falls back to 16 when custom px is missing", async () => {
    mockLoadGeneralSettings.mockReturnValue({
      ...DEFAULT_GENERAL_SETTINGS,
      editorFontSize: "custom",
      customFontSizePx: undefined,
    });

    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.editorFontSizePx).toBe(16);
  });
});
