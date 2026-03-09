import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractWikiLinks,
  getAISettingsOrThrow,
  generateWikiContentStream,
} from "@/lib/wikiGenerator";
import {
  WIKI_GENERATOR_PROMPT,
  WIKI_GENERATOR_PROMPT_NO_SEARCH,
} from "./wikiGenerator/wikiGeneratorPrompt";

vi.mock("./aiSettings", () => ({
  loadAISettings: vi.fn(),
}));

vi.mock("./aiService", () => ({
  callAIService: vi.fn(),
}));

import { loadAISettings } from "./aiSettings";
import { callAIService } from "./aiService";
import type { AISettings } from "@/types/ai";

const baseSettings: Partial<AISettings> = {
  provider: "openai",
  model: "gpt-4",
};

describe("wikiGeneratorPrompt", () => {
  it("WIKI_GENERATOR_PROMPT_NO_SEARCH differs from base prompt so non-search models get correct instructions", () => {
    expect(WIKI_GENERATOR_PROMPT_NO_SEARCH).not.toBe(WIKI_GENERATOR_PROMPT);
    expect(WIKI_GENERATOR_PROMPT_NO_SEARCH).not.toEqual(WIKI_GENERATOR_PROMPT);
  });
});

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
      ...baseSettings,
      apiMode: "api_server",
      isConfigured: false,
    } as AISettings);
    const result = await getAISettingsOrThrow();
    expect(result.isConfigured).toBe(true);
  });

  it("throws AI_NOT_CONFIGURED when user_api_key mode and no apiKey", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "user_api_key",
      apiKey: "",
      isConfigured: false,
    } as AISettings);
    await expect(getAISettingsOrThrow()).rejects.toThrow("AI_NOT_CONFIGURED");
  });
});

describe("generateWikiContentStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses callAIService in api_server mode and calls onComplete with extracted wiki links", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "api_server",
      apiKey: "",
      isConfigured: true,
    } as AISettings);

    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onChunk("Hello ");
      handlers.onChunk("[[World]].");
      handlers.onComplete?.({ content: "" });
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
