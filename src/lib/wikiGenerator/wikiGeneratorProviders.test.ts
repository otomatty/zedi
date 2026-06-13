import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateWithOpenAI,
  generateWithAnthropic,
  generateWithGoogle,
} from "./wikiGeneratorProviders";
import { extractWikiLinks, type WikiGeneratorCallbacks } from "./wikiGeneratorUtils";
import type { AISettings } from "@/types/ai";

const { openaiCreate, anthropicStream, googleStream } = vi.hoisted(() => ({
  openaiCreate: vi.fn(),
  anthropicStream: vi.fn(),
  googleStream: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: anthropicStream };
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContentStream: googleStream };
  },
}));

vi.mock("./wikiGeneratorPrompt", () => ({
  WIKI_GENERATOR_PROMPT: "SEARCH:{{title}}|{{schema}}",
  WIKI_GENERATOR_PROMPT_NO_SEARCH: "NOSEARCH:{{title}}|{{schema}}",
}));

/** items を一度だけ列挙する非同期イテレータを返す。 */
function streamOf<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

function makeCallbacks() {
  const chunks: string[] = [];
  const completed: { content: string; wikiLinks: string[] }[] = [];
  const errors: Error[] = [];
  const callbacks: WikiGeneratorCallbacks = {
    onChunk: (c) => chunks.push(c),
    onComplete: (r) => completed.push(r),
    onError: (e) => errors.push(e),
  };
  return { callbacks, chunks, completed, errors };
}

function settings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    provider: "openai",
    apiKey: "sk-test",
    apiMode: "user_api_key",
    model: "gpt-4o",
    modelId: "openai:gpt-4o",
    isConfigured: true,
    ...overrides,
  };
}

