/**
 * Tests for AI service server-mode (SSE streaming) calls.
 * AI サービス（API サーバー経由・SSE）のテスト。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAIWithServer } from "./aiServiceServer";
import type { AIServiceRequest, AIServiceCallbacks } from "./aiService";

/**
 * Build a mock streaming Response whose body is a `ReadableStream<Uint8Array>`
 * fed by the chunks the test wants to deliver.
 * テストが指定したチャンク列を流す ReadableStream 入りのレスポンスを作る。
 */
function makeStreamingResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    statusText: status === 200 ? "OK" : `Status ${status}`,
  });
}

function buildRequest(overrides: Partial<AIServiceRequest> = {}): AIServiceRequest {
  return {
    provider: "openai",
    model: "gpt-5",
    messages: [{ role: "user", content: "hello" }],
    options: { stream: true, temperature: 0.5 },
    ...overrides,
  };
}

function buildCallbacks(): Required<
  Pick<AIServiceCallbacks, "onChunk" | "onComplete" | "onError" | "onUsageUpdate">
> {
  return {
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    onUsageUpdate: vi.fn(),
  };
}

describe("aiServiceServer / callAIWithServer", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("URL 設定", () => {
    it("VITE_API_BASE_URL 未設定時は onError(URLが設定されていません)", async () => {
      vi.stubEnv("VITE_API_BASE_URL", "");
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(callbacks.onError).toHaveBeenCalledTimes(1);
      const errArg = callbacks.onError.mock.calls[0][0] as Error;
      expect(errArg.message).toContain("URL");
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    });

    it("正しい URL/JSON ボディ/credentials で fetch される", async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ content: "ok", finishReason: "stop" }), { status: 200 }),
      );
      const request = buildRequest({ options: { stream: false } });
      await callAIWithServer(request, buildCallbacks());

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.example.com/api/ai/chat");
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("include");
      expect(init.headers).toEqual({ "Content-Type": "application/json" });
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        provider: "openai",
        model: "gpt-5",
        messages: [{ role: "user", content: "hello" }],
        options: { stream: false },
      });
    });
  });

  describe("HTTP ステータスマッピング", () => {
    it("401 は AUTH_REQUIRED として onError へ", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 401 }));
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "AUTH_REQUIRED" }),
      );
    });

    it("ボディに error フィールドがあればそのメッセージを使う", async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "rate limited" }),
      );
    });

    it("ボディが JSON でなければ statusText を使う", async () => {
      fetchSpy.mockResolvedValue(
        new Response("plain text", { status: 503, statusText: "Service Unavailable" }),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Service Unavailable" }),
      );
    });

    it("statusText も空ならフォールバック文字列を使う", async () => {
      fetchSpy.mockResolvedValue(new Response("plain text", { status: 500, statusText: "" }));
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "AI API呼び出しエラー" }),
      );
    });

    it("fetch 自体が reject したら onError(Error)", async () => {
      fetchSpy.mockRejectedValue(new Error("network down"));
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "network down" }),
      );
    });

    it("fetch が非 Error 値で reject しても汎用メッセージへ変換する", async () => {
      fetchSpy.mockRejectedValue("string failure");
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "AI API呼び出しエラー" }),
      );
    });
  });

  describe("非ストリーミング", () => {
    it("usage 付きレスポンスで onUsageUpdate と onComplete が呼ばれる", async () => {
      const usage = { inputTokens: 5, outputTokens: 8, costUnits: 1, usagePercent: 0.1 };
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ content: "Hello!", finishReason: "stop", usage }), {
          status: 200,
        }),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest({ options: { stream: false } }), callbacks);

      expect(callbacks.onUsageUpdate).toHaveBeenCalledWith(usage);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "Hello!",
        finishReason: "stop",
        usage,
      });
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("content 欠落時は空文字で onComplete が呼ばれる", async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ finishReason: "stop" }), { status: 200 }),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest({ options: { stream: false } }), callbacks);

      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "",
        finishReason: "stop",
        usage: undefined,
      });
    });

    it("usage が無ければ onUsageUpdate は呼ばれない", async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ content: "ok" }), { status: 200 }));
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest({ options: { stream: false } }), callbacks);
      expect(callbacks.onUsageUpdate).not.toHaveBeenCalled();
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "ok",
        finishReason: undefined,
        usage: undefined,
      });
    });
  });

  describe("ストリーミング (SSE)", () => {
    it("複数の data 行を順次 onChunk で受け取り、done で onComplete を呼ぶ", async () => {
      fetchSpy.mockResolvedValue(
        makeStreamingResponse([
          'data: {"content":"Hel"}\n',
          'data: {"content":"lo"}\n',
          'data: {"content":"!","done":true,"finishReason":"stop"}\n',
        ]),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);

      expect(callbacks.onChunk).toHaveBeenCalledTimes(3);
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, "Hel");
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, "lo");
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(3, "!");
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "Hello!",
        finishReason: "stop",
        usage: undefined,
      });
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("data: 以外の行はスキップする", async () => {
      fetchSpy.mockResolvedValue(
        makeStreamingResponse([
          ": comment\n",
          "event: ping\n",
          'data: {"content":"X","done":true,"finishReason":"stop"}\n',
        ]),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onChunk).toHaveBeenCalledTimes(1);
      expect(callbacks.onChunk).toHaveBeenCalledWith("X");
      expect(callbacks.onComplete).toHaveBeenCalled();
    });

    it("`data:` の後ろが空のペイロードはスキップする", async () => {
      fetchSpy.mockResolvedValue(
        makeStreamingResponse(["data:    \n", 'data: {"done":true,"finishReason":"stop"}\n']),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "",
        finishReason: "stop",
        usage: undefined,
      });
    });

    it("usage 含むイベントで onUsageUpdate と最終 onComplete が呼ばれる", async () => {
      const usage = { inputTokens: 1, outputTokens: 2, costUnits: 3, usagePercent: 0.4 };
      fetchSpy.mockResolvedValue(
        makeStreamingResponse([
          'data: {"content":"hi"}\n',
          `data: ${JSON.stringify({ usage })}\n`,
          'data: {"done":true,"finishReason":"stop"}\n',
        ]),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);

      expect(callbacks.onUsageUpdate).toHaveBeenCalledWith(usage);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "hi",
        finishReason: "stop",
        usage,
      });
    });

    it("チャンクを跨いで分割された行を再構築する", async () => {
      fetchSpy.mockResolvedValue(
        makeStreamingResponse([
          'data: {"content":"He',
          'llo"}\n',
          'data: {"done":true,"finishReason":"stop"}\n',
        ]),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onChunk).toHaveBeenCalledWith("Hello");
    });

    it("末尾改行なしの最終 data 行も処理する", async () => {
      fetchSpy.mockResolvedValue(
        makeStreamingResponse([
          'data: {"content":"a"}\n',
          'data: {"done":true,"finishReason":"stop"}',
        ]),
      );
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "a",
        finishReason: "stop",
        usage: undefined,
      });
    });

    it("done が来ずに切断されたが内容があれば onComplete を呼ぶ", async () => {
      fetchSpy.mockResolvedValue(makeStreamingResponse(['data: {"content":"partial"}\n']));
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: "partial",
        finishReason: undefined,
        usage: undefined,
      });
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("done が来ず内容も無ければ onError(空のまま切断)", async () => {
      fetchSpy.mockResolvedValue(makeStreamingResponse([": comment only\n"]));
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("空のまま") }),
      );
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    });

    it("data の error フィールドは onError へ", async () => {
      fetchSpy.mockResolvedValue(makeStreamingResponse(['data: {"error":"upstream failure"}\n']));
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "upstream failure" }),
      );
    });

    it("response.body が無ければ onError(取得できません)", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 200 }) as unknown as Response);
      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks);
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("取得できません") }),
      );
    });

    it("abortSignal が aborted なら ABORTED エラーを onError へ送る", async () => {
      const abortController = new AbortController();
      // 1 つ流したあとループの先頭で abort を検知させる。
      const encoder = new TextEncoder();
      let pulledOnce = false;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (!pulledOnce) {
            pulledOnce = true;
            controller.enqueue(encoder.encode('data: {"content":"a"}\n'));
            // 次の pull の前に abort
            // Abort before the next pull.
            abortController.abort();
            return;
          }
          controller.enqueue(encoder.encode(":\n"));
          controller.close();
        },
      });
      fetchSpy.mockResolvedValue(new Response(stream, { status: 200 }));

      const callbacks = buildCallbacks();
      await callAIWithServer(buildRequest(), callbacks, abortController.signal);

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "ABORTED" }),
      );
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    });
  });
});
