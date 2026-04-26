/**
 * Tests for {@link useAISettings}.
 * {@link useAISettings} のテスト。
 *
 * Issue #743: cover async load fallback paths, provider/model switching rules,
 * connection-test side effects (model list refresh + selected model fallback),
 * save flow, and reset.
 * Issue #743: 非同期ロードのフォールバック分岐、プロバイダー/モデル切り替え規則、
 * 接続テストの副作用（モデル一覧更新と選択モデルのフォールバック）、save、reset を検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { AISettings, AIProviderType } from "@/types/ai";
import type { ConnectionTestResult } from "@/lib/aiClient";

const mockLoadAISettings = vi.fn();
const mockSaveAISettings = vi.fn();
const mockClearAISettings = vi.fn();
const mockGetDefaultAISettings = vi.fn();

const mockTestConnection = vi.fn();
const mockGetAvailableModels = vi.fn();
const mockClearModelsCache = vi.fn();

vi.mock("@/lib/aiSettings", () => ({
  loadAISettings: () => mockLoadAISettings(),
  saveAISettings: (s: AISettings) => mockSaveAISettings(s),
  clearAISettings: () => mockClearAISettings(),
  getDefaultAISettings: () => mockGetDefaultAISettings(),
}));

vi.mock("@/lib/aiClient", () => ({
  testConnection: (provider: AIProviderType, apiKey: string) =>
    mockTestConnection(provider, apiKey),
  getAvailableModels: (provider: AIProviderType) => mockGetAvailableModels(provider),
  clearModelsCache: () => mockClearModelsCache(),
}));

import { useAISettings } from "./useAISettings";

const baseDefaults: AISettings = {
  provider: "google",
  apiKey: "",
  apiMode: "api_server",
  model: "gemini-3-flash-preview",
  modelId: "google:gemini-3-flash-preview",
  isConfigured: false,
};

describe("useAISettings - initial load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDefaultAISettings.mockReturnValue({ ...baseDefaults });
    mockGetAvailableModels.mockReturnValue(["gemini-3-flash-preview", "gemini-3-pro-preview"]);
  });

  it("loads stored settings and uses cached models for the loaded provider", async () => {
    const stored: AISettings = {
      ...baseDefaults,
      provider: "openai",
      model: "gpt-5.2",
      modelId: "openai:gpt-5.2",
      apiKey: "sk-test",
      apiMode: "user_api_key",
      isConfigured: true,
    };
    mockLoadAISettings.mockResolvedValue(stored);
    mockGetAvailableModels.mockReturnValue(["gpt-5.2", "gpt-5-mini"]);

    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(stored);
    expect(result.current.availableModels).toEqual(["gpt-5.2", "gpt-5-mini"]);
    expect(mockGetAvailableModels).toHaveBeenCalledWith("openai");
  });

  it("falls back to defaults when no stored settings exist", async () => {
    mockLoadAISettings.mockResolvedValue(null);

    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(baseDefaults);
    expect(result.current.availableModels.length).toBeGreaterThan(0);
  });

  it("falls back to defaults and logs error when loadAISettings rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLoadAISettings.mockRejectedValue(new Error("decryption failed"));

    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(baseDefaults);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("useAISettings - updateSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDefaultAISettings.mockReturnValue({ ...baseDefaults });
    mockGetAvailableModels.mockImplementation((provider: AIProviderType) => {
      if (provider === "openai") return ["gpt-5.2", "gpt-5-mini"];
      if (provider === "anthropic") return ["claude-opus-4-6"];
      return ["gemini-3-flash-preview", "gemini-3-pro-preview"];
    });
    mockLoadAISettings.mockResolvedValue({ ...baseDefaults });
  });

  it("changing provider swaps the model list and picks the first model", async () => {
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ provider: "openai" });
    });

    expect(result.current.settings.provider).toBe("openai");
    expect(result.current.availableModels).toEqual(["gpt-5.2", "gpt-5-mini"]);
    expect(result.current.settings.model).toBe("gpt-5.2");
    // modelId は明示指定がないのでクリアされる
    expect(result.current.settings.modelId).toBe("");
  });

  it("respects an explicit model when provider changes", async () => {
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ provider: "openai", model: "gpt-5-mini" });
    });

    expect(result.current.settings.provider).toBe("openai");
    expect(result.current.settings.model).toBe("gpt-5-mini");
  });

  it("changing only the model also clears modelId unless explicit", async () => {
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Pre-populate the modelId via save flow
    act(() => {
      result.current.updateSettings({ model: "gemini-3-pro-preview" });
    });

    expect(result.current.settings.model).toBe("gemini-3-pro-preview");
    expect(result.current.settings.modelId).toBe("");
  });

  it("updateSettings preserves modelId when caller passes it explicitly", async () => {
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({
        model: "gemini-3-pro-preview",
        modelId: "google:gemini-3-pro-preview",
      });
    });

    expect(result.current.settings.modelId).toBe("google:gemini-3-pro-preview");
  });

  it("updateSettings resets the previous testResult", async () => {
    mockTestConnection.mockResolvedValue({
      success: true,
      message: "ok",
      models: ["gpt-5.2"],
    } satisfies ConnectionTestResult);

    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ provider: "openai", apiKey: "sk-test" });
    });

    await act(async () => {
      await result.current.test();
    });
    expect(result.current.testResult?.success).toBe(true);

    act(() => {
      result.current.updateSettings({ apiKey: "sk-new" });
    });
    expect(result.current.testResult).toBeNull();
  });
});

describe("useAISettings - save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDefaultAISettings.mockReturnValue({ ...baseDefaults });
    mockGetAvailableModels.mockReturnValue(["gemini-3-flash-preview"]);
    mockLoadAISettings.mockResolvedValue({ ...baseDefaults });
    mockSaveAISettings.mockResolvedValue(undefined);
  });

  it("save returns true and sends a namespaced modelId", async () => {
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({
        provider: "openai",
        model: "gpt-5.2",
        apiKey: "sk-test",
        apiMode: "user_api_key",
      });
    });

    let saved = false;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(true);
    expect(mockSaveAISettings).toHaveBeenCalledTimes(1);
    const arg = mockSaveAISettings.mock.calls[0][0] as AISettings;
    expect(arg.modelId).toBe("openai:gpt-5.2");
    expect(arg.isConfigured).toBe(true);
  });

  it("save uses the special claude-code:default modelId when provider is claude-code", async () => {
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ provider: "claude-code" });
    });
    await act(async () => {
      await result.current.save();
    });

    const arg = mockSaveAISettings.mock.calls[0][0] as AISettings;
    expect(arg.modelId).toBe("claude-code:default");
    expect(arg.isConfigured).toBe(true);
  });

  it("save marks isConfigured=false when API key is required but missing", async () => {
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({
        provider: "anthropic",
        apiKey: "",
        apiMode: "user_api_key",
      });
    });
    await act(async () => {
      await result.current.save();
    });

    const arg = mockSaveAISettings.mock.calls[0][0] as AISettings;
    expect(arg.isConfigured).toBe(false);
  });

  it("save returns false when saveAISettings rejects", async () => {
    mockSaveAISettings.mockRejectedValueOnce(new Error("storage"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("useAISettings - test (connection)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDefaultAISettings.mockReturnValue({ ...baseDefaults });
    mockGetAvailableModels.mockReturnValue(["gemini-3-flash-preview"]);
    mockLoadAISettings.mockResolvedValue({
      ...baseDefaults,
      provider: "openai",
      model: "gpt-5.2",
      apiKey: "sk-test",
      apiMode: "user_api_key",
    });
  });

  it("test returns the result and refreshes availableModels on success", async () => {
    mockTestConnection.mockResolvedValue({
      success: true,
      message: "ok",
      models: ["gpt-5.2", "gpt-5-mini", "gpt-5-nano"],
    } satisfies ConnectionTestResult);

    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returned: ConnectionTestResult | undefined;
    await act(async () => {
      returned = await result.current.test();
    });

    expect(returned?.success).toBe(true);
    expect(result.current.availableModels).toEqual(["gpt-5.2", "gpt-5-mini", "gpt-5-nano"]);
    expect(result.current.testResult?.success).toBe(true);
    expect(result.current.isTesting).toBe(false);
    expect(mockTestConnection).toHaveBeenCalledWith("openai", "sk-test");
  });

  it("falls back to first model when current model is missing from refreshed list", async () => {
    mockTestConnection.mockResolvedValue({
      success: true,
      message: "ok",
      models: ["gpt-5-mini", "gpt-5-nano"],
    } satisfies ConnectionTestResult);

    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.test();
    });

    expect(result.current.settings.model).toBe("gpt-5-mini");
    expect(result.current.settings.modelId).toBe("openai:gpt-5-mini");
  });

  it("preserves selected model when it is still in the refreshed list", async () => {
    mockTestConnection.mockResolvedValue({
      success: true,
      message: "ok",
      models: ["gpt-5.2", "gpt-5-mini"],
    } satisfies ConnectionTestResult);

    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.test();
    });

    expect(result.current.settings.model).toBe("gpt-5.2");
  });

  it("captures errors thrown synchronously by testConnection", async () => {
    mockTestConnection.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returned: ConnectionTestResult | undefined;
    await act(async () => {
      returned = await result.current.test();
    });

    expect(returned?.success).toBe(false);
    expect(returned?.error).toBe("network down");
    expect(result.current.testResult?.success).toBe(false);
    expect(result.current.isTesting).toBe(false);
  });
});

describe("useAISettings - reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDefaultAISettings.mockReturnValue({ ...baseDefaults });
    mockGetAvailableModels.mockReturnValue(["gemini-3-flash-preview"]);
    mockLoadAISettings.mockResolvedValue({
      ...baseDefaults,
      provider: "openai",
      apiKey: "sk-test",
    });
  });

  it("clears persisted settings, model cache, and resets state to defaults", async () => {
    const { result } = renderHook(() => useAISettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.reset();
    });

    expect(mockClearAISettings).toHaveBeenCalledTimes(1);
    expect(mockClearModelsCache).toHaveBeenCalledTimes(1);
    expect(result.current.settings).toEqual(baseDefaults);
    expect(result.current.testResult).toBeNull();
  });
});
