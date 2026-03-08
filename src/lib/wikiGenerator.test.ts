import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractWikiLinks,
  getAISettingsOrThrow,
  generateWikiContentStream,
} from "@/lib/wikiGenerator";

vi.mock("./aiSettings", () => ({
  loadAISettings: vi.fn(),
}));

vi.mock("./aiService", () => ({
  callAIService: vi.fn(),
}));

import { loadAISettings } from "./aiSettings";
import { callAIService } from "./aiService";

describe("extractWikiLinks", () => {
  it("returns unique wiki link titles from content", () => {
    const content = "See [[React]] and [[Vue]] and [[React]] again.";
    expect(extractWikiLinks(content)).toEqual(["React", "Vue"]);
  });

  it("returns empty array when no wiki links", () => {
    expect(extractWikiLinks("Plain text only.")).toEqual([]);
  });

  it("handles empty string", () => {
    expect(extractWikiLinks("")).toEqual([]);
  });
});

describe("getAISettingsOrThrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default settings when loadAISettings returns null", async () => {
    vi.mocked(loadAISettings).mockResolvedValue(null);
    const { DEFAULT_AI_SETTINGS } = await import("@/types/ai");
    const result = await getAISettingsOrThrow();
    expect(result).toMatchObject({
      ...DEFAULT_AI_SETTINGS,
      isConfigured: true,
    });
  });

  it("returns settings with isConfigured when api_server mode", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      provider: "openai",
      model: "gpt-4",
      apiMode: "api_server",
      isConfigured: false,
    } as never);
    const result = await getAISettingsOrThrow();
    expect(result.isConfigured).toBe(true);
  });

  it("throws AI_NOT_CONFIGURED when user_api_key mode and no apiKey", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      provider: "openai",
      model: "gpt-4",
      apiMode: "user_api_key",
      apiKey: "",
      isConfigured: false,
    } as never);
    await expect(getAISettingsOrThrow()).rejects.toThrow("AI_NOT_CONFIGURED");
  });
});

describe("generateWikiContentStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses callAIService in api_server mode and calls onComplete with extracted wiki links", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      provider: "openai",
      model: "gpt-4",
      apiMode: "api_server",
      apiKey: "",
      isConfigured: true,
    } as never);

    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onChunk("Hello ");
      handlers.onChunk("[[World]].");
      handlers.onComplete();
      return Promise.resolve();
    });

    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await generateWikiContentStream("Test", { onChunk, onComplete, onError }, undefined);

    expect(callAIService).toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith("Hello ");
    expect(onChunk).toHaveBeenCalledWith("[[World]].");
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Hello [[World]].",
        wikiLinks: ["World"],
      }),
    );
  });
});
