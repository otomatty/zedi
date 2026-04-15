import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AISettings } from "@/types/ai";
import { useAISettingsForm } from "./useAISettingsForm";

const mockUpdateSettingsBase = vi.fn();
const mockSave = vi.fn(async () => true);
const mockTest = vi.fn();
const mockReset = vi.fn();
const mockToast = vi.fn();
const mockClearSavedIndicator = vi.fn();
const mockMarkSaved = vi.fn();
const mockLoadServerModels = vi.fn();

let mockSettings: AISettings = {
  provider: "openai",
  apiKey: "legacy-secret-key",
  apiMode: "api_server",
  model: "gpt-5.2",
  modelId: "openai:gpt-5.2",
  isConfigured: true,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@zedi/ui", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/useAISettings", () => ({
  useAISettings: () => ({
    settings: mockSettings,
    availableModels: [],
    isLoading: false,
    isSaving: false,
    isTesting: false,
    testResult: null,
    updateSettings: mockUpdateSettingsBase,
    save: mockSave,
    test: mockTest,
    reset: mockReset,
  }),
}));

vi.mock("@/hooks/useDebouncedCallback", () => ({
  useDebouncedCallback: () => vi.fn(),
}));

vi.mock("./useAISettingsFormHelpers", () => ({
  useSavedIndicator: () => ({
    savedAt: null,
    clear: mockClearSavedIndicator,
    markSaved: mockMarkSaved,
  }),
  useClaudeCodeAvailability: () => true,
  useServerModels: () => ({
    models: [],
    loading: false,
    error: null,
    load: mockLoadServerModels,
  }),
}));

describe("useAISettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {
      provider: "openai",
      apiKey: "legacy-secret-key",
      apiMode: "api_server",
      model: "gpt-5.2",
      modelId: "openai:gpt-5.2",
      isConfigured: true,
    };
  });

  it("回帰: legacy 設定の残存 apiKey を user_api_key モードへ戻すときに保持する", () => {
    const { result } = renderHook(() => useAISettingsForm());

    act(() => {
      result.current.handleModeChange("user_api_key");
    });

    expect(mockUpdateSettingsBase).toHaveBeenCalledWith({
      provider: "openai",
      model: "gpt-5.2",
      modelId: "openai:gpt-5.2",
      apiMode: "user_api_key",
      apiKey: "legacy-secret-key",
    });
  });
});
