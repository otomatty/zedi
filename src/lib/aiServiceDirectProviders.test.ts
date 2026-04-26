/**
 * Tests for direct-SDK provider calls (OpenAI / Anthropic / Google).
 * 直接 SDK 経由のプロバイダ呼び出しのテスト。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callOpenAI, callAnthropic, callGoogle } from "./aiServiceDirectProviders";
import type { AIServiceRequest, AIServiceCallbacks } from "./aiService";
import type { AISettings } from "@/types/ai";

// --- Module mocks --------------------------------------------------------- //

let openAIMock: {
  chat: { completions: { create: ReturnType<typeof vi.fn> } };
} | null = null;
let anthropicMock: {
  messages: {
    create: ReturnType<typeof vi.fn>;
    stream: ReturnType<typeof vi.fn>;
  };
} | null = null;
let googleMock: {
  models: {
    generateContent: ReturnType<typeof vi.fn>;
    generateContentStream: ReturnType<typeof vi.fn>;
  };
} | null = null;

const openAICtor = vi.fn();
const anthropicCtor = vi.fn();
const googleCtor = vi.fn();

vi.mock("openai", () => ({
  default: function OpenAI(args: unknown) {
    openAICtor(args);
    if (!openAIMock) throw new Error("OpenAI mock is not configured");
    return openAIMock;
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: function Anthropic(args: unknown) {
    anthropicCtor(args);
    if (!anthropicMock) throw new Error("Anthropic mock is not configured");
    return anthropicMock;
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: function GoogleGenAI(args: unknown) {
    googleCtor(args);
    if (!googleMock) throw new Error("GoogleGenAI mock is not configured");
    return googleMock;
  },
}));

// --- Helpers --------------------------------------------------------------- //

async function* asyncGen<T>(items: T[]): AsyncGenerator<T> {
  for (const it of items) yield it;
}

function buildSettings(provider: AISettings["provider"], apiKey = "key"): AISettings {
  return {
    provider,
    apiKey,
    apiMode: "user_api_key",
    model: "x",
    modelId: `${provider}:x`,
    isConfigured: true,
  };
}

function buildCallbacks(): Required<
  Pick<AIServiceCallbacks, "onChunk" | "onComplete" | "onError">
> {
  return {
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  openAIMock = null;
  anthropicMock = null;
  googleMock = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =========================================================================== //
// OpenAI
// =========================================================================== //

describe("callOpenAI", () => {
  it("API キーと dangerouslyAllowBrowser を渡してクライアントを生成する", async () => {
    openAIMock = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          }),
        },
      },
    };
    const request: AIServiceRequest = {
      provider: "openai",
      model: "gpt-5",
      messages: [{ role: "user", content: "hi" }],
      options: { stream: false },
    };
    await callOpenAI(buildSettings("openai", "sk-test"), request, buildCallbacks());
    expect(openAICtor).toHaveBeenCalledWith({
      apiKey: "sk-test",
      dangerouslyAllowBrowser: true,
    });
  });

  it("非ストリーミング: 既定の max_tokens=4000, temperature=0.7 を渡す", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
    });
    openAIMock = { chat: { completions: { create } } };

    const request: AIServiceRequest = {
      provider: "openai",
      model: "gpt-5",
      messages: [{ role: "user", content: "hi" }],
      options: { stream: false },
    };
    const callbacks = buildCallbacks();
    await callOpenAI(buildSettings("openai"), request, callbacks);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 4000,
        temperature: 0.7,
        stream: false,
      }),
      expect.objectContaining({ signal: undefined }),
    );
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "Hello",
      finishReason: "stop",
    });
  });

  it("非ストリーミング: 明示の maxTokens / temperature を尊重する", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "length" }],
    });
    openAIMock = { chat: { completions: { create } } };
    const request: AIServiceRequest = {
      provider: "openai",
      model: "gpt-5",
      messages: [{ role: "user", content: "hi" }],
      options: { stream: false, maxTokens: 256, temperature: 0.1 },
    };
    await callOpenAI(buildSettings("openai"), request, buildCallbacks());

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 256, temperature: 0.1 }),
      expect.anything(),
    );
  });

  it("非ストリーミング: choices[0].message.content が無いと空文字で onComplete", async () => {
    openAIMock = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: {}, finish_reason: undefined }],
          }),
        },
      },
    };
    const callbacks = buildCallbacks();
    await callOpenAI(
      buildSettings("openai"),
      {
        provider: "openai",
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: false },
      },
      callbacks,
    );
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "",
      finishReason: undefined,
    });
  });

  it("ストリーミング: 累積した content と最終 onComplete が呼ばれる", async () => {
    const stream = asyncGen([
      { choices: [{ delta: { content: "He" } }] },
      { choices: [{ delta: { content: "llo" } }] },
      { choices: [{ delta: {} }] }, // 空 delta はスキップ
    ]);
    const create = vi.fn().mockResolvedValue(stream);
    openAIMock = { chat: { completions: { create } } };

    const callbacks = buildCallbacks();
    await callOpenAI(
      buildSettings("openai"),
      {
        provider: "openai",
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: true },
      },
      callbacks,
    );

    expect(callbacks.onChunk).toHaveBeenCalledTimes(2);
    expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, "He");
    expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, "llo");
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "Hello",
      finishReason: "stop",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true }),
      expect.anything(),
    );
  });

  it("ストリーミング: webSearchOptions が SDK に渡される", async () => {
    const create = vi.fn().mockResolvedValue(asyncGen<unknown>([]));
    openAIMock = { chat: { completions: { create } } };
    await callOpenAI(
      buildSettings("openai"),
      {
        provider: "openai",
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
        options: {
          stream: true,
          webSearchOptions: { search_context_size: "high" },
        },
      },
      buildCallbacks(),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        web_search_options: { search_context_size: "high" },
      }),
      expect.anything(),
    );
  });

  it("ストリーミング: abortSignal が aborted の場合は ABORTED で reject", async () => {
    const stream = asyncGen([
      { choices: [{ delta: { content: "hi" } }] },
      { choices: [{ delta: { content: "more" } }] },
    ]);
    openAIMock = {
      chat: { completions: { create: vi.fn().mockResolvedValue(stream) } },
    };
    const ac = new AbortController();
    ac.abort();
    await expect(
      callOpenAI(
        buildSettings("openai"),
        {
          provider: "openai",
          model: "gpt-5",
          messages: [{ role: "user", content: "hi" }],
          options: { stream: true },
        },
        buildCallbacks(),
        ac.signal,
      ),
    ).rejects.toThrow("ABORTED");
  });
});

// =========================================================================== //
// Anthropic
// =========================================================================== //

describe("callAnthropic", () => {
  it("API キーでクライアントを生成する", async () => {
    anthropicMock = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
        }),
        stream: vi.fn(),
      },
    };
    await callAnthropic(
      buildSettings("anthropic", "sk-ant-x"),
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: false },
      },
      buildCallbacks(),
    );
    expect(anthropicCtor).toHaveBeenCalledWith({ apiKey: "sk-ant-x" });
  });

  it("system メッセージは system フィールドへ集約する", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
    });
    anthropicMock = { messages: { create, stream: vi.fn() } };
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        messages: [
          { role: "system", content: "rule A" },
          { role: "system", content: "rule B" },
          { role: "user", content: "go" },
        ],
        options: { stream: false },
      },
      buildCallbacks(),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "rule A\n\nrule B",
        messages: [{ role: "user", content: "go" }],
      }),
      expect.anything(),
    );
  });

  it("system メッセージが無ければ system フィールドは付かない", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
    });
    anthropicMock = { messages: { create, stream: vi.fn() } };
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "go" }],
        options: { stream: false },
      },
      buildCallbacks(),
    );
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.system).toBeUndefined();
  });

  it("対応モデル名なら自動で web_search ツールを付ける", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
    });
    anthropicMock = { messages: { create, stream: vi.fn() } };
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "go" }],
        options: { stream: false },
      },
      buildCallbacks(),
    );
    const arg = create.mock.calls[0][0] as { tools?: Array<{ name: string }> };
    expect(arg.tools?.[0]?.name).toBe("web_search");
  });

  it("対応外モデル名ならツールは付かない", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
    });
    anthropicMock = { messages: { create, stream: vi.fn() } };
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-2.1",
        messages: [{ role: "user", content: "go" }],
        options: { stream: false },
      },
      buildCallbacks(),
    );
    const arg = create.mock.calls[0][0] as { tools?: unknown };
    expect(arg.tools).toBeUndefined();
  });

  it("useWebSearch=false なら対応モデルでもツールを付けない", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
    });
    anthropicMock = { messages: { create, stream: vi.fn() } };
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "go" }],
        options: { stream: false, useWebSearch: false },
      },
      buildCallbacks(),
    );
    const arg = create.mock.calls[0][0] as { tools?: unknown };
    expect(arg.tools).toBeUndefined();
  });

  it("useWebSearch=true なら対応外モデルでもツールを付ける", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
    });
    anthropicMock = { messages: { create, stream: vi.fn() } };
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-2.1",
        messages: [{ role: "user", content: "go" }],
        options: { stream: false, useWebSearch: true },
      },
      buildCallbacks(),
    );
    const arg = create.mock.calls[0][0] as { tools?: Array<{ name: string }> };
    expect(arg.tools?.[0]?.name).toBe("web_search");
  });

  it("非ストリーミング: text ブロックの内容を onComplete に渡す", async () => {
    anthropicMock = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: "tool_use", id: "x", name: "y", input: {} },
            { type: "text", text: "Hello!" },
          ],
          stop_reason: "end_turn",
        }),
        stream: vi.fn(),
      },
    };
    const callbacks = buildCallbacks();
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: false },
      },
      callbacks,
    );
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "Hello!",
      finishReason: "end_turn",
    });
  });

  it("非ストリーミング: text ブロックが無ければ空文字で onComplete", async () => {
    anthropicMock = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
          stop_reason: "tool_use",
        }),
        stream: vi.fn(),
      },
    };
    const callbacks = buildCallbacks();
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: false },
      },
      callbacks,
    );
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "",
      finishReason: "tool_use",
    });
  });

  it("ストリーミング: text_delta だけをチャンクとして流す", async () => {
    const events = [
      { type: "message_start" },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hel" },
      },
      {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: "{" },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "lo" },
      },
    ];
    const streamFn = vi.fn().mockReturnValue(asyncGen(events));
    anthropicMock = { messages: { create: vi.fn(), stream: streamFn } };

    const callbacks = buildCallbacks();
    await callAnthropic(
      buildSettings("anthropic"),
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: true },
      },
      callbacks,
    );

    expect(callbacks.onChunk).toHaveBeenCalledTimes(2);
    expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, "Hel");
    expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, "lo");
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "Hello",
      finishReason: "stop",
    });
  });

  it("ストリーミング: 既に aborted のシグナルなら ABORTED で reject", async () => {
    const events = [{ type: "content_block_delta", delta: { type: "text_delta", text: "x" } }];
    const streamFn = vi.fn().mockReturnValue(asyncGen(events));
    anthropicMock = { messages: { create: vi.fn(), stream: streamFn } };
    const ac = new AbortController();
    ac.abort();
    await expect(
      callAnthropic(
        buildSettings("anthropic"),
        {
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "hi" }],
          options: { stream: true },
        },
        buildCallbacks(),
        ac.signal,
      ),
    ).rejects.toThrow("ABORTED");
  });
});

// =========================================================================== //
// Google
// =========================================================================== //

describe("callGoogle", () => {
  it("API キーでクライアントを生成する", async () => {
    googleMock = {
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: "ok" }),
        generateContentStream: vi.fn(),
      },
    };
    await callGoogle(
      buildSettings("google", "AIza-x"),
      {
        provider: "google",
        model: "gemini-3-flash",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: false },
      },
      buildCallbacks(),
    );
    expect(googleCtor).toHaveBeenCalledWith({ apiKey: "AIza-x" });
  });

  it("非ストリーミング: 既定で googleSearch ツールを付ける", async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: "Hello" });
    googleMock = {
      models: { generateContent, generateContentStream: vi.fn() },
    };
    const callbacks = buildCallbacks();
    await callGoogle(
      buildSettings("google"),
      {
        provider: "google",
        model: "gemini-3-flash",
        messages: [
          { role: "user", content: "msg1" },
          { role: "user", content: "msg2" },
        ],
        options: { stream: false, temperature: 0.3 },
      },
      callbacks,
    );

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3-flash",
        contents: "msg1\n\nmsg2",
        config: expect.objectContaining({
          temperature: 0.3,
          tools: [{ googleSearch: {} }],
        }),
      }),
    );
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "Hello",
      finishReason: "stop",
    });
  });

  it("非ストリーミング: useGoogleSearch=false ならツールを undefined にする", async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: "x" });
    googleMock = {
      models: { generateContent, generateContentStream: vi.fn() },
    };
    await callGoogle(
      buildSettings("google"),
      {
        provider: "google",
        model: "gemini-3-flash",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: false, useGoogleSearch: false },
      },
      buildCallbacks(),
    );
    const cfg = (generateContent.mock.calls[0][0] as { config: { tools?: unknown } }).config;
    expect(cfg.tools).toBeUndefined();
  });

  it("非ストリーミング: text 未定義なら空文字で onComplete", async () => {
    googleMock = {
      models: {
        generateContent: vi.fn().mockResolvedValue({}),
        generateContentStream: vi.fn(),
      },
    };
    const callbacks = buildCallbacks();
    await callGoogle(
      buildSettings("google"),
      {
        provider: "google",
        model: "gemini-3-flash",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: false },
      },
      callbacks,
    );
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "",
      finishReason: "stop",
    });
  });

  it("ストリーミング: 既定の maxOutputTokens=4000 / temperature=0.7 を渡す", async () => {
    const generateContentStream = vi.fn().mockResolvedValue(asyncGen<unknown>([]));
    googleMock = {
      models: { generateContent: vi.fn(), generateContentStream },
    };
    await callGoogle(
      buildSettings("google"),
      {
        provider: "google",
        model: "gemini-3-flash",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: true },
      },
      buildCallbacks(),
    );
    expect(generateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          maxOutputTokens: 4000,
          temperature: 0.7,
          tools: [{ googleSearch: {} }],
        }),
      }),
    );
  });

  it("ストリーミング: 文字列を蓄積し最終 onComplete を呼ぶ", async () => {
    const chunks = [{ text: "He" }, { text: "" }, { text: "llo" }];
    googleMock = {
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockResolvedValue(asyncGen(chunks)),
      },
    };
    const callbacks = buildCallbacks();
    await callGoogle(
      buildSettings("google"),
      {
        provider: "google",
        model: "gemini-3-flash",
        messages: [{ role: "user", content: "hi" }],
        options: { stream: true, useGoogleSearch: false, maxTokens: 1000 },
      },
      callbacks,
    );
    expect(callbacks.onChunk).toHaveBeenCalledTimes(2);
    expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, "He");
    expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, "llo");
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      content: "Hello",
      finishReason: "stop",
    });
  });

  it("ストリーミング: aborted のシグナルなら ABORTED で reject", async () => {
    googleMock = {
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockResolvedValue(asyncGen([{ text: "x" }, { text: "y" }])),
      },
    };
    const ac = new AbortController();
    ac.abort();
    await expect(
      callGoogle(
        buildSettings("google"),
        {
          provider: "google",
          model: "gemini-3-flash",
          messages: [{ role: "user", content: "hi" }],
          options: { stream: true },
        },
        buildCallbacks(),
        ac.signal,
      ),
    ).rejects.toThrow("ABORTED");
  });
});
