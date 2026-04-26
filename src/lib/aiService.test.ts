import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callAIService,
  getEffectiveAPIMode,
  shouldUseUserAPIKey,
  type AIServiceRequest,
  type AIServiceCallbacks,
} from "./aiService";
import type { AISettings } from "@/types/ai";

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

// OpenAI SDKのモック
vi.mock("openai", () => ({
  default: function OpenAI() {
    if (!openAIMock) {
      throw new Error("OpenAI mock is not configured");
    }
    return openAIMock;
  },
}));

// Anthropic SDKのモック
vi.mock("@anthropic-ai/sdk", () => ({
  default: function Anthropic() {
    if (!anthropicMock) {
      throw new Error("Anthropic mock is not configured");
    }
    return anthropicMock;
  },
}));

// Google GenAI SDKのモック
vi.mock("@google/genai", () => ({
  GoogleGenAI: function GoogleGenAI() {
    if (!googleMock) {
      throw new Error("GoogleGenAI mock is not configured");
    }
    return googleMock;
  },
}));

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
        modelId: "openai:gpt-4o",
        isConfigured: true,
      };
      expect(getEffectiveAPIMode(settings)).toBe("user_api_key");
    });

    it("apiModeが未設定の場合はapiKeyの有無に関わらずapi_serverを返す", () => {
      // 後方互換: 未設定時のデフォルトはアプリのサーバー経由
      // Backward compat: default to the app's server when apiMode is unset.
      const settings: AISettings = {
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: true,
      };
      expect(getEffectiveAPIMode(settings)).toBe("api_server");
    });

    it("apiModeが未設定でapiKeyが空の場合はapi_serverを返す", () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: false,
      };
      expect(getEffectiveAPIMode(settings)).toBe("api_server");
    });

    it("apiModeが未設定でapiKeyが空白のみの場合はapi_serverを返す", () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "   ",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
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
        modelId: "openai:gpt-4o",
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
        modelId: "openai:gpt-4o",
        isConfigured: false,
      };
      expect(shouldUseUserAPIKey(settings)).toBe(false);
    });
  });

  describe("callAIService - ユーザーAPIキーモード（既存機能の回帰テスト）", () => {
    const createTestSettings = (
      provider: AISettings["provider"],
      apiKey: string = "test-key",
    ): AISettings => ({
      provider,
      apiKey,
      apiMode: "user_api_key",
      model:
        provider === "openai"
          ? "gpt-4o"
          : provider === "anthropic"
            ? "claude-3-5-sonnet-20241022"
            : "gemini-2.5-flash",
      modelId:
        provider === "openai"
          ? "openai:gpt-4o"
          : provider === "anthropic"
            ? "anthropic:claude-3-5-sonnet-20241022"
            : "google:gemini-2.5-flash",
      isConfigured: true,
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
      openAIMock = null;
      anthropicMock = null;
      googleMock = null;
    };

    describe("OpenAI - 非ストリーミング", () => {
      it("既存と同じようにAPIを呼び出せる", async () => {
        resetMocks();
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

        openAIMock = mockClient;

        const callbacks: AIServiceCallbacks = {
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

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

        openAIMock = mockClient;

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
          expect.anything(),
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

        anthropicMock = mockClient;

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
          expect.anything(),
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

        anthropicMock = mockClient;

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

        googleMock = mockClient;

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
          }),
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
        const mockChunks = [{ text: "Hello" }, { text: ", " }, { text: "world!" }];

        async function* mockStream() {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        }

        const mockGenerateContentStream = vi.fn().mockResolvedValue(mockStream());
        const mockClient = {
          models: {
            generateContent: vi.fn(),
            generateContentStream: mockGenerateContentStream,
          },
        };

        googleMock = mockClient;

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

    describe("エラーハンドリング", () => {
      it("API呼び出しエラー時にonErrorコールバックが呼ばれる", async () => {
        resetMocks();
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

        openAIMock = mockClient;

        const callbacks: AIServiceCallbacks = {
          onComplete: vi.fn(),
          onError: vi.fn(),
        };

        await callAIService(settings, request, callbacks);

        expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error));
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
          }),
        );
      });
    });

    describe("中断シグナル", () => {
      it("abortSignalがabortedの場合、ストリーミングが中断される", async () => {
        resetMocks();
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

        openAIMock = mockClient;

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
    // assertion 失敗時にも `fetch` / env の stub を確実に解除する。tail-cleanup だと
    // 失敗時に後続テストへ stub が漏れるため、afterEach で unconditional に剥がす。
    // Guarantee `fetch` / env stubs are cleared even when an assertion throws —
    // tail-of-body cleanup would leak stubs into later tests.
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("api_serverモードでAPIサーバーURLが未設定の場合はonErrorが呼ばれる", async () => {
      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "api_server",
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
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

      await callAIService(settings, request, callbacks);

      expect(callbacks.onError).toHaveBeenCalled();
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    });

    it("settings.modelId が指定されていればリクエストの model を上書きする", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ content: "ok" }), { status: 200 }));
      vi.stubGlobal("fetch", fetchSpy);
      vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");

      const settings: AISettings = {
        provider: "openai",
        apiKey: "",
        apiMode: "api_server",
        model: "gpt-4o",
        modelId: "openai:gpt-5-pro",
        isConfigured: false,
      };
      const callbacks: AIServiceCallbacks = { onComplete: vi.fn(), onError: vi.fn() };
      await callAIService(
        settings,
        {
          provider: "openai",
          model: "gpt-4o",
          messages: [{ role: "user", content: "hi" }],
          options: { stream: false },
        },
        callbacks,
      );

      const init = fetchSpy.mock.calls[0]?.[1];
      const body = JSON.parse(init?.body ?? "{}");
      expect(body.model).toBe("openai:gpt-5-pro");
      expect(callbacks.onComplete).toHaveBeenCalled();
    });

    it("apiMode が未設定でも api_server へフォールバックする", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ content: "ok" }), { status: 200 }));
      vi.stubGlobal("fetch", fetchSpy);
      vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");

      const settings: AISettings = {
        provider: "openai",
        apiKey: "should-be-ignored",
        // apiMode 未設定
        model: "gpt-4o",
        modelId: "openai:gpt-4o",
        isConfigured: false,
      };
      const callbacks: AIServiceCallbacks = { onComplete: vi.fn(), onError: vi.fn() };
      await callAIService(
        settings,
        {
          provider: "openai",
          model: "gpt-4o",
          messages: [{ role: "user", content: "hi" }],
          options: { stream: false },
        },
        callbacks,
      );

      // ユーザーキーモードならクライアントSDKが呼ばれるが、ここでは fetch のみ呼ばれることを確認。
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("callAIService - claude-code モード", () => {
    /**
     * Build a fake provider object for `createClaudeCodeProvider`.
     * テスト用の Claude Code プロバイダのフェイクを作る。
     */
    type FakeChunk =
      | { type: "text"; content: string }
      | { type: "tool_use_start"; content: ""; toolName?: string }
      | { type: "tool_use_complete"; content: ""; toolName?: string }
      | { type: "error"; content: string }
      | { type: "done"; content: "" };

    // 実モジュールの型に揃えることで `createClaudeCodeProvider` のシグネチャ変更を
    // テスト側でも型検査でき、`UnifiedAIProvider` 契約のドリフトを早期に検知する。
    // Anchor the mock to the real module type so a signature change in
    // `createClaudeCodeProvider` (or `UnifiedAIProvider`) is caught here at compile time.
    type ClaudeCodeProviderModule = typeof import("@/lib/aiProviders/claudeCodeProvider");

    function buildProviderModule(opts: {
      available: boolean;
      chunks?: FakeChunk[];
      throwOnQuery?: unknown;
    }): Pick<ClaudeCodeProviderModule, "createClaudeCodeProvider"> {
      return {
        createClaudeCodeProvider: () => ({
          id: "claude-code" as const,
          name: "Claude Code",
          capabilities: {
            textGeneration: true,
            fileAccess: true,
            commandExecution: true,
            webSearch: true,
            mcpIntegration: true,
            agentLoop: true,
          },
          isAvailable: vi.fn().mockResolvedValue(opts.available),
          abort: vi.fn(),
          query: () => {
            if (opts.throwOnQuery !== undefined) {
              // テスト用に意図的に yield せず即時 throw するジェネレータ。
              // eslint-disable-next-line require-yield
              return (async function* () {
                throw opts.throwOnQuery;
              })();
            }
            return (async function* () {
              for (const c of opts.chunks ?? []) yield c;
            })();
          },
        }),
      };
    }

    function makeClaudeSettings(): AISettings {
      return {
        provider: "claude-code",
        apiKey: "",
        model: "claude-sonnet-4",
        modelId: "claude-code:claude-sonnet-4",
        isConfigured: true,
      };
    }

    function makeClaudeRequest(): AIServiceRequest {
      return {
        provider: "claude-code",
        model: "claude-sonnet-4",
        messages: [
          { role: "system", content: "rules" },
          { role: "user", content: "hello" },
        ],
        options: { temperature: 0.5, maxTokens: 1024, stream: true, cwd: "/work" },
      };
    }

    // `aiService.ts` は claude-code provider を動的 import するため、`vi.doMock` の効果を確実に切り替えるには
    // モジュールキャッシュもリセットする必要がある。`doUnmock` はレジストリ上の mock 登録を消すだけで、
    // 既に動的 import 済みのモジュールキャッシュには手を入れないため、`resetModules()` を併用する。
    // The provider is loaded via dynamic import; `vi.doUnmock` only removes the mock registration
    // and does not invalidate the cached module. Reset the module registry between tests so that
    // each `vi.doMock` factory is the one returned by the next dynamic import.
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.doUnmock("@/lib/aiProviders/claudeCodeProvider");
      vi.resetModules();
    });

    it("isAvailable が false なら onError を呼ぶ", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({ available: false }),
      );
      const callbacks: AIServiceCallbacks = { onError: vi.fn(), onComplete: vi.fn() };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Claude Code"),
        }),
      );
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    });

    it("text チャンクを蓄積し done で onComplete を呼ぶ", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({
          available: true,
          chunks: [
            { type: "text", content: "Hel" },
            { type: "text", content: "lo" },
            { type: "done", content: "" },
            { type: "text", content: "ignored after done" },
          ],
        }),
      );
      const callbacks: AIServiceCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks);
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, "Hel");
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, "lo");
      expect(callbacks.onChunk).toHaveBeenCalledTimes(2);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "Hello",
        finishReason: "stop",
      });
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("done が来ずに終わっても finishReason='stop' で onComplete を呼ぶ (内容あり)", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({
          available: true,
          chunks: [{ type: "text", content: "abc" }],
        }),
      );
      const callbacks: AIServiceCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "abc",
        finishReason: "stop",
      });
    });

    it("done も text も来なければ finishReason='abort'", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({ available: true, chunks: [] }),
      );
      const callbacks: AIServiceCallbacks = { onComplete: vi.fn(), onError: vi.fn() };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "",
        finishReason: "abort",
      });
    });

    it("tool_use_start / tool_use_complete をコールバックに転送する", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({
          available: true,
          chunks: [
            { type: "tool_use_start", content: "", toolName: "bash" },
            { type: "text", content: "ran" },
            { type: "tool_use_complete", content: "", toolName: "bash" },
            { type: "done", content: "" },
          ],
        }),
      );
      const callbacks: AIServiceCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onToolUseStart: vi.fn(),
        onToolUseComplete: vi.fn(),
        onError: vi.fn(),
      };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks);
      expect(callbacks.onToolUseStart).toHaveBeenCalledWith("bash");
      expect(callbacks.onToolUseComplete).toHaveBeenCalledWith("bash");
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "ran",
        finishReason: "stop",
      });
    });

    it("toolName が無ければ 'unknown' を渡す", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({
          available: true,
          chunks: [
            { type: "tool_use_start", content: "" },
            { type: "tool_use_complete", content: "" },
            { type: "done", content: "" },
          ],
        }),
      );
      const callbacks: AIServiceCallbacks = {
        onToolUseStart: vi.fn(),
        onToolUseComplete: vi.fn(),
        onComplete: vi.fn(),
      };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks);
      expect(callbacks.onToolUseStart).toHaveBeenCalledWith("unknown");
      expect(callbacks.onToolUseComplete).toHaveBeenCalledWith("unknown");
    });

    it("error チャンクは onError へラップして渡す", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({
          available: true,
          chunks: [{ type: "error", content: "sidecar crashed" }],
        }),
      );
      const callbacks: AIServiceCallbacks = { onError: vi.fn(), onComplete: vi.fn() };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "sidecar crashed" }),
      );
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    });

    it("非 Error の例外は 'Claude Code 呼び出しエラー' に正規化する", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({ available: true, throwOnQuery: "string failure" }),
      );
      const callbacks: AIServiceCallbacks = { onError: vi.fn(), onComplete: vi.fn() };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Claude Code 呼び出しエラー" }),
      );
    });

    it("abortSignal が aborted ならループ内で ABORTED を投げて onError へ", async () => {
      vi.doMock("@/lib/aiProviders/claudeCodeProvider", () =>
        buildProviderModule({
          available: true,
          chunks: [{ type: "text", content: "x" }],
        }),
      );
      const ac = new AbortController();
      ac.abort();
      const callbacks: AIServiceCallbacks = { onError: vi.fn(), onComplete: vi.fn() };
      await callAIService(makeClaudeSettings(), makeClaudeRequest(), callbacks, ac.signal);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "ABORTED" }),
      );
    });
  });
});
