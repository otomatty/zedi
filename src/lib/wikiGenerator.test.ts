import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractWikiLinks,
  getAISettingsOrThrow,
  generateWikiContentStream,
  generateWikiContentFromChatOutlineStream,
} from "@/lib/wikiGenerator";
import {
  WIKI_GENERATOR_PROMPT,
  WIKI_GENERATOR_PROMPT_NO_SEARCH,
} from "./wikiGenerator/wikiGeneratorPrompt";

vi.mock("./aiSettings", () => ({
  loadAISettings: vi.fn(),
}));

vi.mock("@/lib/aiService", () => ({
  callAIService: vi.fn(),
}));

vi.mock("./wikiGenerator/wikiGeneratorStreamFullPrompt", () => ({
  streamWikiStyleFromFullPrompt: vi.fn(),
}));

vi.mock("./wikiGenerator/wikiGeneratorProviders", () => ({
  generateWithOpenAI: vi.fn().mockResolvedValue(undefined),
  generateWithAnthropic: vi.fn().mockResolvedValue(undefined),
  generateWithGoogle: vi.fn().mockResolvedValue(undefined),
}));

import { loadAISettings } from "./aiSettings";
import { callAIService, type AIServiceResponse } from "@/lib/aiService";
import { streamWikiStyleFromFullPrompt } from "./wikiGenerator/wikiGeneratorStreamFullPrompt";
import {
  generateWithOpenAI,
  generateWithAnthropic,
  generateWithGoogle,
} from "./wikiGenerator/wikiGeneratorProviders";
import type { AISettings } from "@/types/ai";

const baseSettings: AISettings = {
  provider: "openai",
  apiKey: "",
  apiMode: "api_server",
  model: "gpt-4",
  modelId: "openai:gpt-4",
  isConfigured: true,
};

describe("wikiGeneratorPrompt", () => {
  it("WIKI_GENERATOR_PROMPT_NO_SEARCH differs from base prompt so non-search models get correct instructions", () => {
    expect(WIKI_GENERATOR_PROMPT_NO_SEARCH).not.toBe(WIKI_GENERATOR_PROMPT);
    expect(WIKI_GENERATOR_PROMPT_NO_SEARCH).not.toEqual(WIKI_GENERATOR_PROMPT);
    expect(WIKI_GENERATOR_PROMPT_NO_SEARCH).toContain("### 4. 参考情報の扱い");
    expect(WIKI_GENERATOR_PROMPT_NO_SEARCH).not.toContain("### 4. 出典・参照元");
  });

  // issue #784: モデルが本文先頭に `# {タイトル}` を出さないように、プロンプト側で
  // 明示的に禁止することを保証する。
  // issue #784: ensure the prompt explicitly forbids a leading `# {Title}` body heading,
  // since the page title is owned by a separate input field.
  it("explicitly forbids emitting a leading `# {タイトル}` body heading (issue #784)", () => {
    expect(WIKI_GENERATOR_PROMPT).toContain("# {タイトル}");
    expect(WIKI_GENERATOR_PROMPT).toContain("出力しないこと");
    expect(WIKI_GENERATOR_PROMPT_NO_SEARCH).toContain("# {タイトル}");
    expect(WIKI_GENERATOR_PROMPT_NO_SEARCH).toContain("出力しないこと");
  });

  // 旧テンプレ末尾の `## タイトル\n{{title}}` ブロックは AI が誤って `# {タイトル}` を
  // 本文先頭に出す原因となるため、`<page_title>` 構造に置き換えられている。
  // The old `## タイトル\n{{title}}` block was misread by AIs as a hint to emit `# {Title}`.
  // It has been replaced with a `<page_title>` block to remove that ambiguity (issue #784).
  it("uses a <page_title> tag instead of the legacy `## タイトル / {{title}}` template (issue #784)", () => {
    expect(WIKI_GENERATOR_PROMPT).toContain("<page_title>");
    expect(WIKI_GENERATOR_PROMPT).toContain("</page_title>");
    expect(WIKI_GENERATOR_PROMPT).not.toMatch(/^## タイトル$/m);
    expect(WIKI_GENERATOR_PROMPT).toContain("{{title}}");
    expect(WIKI_GENERATOR_PROMPT).toContain("{{schema}}");
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
      isConfigured: false,
    });
    const result = await getAISettingsOrThrow();
    expect(result.isConfigured).toBe(true);
  });

  it("throws AI_NOT_CONFIGURED when user_api_key mode and no apiKey", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "user_api_key",
      apiKey: "",
      isConfigured: false,
    });
    await expect(getAISettingsOrThrow()).rejects.toThrow("AI_NOT_CONFIGURED");
  });

  it("throws AI_NOT_CONFIGURED when user_api_key mode with api key but not configured", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "user_api_key",
      apiKey: "sk-test",
      isConfigured: false,
    });
    await expect(getAISettingsOrThrow()).rejects.toThrow("AI_NOT_CONFIGURED");
  });

  it("returns settings when user_api_key mode with api key and configured", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "user_api_key",
      apiKey: "sk-test",
      isConfigured: true,
    });
    const result = await getAISettingsOrThrow();
    expect(result.apiKey).toBe("sk-test");
    expect(result.apiMode).toBe("user_api_key");
  });
});

