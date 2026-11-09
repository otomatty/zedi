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

// Keep references stable so ordinary rerenders do not repeat external synchronization.
// 通常の再描画で外部への同期を繰り返さないよう参照を固定する。
let stableI18n = { changeLanguage: mockChangeLanguage };
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
import { useGeneralSettings } from "@/hooks/settings/useGeneralSettings";

describe("useGeneralSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stableI18n = { changeLanguage: mockChangeLanguage };
    stableTheme.setTheme = mockSetTheme;
    mockLoadGeneralSettings.mockReturnValue({ ...DEFAULT_GENERAL_SETTINGS });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the initial saved settings without loading and syncs persisted theme and locale on mount", () => {
    const initial = { ...DEFAULT_GENERAL_SETTINGS, theme: "light" as const };
    const mounted = { ...DEFAULT_GENERAL_SETTINGS, theme: "dark" as const, locale: "en" as const };
    mockLoadGeneralSettings.mockReturnValueOnce(initial).mockReturnValue(mounted);
    const renders: { settings: typeof DEFAULT_GENERAL_SETTINGS; isLoading: boolean }[] = [];

    const { result } = renderHook(() => {
      const value = useGeneralSettings();
      renders.push({ settings: value.settings, isLoading: value.isLoading });
      return value;
    });

    expect(renders[0]).toEqual({ settings: initial, isLoading: false });
    expect(result.current.settings).toEqual(initial);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(mockSetTheme).toHaveBeenCalledExactlyOnceWith("dark");
    expect(mockChangeLanguage).toHaveBeenCalledExactlyOnceWith("en");
    expect(mockSaveGeneralSettings).not.toHaveBeenCalled();
  });

  it("keeps edited settings on ordinary rerenders without reloading or resyncing", () => {
    const { result, rerender } = renderHook(() => useGeneralSettings());
    act(() => result.current.updateTheme("dark"));
    mockLoadGeneralSettings.mockReturnValue({ ...DEFAULT_GENERAL_SETTINGS, theme: "light" });
    mockLoadGeneralSettings.mockClear();
    mockSetTheme.mockClear();
    mockChangeLanguage.mockClear();

    rerender();

    expect(result.current.settings.theme).toBe("dark");
    expect(result.current.isLoading).toBe(false);
    expect(mockLoadGeneralSettings).not.toHaveBeenCalled();
    expect(mockSetTheme).not.toHaveBeenCalled();
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it("syncs when the theme setter changes while preserving edited settings", () => {
    const { result, rerender } = renderHook(() => useGeneralSettings());
    act(() => result.current.updateEditorFontSize("large"));
    const edited = result.current.settings;
    const replacementSetTheme = vi.fn();
    stableTheme.setTheme = replacementSetTheme;
    const saved = { ...DEFAULT_GENERAL_SETTINGS, theme: "dark" as const, locale: "en" as const };
    mockLoadGeneralSettings.mockReturnValue(saved);
    mockChangeLanguage.mockClear();

    rerender();

    expect(result.current.settings).toEqual(edited);
    expect(result.current.isLoading).toBe(false);
    expect(replacementSetTheme).toHaveBeenCalledExactlyOnceWith("dark");
    expect(mockChangeLanguage).toHaveBeenCalledExactlyOnceWith("en");
  });

  it("syncs when the language provider changes while preserving edited settings", () => {
    const { result, rerender } = renderHook(() => useGeneralSettings());
    act(() => result.current.updateEditorFontSize("large"));
    const edited = result.current.settings;
    const replacementChangeLanguage = vi.fn();
    stableI18n = { changeLanguage: replacementChangeLanguage };
    const saved = { ...DEFAULT_GENERAL_SETTINGS, theme: "light" as const, locale: "en" as const };
    mockLoadGeneralSettings.mockReturnValue(saved);
    mockSetTheme.mockClear();

    rerender();

    expect(result.current.settings).toEqual(edited);
    expect(result.current.isLoading).toBe(false);
    expect(mockSetTheme).toHaveBeenCalledExactlyOnceWith("light");
    expect(replacementChangeLanguage).toHaveBeenCalledExactlyOnceWith("en");
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

  it("save returns true, persists via saveGeneralSettings, and toggles isSaving flag", async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // 初回ロードで saveGeneralSettings は呼ばれていないが、念のためクリアしてから assert する。
    // Clear any prior calls so the assertion below pinpoints save()'s side effect.
    mockSaveGeneralSettings.mockClear();

    let saved = false;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(true);
    expect(mockSaveGeneralSettings).toHaveBeenCalledTimes(1);
    expect(mockSaveGeneralSettings).toHaveBeenCalledWith(result.current.settings);
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
