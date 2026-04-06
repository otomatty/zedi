import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AI_PROVIDERS,
  getProviderById,
  isAPIProvider,
  API_ONLY_PROVIDERS,
  type AIProviderType,
} from "@/types/ai";
import { createProvider, getVisibleProviders } from "./registry";

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: vi.fn(() => false),
}));

const platformMod = () =>
  import("@/lib/platform") as Promise<{ isTauriDesktop: ReturnType<typeof vi.fn> }>;

describe("AI Provider types (Issue #457)", () => {
  it("AIProviderType includes claude-code", () => {
    const types: AIProviderType[] = ["openai", "anthropic", "google", "claude-code"];
    expect(types).toHaveLength(4);
  });

  it("AI_PROVIDERS has 4 entries including claude-code", () => {
    expect(AI_PROVIDERS).toHaveLength(4);
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(ids).toContain("claude-code");
  });

  it("claude-code provider metadata is correct", () => {
    const cc = getProviderById("claude-code");
    expect(cc).toBeDefined();
    if (!cc) throw new Error("claude-code provider not found");
    expect(cc.requiresApiKey).toBe(false);
    expect(cc.desktopOnly).toBe(true);
    expect(cc.capabilities.textGeneration).toBe(true);
    expect(cc.capabilities.fileAccess).toBe(true);
    expect(cc.capabilities.commandExecution).toBe(true);
    expect(cc.capabilities.webSearch).toBe(true);
    expect(cc.capabilities.mcpIntegration).toBe(true);
    expect(cc.capabilities.agentLoop).toBe(true);
  });

  it("API providers have limited capabilities", () => {
    for (const provider of API_ONLY_PROVIDERS) {
      expect(provider.capabilities.textGeneration).toBe(true);
      expect(provider.capabilities.fileAccess).toBe(false);
      expect(provider.capabilities.commandExecution).toBe(false);
      expect(provider.capabilities.mcpIntegration).toBe(false);
      expect(provider.capabilities.agentLoop).toBe(false);
    }
  });

  it("isAPIProvider returns true for API providers, false for claude-code", () => {
    expect(isAPIProvider("openai")).toBe(true);
    expect(isAPIProvider("anthropic")).toBe(true);
    expect(isAPIProvider("google")).toBe(true);
    expect(isAPIProvider("claude-code")).toBe(false);
  });

  it("API_ONLY_PROVIDERS excludes claude-code", () => {
    expect(API_ONLY_PROVIDERS).toHaveLength(3);
    expect(API_ONLY_PROVIDERS.every((p) => p.id !== "claude-code")).toBe(true);
  });
});

describe("Provider registry (Issue #457)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getVisibleProviders excludes desktopOnly in web", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(false);

    const visible = getVisibleProviders();
    expect(visible.every((p) => p.id !== "claude-code")).toBe(true);
    expect(visible).toHaveLength(3);
  });

  it("getVisibleProviders includes desktopOnly in Tauri", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(true);

    const visible = getVisibleProviders();
    expect(visible.some((p) => p.id === "claude-code")).toBe(true);
    expect(visible).toHaveLength(4);
  });

  it("createProvider returns provider for openai", () => {
    const provider = createProvider({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-5",
      modelId: "openai:gpt-5",
      isConfigured: true,
    });
    expect(provider.id).toBe("openai");
    expect(provider.capabilities.textGeneration).toBe(true);
  });

  it("createProvider returns provider for claude-code", () => {
    const provider = createProvider({
      provider: "claude-code",
      apiKey: "",
      model: "",
      modelId: "claude-code:default",
      isConfigured: true,
    });
    expect(provider.id).toBe("claude-code");
    expect(provider.capabilities.fileAccess).toBe(true);
    expect(provider.capabilities.agentLoop).toBe(true);
  });

  it("claude-code isAvailable returns false in web environment", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(false);

    const provider = createProvider({
      provider: "claude-code",
      apiKey: "",
      model: "",
      modelId: "claude-code:default",
      isConfigured: true,
    });
    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });
});