describe("generateWikiContentStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses provider SDK instead of callAIService when user_api_key mode", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "user_api_key",
      apiKey: "sk-user",
      isConfigured: true,
    });

    await generateWikiContentStream(
      "SdkTitle",
      { onChunk: vi.fn(), onComplete: vi.fn(), onError: vi.fn() },
      undefined,
    );

    expect(callAIService).not.toHaveBeenCalled();
    expect(generateWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiMode: "user_api_key", apiKey: "sk-user" }),
      "SdkTitle",
      expect.any(Object),
      undefined,
      undefined,
    );
    expect(generateWithAnthropic).not.toHaveBeenCalled();
    expect(generateWithGoogle).not.toHaveBeenCalled();
  });

  it("uses callAIService in api_server mode and calls onComplete with extracted wiki links", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
    });

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

    expect(callAIService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: WIKI_GENERATOR_PROMPT.replace("{{title}}", "Test").replace("{{schema}}", ""),
          },
        ],
        options: expect.objectContaining({
          stream: true,
          feature: "wiki_generation",
          temperature: 0.7,
          maxTokens: 4000,
        }),
      }),
      expect.anything(),
      undefined,
    );
    expect(onChunk).toHaveBeenCalledWith("Hello ");
    expect(onChunk).toHaveBeenCalledWith("[[World]].");
    // response.content が明示的に "" のときは fullContent にフォールバックせず "" を渡す（?? の挙動）
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "",
        wikiLinks: [],
      }),
    );
  });

  it("uses accumulated stream when onComplete omits content", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
    });

    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onChunk("Streamed ");
      handlers.onChunk("body");
      handlers.onComplete?.({} as unknown as AIServiceResponse);
      return Promise.resolve();
    });

    const onComplete = vi.fn();
    await generateWikiContentStream("Test", { onChunk: vi.fn(), onComplete, onError: vi.fn() });

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Streamed body",
        wikiLinks: expect.any(Array),
      }),
    );
  });

  it("forwards callAIService onError to callbacks", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({ ...baseSettings });
    const svcErr = new Error("stream service failed");
    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onError(svcErr);
      return Promise.resolve();
    });

    const onError = vi.fn();
    await generateWikiContentStream("T", { onChunk: vi.fn(), onComplete: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith(svcErr);
  });

  it("falls back to api_server when apiMode is omitted and apiKey is empty", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: undefined,
      apiKey: "",
    });
    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onComplete?.({ content: "" });
      return Promise.resolve();
    });

    await generateWikiContentStream("FallbackTitle", {
      onChunk: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    });

    expect(callAIService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: WIKI_GENERATOR_PROMPT.replace("{{title}}", "FallbackTitle").replace(
              "{{schema}}",
              "",
            ),
          },
        ],
      }),
      expect.anything(),
      undefined,
    );
  });
});

