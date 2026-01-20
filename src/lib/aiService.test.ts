import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callAIService,
  getEffectiveAPIMode,
  shouldUseUserAPIKey,
  type AIServiceRequest,
  type AIServiceCallbacks,
} from "./aiService";
import type { AISettings } from "@/types/ai";

// OpenAI SDKのモック
vi.mock("openai", () => ({
  default: vi.fn(),
}));

// Anthropic SDKのモック
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(),
}));

// Google GenAI SDKのモック
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(),
}));

// OllamaClientのモック
vi.mock("./aiClient", async () => {
  const actual = await vi.importActual<typeof import("./aiClient")>("./aiClient");
  return {
    ...actual,
    OllamaClient: vi.fn(),
  };
});

describe("aiService - 回帰テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getEffectiveAPIMode - 後方互換性", () => {
    it("apiModeが設定されている場合はその値を返す", () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-key",
        apiMode: "user_api_key",
        model: "gpt-4o",
        isConfigured: true,
      };
      expect(getEffectiveAPIMode(settings)).toBe("user_api_key");
    });

    it("apiModeが未設定でapiKeyがある場合はuser_api_keyを返す", () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o",
        isConfigured: true,
      };
      expect(getEffectiveAPIMode(settings)).toBe("user_api_key");
    });

    it("apiModeが未設定でapiKeyが空の場合はapi_serverを返す", () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        model: "gpt-4o",
        isConfigured: false,
      };
      expect(getEffectiveAPIMode(settings)).toBe("api_server");
    });

    it("apiModeが未設定でapiKeyが空白のみの場合はapi_serverを返す", () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "   ",
        model: "gpt-4o",
        isConfigured: false,
      };
      expect(getEffectiveAPIMode(settings)).toBe("api_server");
    });
  });

  describe("shouldUseUserAPIKey", () => {
    it("user_api_keyモードの場合はtrueを返す", () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-key",
        apiMode: "user_api_key",
        model: "gpt-4o",
        isConfigured: true,
      };
      expect(shouldUseUserAPIKey(settings)).toBe(true);
    });

    it("api_serverモードの場合はfalseを返す", () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "api_server",
        model: "gpt-4o",
        isConfigured: false,
      };
      expect(shouldUseUserAPIKey(settings)).toBe(false);
    });
  });

  describe("callAIService - ユーザーAPIキーモード（既存機能の回帰テスト）", () => {
    const createTestSettings = (
      provider: AISettings["provider"],
      apiKey: string = "test-key"
    ): AISettings => ({
      provider,
      apiKey,
      apiMode: "user_api_key",
      model: provider === "openai" ? "gpt-4o" : provider === "anthropic" ? "claude-3-5-sonnet-20241022" : provider === "google" ? "gemini-2.0-flash-exp" : "qwen2.5:7b",
      isConfigured: true,
      ollamaEndpoint: provider === "ollama" ? "http://localhost:11434" : undefined,
    });

    const createTestRequest = (): AIServiceRequest => ({
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
      options: {
        temperature: 0.7,
        maxTokens: 100,
        stream: false,
      },
    });

    // モックのリセット用ヘルパー
    const resetMocks = () => {
      vi.clearAllMocks();
    };

    describe("OpenAI - 非ストリーミング", () => {
      it("既存と同じようにAPIを呼び出せる", async () => {
        resetMocks();
        const OpenAI = (await import("openai")).default;
        const settings = createTestSettings("openai");
        const request = createTestRequest();
        const mockResponse = {
          choices: [
            {
              message: { content: "Hello, world!" },
              finish_reason: "stop",
            },
          ],
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);
        const mockClient = {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        };

        // OpenAIコンストラクタをモック
        vi.mocked(OpenAI).mockImplementation(() => mockClient as any);

        const callbacks: AIServiceCallbacks = {
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        // OpenAIコンストラクタが呼ばれたことを確認
        expect(OpenAI).toHaveBeenCalledWith({
          apiKey: "test-key",
          dangerouslyAllowBrowser: true,
        });

        // APIが呼ばれたことを確認
        expect(mockCreate).toHaveBeenCalled();

        // コールバックが正しく呼ばれたことを確認
        expect(callbacks.onComplete).toHaveBeenCalledWith({
          content: "Hello, world!",
          finishReason: "stop",
        });
        expect(callbacks.onError).not.toHaveBeenCalled();
      });
    });

    describe("OpenAI - ストリーミング", () => {
      it("既存と同じようにストリーミングAPIを呼び出せる", async () => {
        const { default: OpenAI } = await import("openai");
        const settings = createTestSettings("openai");
        const request: AIServiceRequest = {
          ...createTestRequest(),
          options: { ...createTestRequest().options, stream: true },
        };

        // ストリーミングレスポンスのモック
        const mockChunks = [
          { choices: [{ delta: { content: "Hello" } }] },
          { choices: [{ delta: { content: ", " } }] },
          { choices: [{ delta: { content: "world!" } }] },
        ];

        async function* mockStream() {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        }

        const mockCreate = vi.fn().mockResolvedValue(mockStream());
        const mockClient = {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        };

        vi.mocked(OpenAI).mockImplementation(() => mockClient as any);

        const callbacks: AIServiceCallbacks = {
          onChunk: vi.fn(),
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            stream: true,
          }),
          expect.anything()
        );

        expect(callbacks.onChunk).toHaveBeenCalledTimes(3);
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, "Hello");
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, ", ");
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(3, "world!");

        expect(callbacks.onComplete).toHaveBeenCalledWith({
          content: "Hello, world!",
          finishReason: "stop",
        });
        expect(callbacks.onError).not.toHaveBeenCalled();
      });
    });

    describe("Anthropic - 非ストリーミング", () => {
      it("既存と同じようにAPIを呼び出せる", async () => {
        resetMocks();
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const settings = createTestSettings("anthropic");
        const request: AIServiceRequest = {
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
          options: {
            temperature: 0.7,
            maxTokens: 100,
            stream: false,
          },
        };

        const mockResponse = {
          id: "test-id",
          content: [{ type: "text" as const, text: "Hello, world!" }],
          stop_reason: "end_turn",
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);
        const mockClient = {
          messages: {
            create: mockCreate,
            stream: vi.fn(),
          },
        };

        vi.mocked(Anthropic).mockImplementation(() => mockClient as any);

        const callbacks: AIServiceCallbacks = {
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            model: "claude-3-5-sonnet-20241022",
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 100,
          }),
          expect.anything()
        );

        expect(callbacks.onComplete).toHaveBeenCalledWith({
          content: "Hello, world!",
          finishReason: "end_turn",
        });
        expect(callbacks.onError).not.toHaveBeenCalled();
      });
    });

    describe("Anthropic - ストリーミング", () => {
      it("既存と同じようにストリーミングAPIを呼び出せる", async () => {
        resetMocks();
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const settings = createTestSettings("anthropic");
        const request: AIServiceRequest = {
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
          options: {
            stream: true,
          },
        };

        // ストリーミングイベントのモック
        const mockEvents = [
          {
            type: "content_block_delta" as const,
            delta: { type: "text_delta" as const, text: "Hello" },
          },
          {
            type: "content_block_delta" as const,
            delta: { type: "text_delta" as const, text: ", " },
          },
          {
            type: "content_block_delta" as const,
            delta: { type: "text_delta" as const, text: "world!" },
          },
        ];

        async function* mockStream() {
          for (const event of mockEvents) {
            yield event;
          }
        }

        const mockStreamFn = vi.fn().mockReturnValue(mockStream());
        const mockClient = {
          messages: {
            create: vi.fn(),
            stream: mockStreamFn,
          },
        };

        vi.mocked(Anthropic).mockImplementation(() => mockClient as any);

        const callbacks: AIServiceCallbacks = {
          onChunk: vi.fn(),
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(callbacks.onChunk).toHaveBeenCalledTimes(3);
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, "Hello");
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, ", ");
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(3, "world!");

        expect(callbacks.onComplete).toHaveBeenCalledWith({
          content: "Hello, world!",
          finishReason: "stop",
        });
        expect(callbacks.onError).not.toHaveBeenCalled();
      });
    });

    describe("Google - 非ストリーミング", () => {
      it("既存と同じようにAPIを呼び出せる", async () => {
        resetMocks();
        const { GoogleGenAI } = await import("@google/genai");
        const settings = createTestSettings("google");
        const request: AIServiceRequest = {
          provider: "google",
          model: "gemini-2.0-flash-exp",
          messages: [{ role: "user", content: "Hello" }],
          options: {
            temperature: 0.7,
            maxTokens: 100,
            stream: false,
          },
        };

        const mockResponse = {
          text: "Hello, world!",
        };

        const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
        const mockClient = {
          models: {
            generateContent: mockGenerateContent,
            generateContentStream: vi.fn(),
          },
        };

        (GoogleGenAI as any).mockImplementation(() => mockClient);

        const callbacks: AIServiceCallbacks = {
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(mockGenerateContent).toHaveBeenCalledWith(
          expect.objectContaining({
            model: "gemini-2.0-flash-exp",
            contents: "Hello",
            config: expect.objectContaining({
              temperature: 0.7,
            }),
          })
        );

        expect(callbacks.onComplete).toHaveBeenCalledWith({
          content: "Hello, world!",
          finishReason: "stop",
        });
        expect(callbacks.onError).not.toHaveBeenCalled();
      });
    });

    describe("Google - ストリーミング", () => {
      it("既存と同じようにストリーミングAPIを呼び出せる", async () => {
        resetMocks();
        const { GoogleGenAI } = await import("@google/genai");
        const settings = createTestSettings("google");
        const request: AIServiceRequest = {
          provider: "google",
          model: "gemini-2.0-flash-exp",
          messages: [{ role: "user", content: "Hello" }],
          options: {
            stream: true,
          },
        };

        // ストリーミングチャンクのモック
        const mockChunks = [
          { text: "Hello" },
          { text: ", " },
          { text: "world!" },
        ];

        async function* mockStream() {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        }

        const mockGenerateContentStream = vi
          .fn()
          .mockResolvedValue(mockStream());
        const mockClient = {
          models: {
            generateContent: vi.fn(),
            generateContentStream: mockGenerateContentStream,
          },
        };

        (GoogleGenAI as any).mockImplementation(() => mockClient);

        const callbacks: AIServiceCallbacks = {
          onChunk: vi.fn(),
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(callbacks.onChunk).toHaveBeenCalledTimes(3);
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, "Hello");
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, ", ");
        expect(callbacks.onChunk).toHaveBeenNthCalledWith(3, "world!");

        expect(callbacks.onComplete).toHaveBeenCalledWith({
          content: "Hello, world!",
          finishReason: "stop",
        });
        expect(callbacks.onError).not.toHaveBeenCalled();
      });
    });

    describe("Ollama", () => {
      it("既存と同じようにAPIを呼び出せる", async () => {
        resetMocks();
        const { OllamaClient } = await import("./aiClient");
        const settings = createTestSettings("ollama", "");
        const request: AIServiceRequest = {
          provider: "ollama",
          model: "qwen2.5:7b",
          messages: [{ role: "user", content: "Hello" }],
          options: {
            temperature: 0.7,
            maxTokens: 100,
          },
        };

        const mockResponse = "Hello, world!";

        const mockChat = vi.fn().mockResolvedValue(mockResponse);
        const mockClient = {
          chat: mockChat,
        };

        vi.mocked(OllamaClient).mockImplementation(() => mockClient as any);

        const callbacks: AIServiceCallbacks = {
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(mockChat).toHaveBeenCalledWith(
          "qwen2.5:7b",
          [{ role: "user", content: "Hello" }],
          {
            temperature: 0.7,
            maxTokens: 100,
          }
        );

        expect(callbacks.onComplete).toHaveBeenCalledWith({
          content: "Hello, world!",
          finishReason: "stop",
        });
        expect(callbacks.onError).not.toHaveBeenCalled();
      });
    });

    describe("エラーハンドリング", () => {
      it("API呼び出しエラー時にonErrorコールバックが呼ばれる", async () => {
        resetMocks();
        const OpenAI = (await import("openai")).default;
        const settings = createTestSettings("openai");
        const request = createTestRequest();

        const mockCreate = vi.fn().mockRejectedValue(new Error("API Error"));
        const mockClient = {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        };

        vi.mocked(OpenAI).mockImplementation(() => mockClient as any);

        const callbacks: AIServiceCallbacks = {
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.any(Error)
        );
        expect(callbacks.onComplete).not.toHaveBeenCalled();
      });

      it("不明なプロバイダーでエラーが発生する", async () => {
        const settings = {
          ...createTestSettings("openai"),
          provider: "unknown" as AISettings["provider"],
        };
        const request = createTestRequest();

        const callbacks: AIServiceCallbacks = {
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining("Unknown provider"),
          })
        );
      });
    });

    describe("中断シグナル", () => {
      it("abortSignalがabortedの場合、ストリーミングが中断される", async () => {
        resetMocks();
        const OpenAI = (await import("openai")).default;
        const settings = createTestSettings("openai");
        const request: AIServiceRequest = {
          ...createTestRequest(),
          options: { ...createTestRequest().options, stream: true },
        };

        const abortController = new AbortController();
        abortController.abort();

        // ストリーミングレスポンスのモック
        async function* mockStream() {
          yield { choices: [{ delta: { content: "Hello" } }] };
          throw new Error("ABORTED");
        }

        const mockCreate = vi.fn().mockResolvedValue(mockStream());
        const mockClient = {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        };

        vi.mocked(OpenAI).mockImplementation(() => mockClient as any);

        const callbacks: AIServiceCallbacks = {
          onChunk: vi.fn(),
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks, abortController.signal);

        // 中断された場合はonErrorが呼ばれるか、またはonCompleteが呼ばれない
        // 実装によって異なるが、エラーが適切に処理されることを確認
        expect(callbacks.onError).toHaveBeenCalled();
      });
    });
  });

  describe("callAIService - APIサーバー経由モード", () => {
    it("api_serverモードの場合はエラーを投げる（Phase 2で実装予定）", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "api_server",
        model: "gpt-4o",
        isConfigured: false,
      };

      const request: AIServiceRequest = {
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        options: {
          temperature: 0.7,
          maxTokens: 100,
          stream: false,
        },
      };

      const callbacks: AIServiceCallbacks = {
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await expect(
        callAIService(settings, request, callbacks)
      ).rejects.toThrow("APIサーバー経由モードはまだ実装されていません");
    });
  });
});
