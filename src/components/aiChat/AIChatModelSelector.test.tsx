/** モデル読み込みと選択 / Model loading and selection. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AIChatModelSelector } from "./AIChatModelSelector";

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  fetchModels: vi.fn(),
  setSelectedModel: vi.fn(),
  selectedModel: null as {
    id: string;
    provider: string;
    model: string;
    displayName: string;
  } | null,
  isStreaming: false,
}));
vi.mock("@/stores/aiChatStore", () => ({
  useAIChatStore: Object.assign(
    (selector?: (state: typeof mocks) => unknown) => (selector ? selector(mocks) : mocks),
    { getState: () => mocks },
  ),
}));
vi.mock("@/lib/aiSettings", () => ({ loadAISettings: mocks.loadSettings }));
vi.mock("@/lib/aiService", () => ({ fetchServerModels: mocks.fetchModels }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const models = [
  {
    id: "openai:gpt-5-mini",
    provider: "openai",
    modelId: "gpt-5-mini",
    displayName: "GPT 5 mini",
    available: true,
    inputCostUnits: 1,
    outputCostUnits: 2,
  },
  {
    id: "anthropic:claude",
    provider: "anthropic",
    modelId: "claude",
    displayName: "Claude",
    available: true,
    inputCostUnits: 3,
    outputCostUnits: 4,
  },
  {
    id: "openai:disabled",
    provider: "openai",
    modelId: "disabled",
    displayName: "Unavailable",
    available: false,
  },
];
const settings = {
  provider: "openai",
  apiKey: "sk-test",
  apiMode: "api_server",
  model: "gpt-5-mini",
  modelId: "openai:gpt-5-mini",
  isConfigured: true,
};

describe("AIChatModelSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectedModel = null;
    mocks.isStreaming = false;
    mocks.loadSettings.mockResolvedValue(settings);
    mocks.fetchModels.mockResolvedValue({ models, systemDefaultModelId: "openai:gpt-5-mini" });
  });

  it("disables selection until models arrive and selects the configured default once", async () => {
    let resolve!: (value: { models: typeof models; systemDefaultModelId: string }) => void;
    mocks.fetchModels.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<AIChatModelSelector />);
    expect(screen.getByTitle("aiChat.modelSelector.tooltip")).toBeDisabled();
    await waitFor(() => expect(mocks.fetchModels).toHaveBeenCalledTimes(1));

    await act(async () => resolve({ models, systemDefaultModelId: "openai:gpt-5-mini" }));

    expect(screen.getByTitle("aiChat.modelSelector.tooltip")).toBeEnabled();
    expect(mocks.loadSettings).toHaveBeenCalledTimes(1);
    expect(mocks.setSelectedModel).toHaveBeenCalledExactlyOnceWith({
      id: "openai:gpt-5-mini",
      provider: "openai",
      model: "gpt-5-mini",
      displayName: "GPT 5 mini",
      inputCostUnits: 1,
      outputCostUnits: 2,
    });
  });

  it("offers available server models and passes the selected model once", async () => {
    render(<AIChatModelSelector />);
    await waitFor(() => expect(screen.getByTitle("aiChat.modelSelector.tooltip")).toBeEnabled());
    mocks.setSelectedModel.mockClear();

    fireEvent.click(screen.getByTitle("aiChat.modelSelector.tooltip"));

    expect(screen.getByRole("button", { name: /GPT 5 mini/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unavailable/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Claude/ }));

    expect(mocks.setSelectedModel).toHaveBeenCalledExactlyOnceWith({
      id: "anthropic:claude",
      provider: "anthropic",
      model: "claude",
      displayName: "Claude",
      inputCostUnits: 3,
      outputCostUnits: 4,
    });
    expect(screen.queryByRole("button", { name: /Claude/ })).not.toBeInTheDocument();
  });

  it("limits own-key choices to the configured provider", async () => {
    mocks.loadSettings.mockResolvedValueOnce({ ...settings, apiMode: "user_api_key" });
    render(<AIChatModelSelector />);
    await waitFor(() => expect(screen.getByTitle("aiChat.modelSelector.tooltip")).toBeEnabled());

    fireEvent.click(screen.getByTitle("aiChat.modelSelector.tooltip"));

    expect(screen.getByRole("button", { name: /GPT 5 mini/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claude/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unavailable/ })).not.toBeInTheDocument();
  });

  it("clears the selection if no available models are returned", async () => {
    mocks.fetchModels.mockResolvedValueOnce({ models: [], systemDefaultModelId: null });
    render(<AIChatModelSelector />);

    await waitFor(() => expect(mocks.setSelectedModel).toHaveBeenCalledExactlyOnceWith(null));
    expect(screen.getByTitle("aiChat.modelSelector.tooltip")).toBeEnabled();
  });

  it("ends loading without changing the current selection when loading fails", async () => {
    mocks.selectedModel = {
      id: "openai:current",
      provider: "openai",
      model: "current",
      displayName: "Current model",
    };
    mocks.fetchModels.mockRejectedValueOnce(new Error("network failed"));
    render(<AIChatModelSelector />);

    await waitFor(() => expect(screen.getByTitle("aiChat.modelSelector.tooltip")).toBeEnabled());
    expect(screen.getByText("Current model")).toBeInTheDocument();
    expect(mocks.setSelectedModel).not.toHaveBeenCalled();
  });

  it("keeps the selector disabled during streaming after loading completes", async () => {
    mocks.isStreaming = true;
    render(<AIChatModelSelector />);

    await waitFor(() => expect(mocks.setSelectedModel).toHaveBeenCalledTimes(1));
    expect(screen.getByTitle("aiChat.modelSelector.tooltip")).toBeDisabled();
  });
});