describe("generateWikiContentFromChatOutlineStream — api_server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses api_server path when apiMode is omitted and apiKey is empty (chat outline)", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: undefined,
      apiKey: "",
    });
    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onComplete?.({ content: "ok" });
      return Promise.resolve();
    });

    await generateWikiContentFromChatOutlineStream(
      "OutlineTitle",
      "o",
      "c",
      { onChunk: vi.fn(), onComplete: vi.fn(), onError: vi.fn() },
      undefined,
    );

    expect(callAIService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          feature: "chat_page_generation",
          stream: true,
        }),
      }),
      expect.anything(),
      undefined,
    );
    expect(streamWikiStyleFromFullPrompt).not.toHaveBeenCalled();
  });

  it("uses callAIService in api_server mode with chat_page_generation feature", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "api_server",
    });

    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onChunk("# ");
      handlers.onChunk("Hello");
      handlers.onComplete?.({ content: "# Hello" });
      return Promise.resolve();
    });

    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await generateWikiContentFromChatOutlineStream(
      "My Title",
      "- outline",
      "User: hi",
      { onChunk, onComplete, onError },
      undefined,
    );

    expect(callAIService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          feature: "chat_page_generation",
          stream: true,
        }),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("My Title"),
          }),
        ]),
      }),
      expect.anything(),
      undefined,
    );
    expect(onChunk).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "# Hello",
        wikiLinks: [],
      }),
    );
    expect(streamWikiStyleFromFullPrompt).not.toHaveBeenCalled();
  });

  it("uses streamed chunks when onComplete returns undefined content", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({ ...baseSettings, apiMode: "api_server" });
    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onChunk("Part1");
      handlers.onChunk("Part2");
      handlers.onComplete?.({ content: undefined } as unknown as AIServiceResponse);
      return Promise.resolve();
    });

    const onComplete = vi.fn();
    await generateWikiContentFromChatOutlineStream(
      "T",
      "o",
      "c",
      { onChunk: vi.fn(), onComplete, onError: vi.fn() },
      undefined,
    );

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Part1Part2",
      }),
    );
  });

  it("forwards callAIService onError in chat outline stream", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({ ...baseSettings, apiMode: "api_server" });
    const err = new Error("chat svc");
    vi.mocked(callAIService).mockImplementation((_s, _req, handlers) => {
      handlers.onError(err);
      return Promise.resolve();
    });

    const onError = vi.fn();
    await generateWikiContentFromChatOutlineStream(
      "T",
      "o",
      "c",
      { onChunk: vi.fn(), onComplete: vi.fn(), onError },
      undefined,
    );

    expect(onError).toHaveBeenCalledWith(err);
  });
});

describe("generateWikiContentFromChatOutlineStream — user_api_key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onError when streamWikiStyleFromFullPrompt rejects", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "user_api_key",
      apiKey: "sk-test",
    });

    vi.mocked(streamWikiStyleFromFullPrompt).mockRejectedValue(new Error("stream failed"));

    const onError = vi.fn();
    await generateWikiContentFromChatOutlineStream(
      "T",
      "o",
      "c",
      { onChunk: vi.fn(), onComplete: vi.fn(), onError },
      undefined,
    );

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "stream failed" }));
  });

  it("wraps non-Error rejection in Error for chat outline stream", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "user_api_key",
      apiKey: "sk-test",
    });
    vi.mocked(streamWikiStyleFromFullPrompt).mockRejectedValue("not an Error object");

    const onError = vi.fn();
    await generateWikiContentFromChatOutlineStream(
      "T",
      "o",
      "c",
      { onChunk: vi.fn(), onComplete: vi.fn(), onError },
      undefined,
    );

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0]).toMatchObject({
      message: expect.stringContaining("Unknown"),
    });
  });

  it("delegates to streamWikiStyleFromFullPrompt in user_api_key mode", async () => {
    vi.mocked(loadAISettings).mockResolvedValue({
      ...baseSettings,
      apiMode: "user_api_key",
      apiKey: "sk-test",
    });

    vi.mocked(streamWikiStyleFromFullPrompt).mockImplementation((_s, _req, handlers) => {
      handlers.onChunk("x");
      handlers.onComplete({ content: "x", wikiLinks: [] });
      return Promise.resolve();
    });

    const onComplete = vi.fn();
    await generateWikiContentFromChatOutlineStream(
      "T",
      "o",
      "c",
      { onChunk: vi.fn(), onComplete, onError: vi.fn() },
      undefined,
    );

    expect(streamWikiStyleFromFullPrompt).toHaveBeenCalled();
    expect(callAIService).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });
});