describe("wikiGeneratorProviders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateWithOpenAI", () => {
    it("非検索モデルでは NO_SEARCH テンプレートを使い web_search_options を付けない", async () => {
      openaiCreate.mockResolvedValue(streamOf([{ choices: [{ delta: { content: "hi" } }] }]));
      const { callbacks } = makeCallbacks();

      await generateWithOpenAI(settings({ model: "gpt-4o" }), "Title", callbacks);

      const params = openaiCreate.mock.calls[0][0];
      expect(params.messages[0].content.startsWith("NOSEARCH:")).toBe(true);
      expect(params.messages[0].content).toContain("Title");
      expect(params.web_search_options).toBeUndefined();
      expect(params.stream).toBe(true);
    });

    it("検索モデルでは SEARCH テンプレートと web_search_options を使う", async () => {
      openaiCreate.mockResolvedValue(streamOf([]));
      const { callbacks } = makeCallbacks();

      await generateWithOpenAI(settings({ model: "gpt-4o-search-preview" }), "Title", callbacks);

      const params = openaiCreate.mock.calls[0][0];
      expect(params.messages[0].content.startsWith("SEARCH:")).toBe(true);
      expect(params.web_search_options).toEqual({ search_context_size: "medium" });
    });

    it("チャンクを集約し、空 content はスキップ、onComplete で wikiLinks を返す", async () => {
      openaiCreate.mockResolvedValue(
        streamOf([
          { choices: [{ delta: { content: "See [[" } }] },
          { choices: [{ delta: { content: "" } }] },
          { choices: [{ delta: { content: "Foo]]" } }] },
        ]),
      );
      const { callbacks, chunks, completed } = makeCallbacks();

      await generateWithOpenAI(settings(), "Title", callbacks);

      expect(chunks).toEqual(["See [[", "Foo]]"]);
      expect(completed[0].content).toBe("See [[Foo]]");
      expect(completed[0].wikiLinks).toEqual(extractWikiLinks("See [[Foo]]"));
    });

    it("userSchema を渡すとスキーマブロックが、未指定なら {{schema}} が残らない", async () => {
      openaiCreate.mockResolvedValue(streamOf([]));
      const { callbacks } = makeCallbacks();

      await generateWithOpenAI(settings(), "Title", callbacks, undefined, "MY RULES");
      expect(openaiCreate.mock.calls[0][0].messages[0].content).toContain("MY RULES");

      openaiCreate.mockResolvedValue(streamOf([]));
      await generateWithOpenAI(settings(), "Title", callbacks);
      expect(openaiCreate.mock.calls[1][0].messages[0].content).not.toContain("{{schema}}");
    });

    it("title 内の $ パターンは再解釈されずそのまま埋め込まれる", async () => {
      openaiCreate.mockResolvedValue(streamOf([]));
      const { callbacks } = makeCallbacks();

      await generateWithOpenAI(settings(), "A$&B", callbacks);

      expect(openaiCreate.mock.calls[0][0].messages[0].content).toContain("A$&B");
    });

    it("中断済み signal ではストリーム途中で ABORTED を投げる", async () => {
      const controller = new AbortController();
      controller.abort();
      openaiCreate.mockResolvedValue(streamOf([{ choices: [{ delta: { content: "x" } }] }]));
      const { callbacks } = makeCallbacks();

      await expect(
        generateWithOpenAI(settings(), "Title", callbacks, controller.signal),
      ).rejects.toThrow("ABORTED");
    });
  });

  describe("generateWithAnthropic", () => {
    it("Web 検索対応モデルでは SEARCH テンプレートと web_search ツールを使う", async () => {
      anthropicStream.mockReturnValue(streamOf([]));
      const { callbacks } = makeCallbacks();

      await generateWithAnthropic(
        settings({ model: "claude-3-5-sonnet-latest" }),
        "Title",
        callbacks,
      );

      const params = anthropicStream.mock.calls[0][0];
      expect(params.messages[0].content.startsWith("SEARCH:")).toBe(true);
      expect(params.tools).toEqual([
        { type: "web_search_20250305", name: "web_search", max_uses: 5 },
      ]);
    });

    it("非対応モデルでは NO_SEARCH テンプレートを使い tools を付けない", async () => {
      anthropicStream.mockReturnValue(streamOf([]));
      const { callbacks } = makeCallbacks();

      await generateWithAnthropic(settings({ model: "claude-2.1" }), "Title", callbacks);

      const params = anthropicStream.mock.calls[0][0];
      expect(params.messages[0].content.startsWith("NOSEARCH:")).toBe(true);
      expect(params.tools).toBeUndefined();
    });

    it("text_delta イベントのみ集約し、その他のイベントは無視する", async () => {
      anthropicStream.mockReturnValue(
        streamOf([
          { type: "content_block_delta", delta: { type: "text_delta", text: "Hello " } },
          { type: "content_block_start", delta: { type: "text_delta", text: "ignored" } },
          { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "x" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "world" } },
        ]),
      );
      const { callbacks, chunks, completed } = makeCallbacks();

      await generateWithAnthropic(settings({ model: "claude-2.1" }), "Title", callbacks);

      expect(chunks).toEqual(["Hello ", "world"]);
      expect(completed[0].content).toBe("Hello world");
    });

    it("中断済み signal では ABORTED を投げる", async () => {
      const controller = new AbortController();
      controller.abort();
      anthropicStream.mockReturnValue(
        streamOf([{ type: "content_block_delta", delta: { type: "text_delta", text: "x" } }]),
      );
      const { callbacks } = makeCallbacks();

      await expect(
        generateWithAnthropic(
          settings({ model: "claude-2.1" }),
          "Title",
          callbacks,
          controller.signal,
        ),
      ).rejects.toThrow("ABORTED");
    });
  });

  describe("generateWithGoogle", () => {
    it("常に SEARCH テンプレートと googleSearch ツールを使う", async () => {
      googleStream.mockResolvedValue(streamOf([]));
      const { callbacks } = makeCallbacks();

      await generateWithGoogle(settings({ model: "gemini-3-flash-preview" }), "Title", callbacks);

      const params = googleStream.mock.calls[0][0];
      expect(params.contents.startsWith("SEARCH:")).toBe(true);
      expect(params.config.tools).toEqual([{ googleSearch: {} }]);
    });

    it("abortSignal を渡すと config.abortSignal に反映され、未指定なら付かない", async () => {
      const controller = new AbortController();
      googleStream.mockResolvedValue(streamOf([]));
      const { callbacks } = makeCallbacks();

      await generateWithGoogle(settings(), "Title", callbacks, controller.signal);
      expect(googleStream.mock.calls[0][0].config.abortSignal).toBe(controller.signal);

      googleStream.mockResolvedValue(streamOf([]));
      await generateWithGoogle(settings(), "Title", callbacks);
      expect("abortSignal" in googleStream.mock.calls[1][0].config).toBe(false);
    });

    it("チャンクの text を集約し、空はスキップして onComplete を呼ぶ", async () => {
      googleStream.mockResolvedValue(streamOf([{ text: "A " }, { text: "" }, { text: "B" }]));
      const { callbacks, chunks, completed } = makeCallbacks();

      await generateWithGoogle(settings(), "Title", callbacks);

      expect(chunks).toEqual(["A ", "B"]);
      expect(completed[0].content).toBe("A B");
    });

    it("中断済み signal では ABORTED を投げる", async () => {
      const controller = new AbortController();
      controller.abort();
      googleStream.mockResolvedValue(streamOf([{ text: "x" }]));
      const { callbacks } = makeCallbacks();

      await expect(
        generateWithGoogle(settings(), "Title", callbacks, controller.signal),
      ).rejects.toThrow("ABORTED");
    });
  });
});
