/**
 * aiProviders.ts のテスト（OpenAI / Anthropic / Google の call と stream、SSE パーサ）。
 * Tests for the AI provider wrappers (call + stream) and SSE parsing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callOpenAI,
  callAnthropic,
  callGoogle,
  streamOpenAI,
  streamAnthropic,
  streamGoogle,
  callProvider,
  streamProvider,
  getProviderApiKeyName,
} from "../../services/aiProviders.js";
import type { AIMessage } from "../../types/index.js";

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  fetchSpy.mockReset();
});

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(chunks: string[]): Response {
  // SSE ストリームを ReadableStream に詰めて返す。
  // Wrap pre-encoded SSE chunks in a ReadableStream<Uint8Array>.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const messages: AIMessage[] = [
  { role: "system", content: "Be concise." },
  { role: "user", content: "Hello" },
];

// ── getProviderApiKeyName ───────────────────────────────────────────────────

describe("getProviderApiKeyName", () => {
  it("maps each provider to the expected env var name", () => {
    expect(getProviderApiKeyName("openai")).toBe("OPENAI_API_KEY");
    expect(getProviderApiKeyName("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(getProviderApiKeyName("google")).toBe("GOOGLE_AI_API_KEY");
  });

  it("throws for an unknown provider", () => {
    expect(() => getProviderApiKeyName("bogus" as never)).toThrow(/unknown provider/i);
  });
});

// ── callOpenAI ──────────────────────────────────────────────────────────────

describe("callOpenAI", () => {
  it("returns mapped content and usage", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        choices: [{ message: { content: "Hi!" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }),
    );

    const result = await callOpenAI("k", "gpt-4o", messages);

    expect(result.content).toBe("Hi!");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
    expect(result.finishReason).toBe("stop");

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer k");
  });

  it("includes web_search_options when both flags are set", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        choices: [{ message: { content: "x" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      }),
    );

    await callOpenAI("k", "gpt-4o", messages, {
      useWebSearch: true,
      webSearchOptions: { search_context_size: "high" },
    });

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)) as {
      web_search_options?: Record<string, unknown>;
    };
    expect(body.web_search_options).toEqual({ search_context_size: "high" });
  });

  it("throws when API responds with non-200", async () => {
    fetchSpy.mockResolvedValue(new Response("rate limited", { status: 429 }));
    await expect(callOpenAI("k", "gpt-4o", messages)).rejects.toThrow(/429/);
  });

  it("returns empty content / 0 tokens when fields are missing", async () => {
    fetchSpy.mockResolvedValue(okJson({ choices: [], usage: undefined }));
    const result = await callOpenAI("k", "gpt-4o", messages);
    expect(result.content).toBe("");
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.finishReason).toBe("stop");
  });
});

// ── callAnthropic ───────────────────────────────────────────────────────────

describe("callAnthropic", () => {
  it("separates system messages and joins content blocks", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        content: [{ text: "Hi " }, { text: "there." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 12, output_tokens: 4 },
      }),
    );

    const result = await callAnthropic("k", "claude-3", messages);

    expect(result.content).toBe("Hi there.");
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
    expect(result.finishReason).toBe("end_turn");

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)) as {
      messages: Array<{ role: string; content: string }>;
      system?: string;
    };
    expect(body.system).toBe("Be concise.");
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("omits `system` field when no system messages are provided", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        content: [{ text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );

    await callAnthropic("k", "claude-3", [{ role: "user", content: "yo" }]);

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)) as {
      system?: string;
    };
    expect(body.system).toBeUndefined();
  });

  it("falls back to 'end_turn' when stop_reason is missing", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        content: [{ text: "ok" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );

    const result = await callAnthropic("k", "claude-3", messages);
    expect(result.finishReason).toBe("end_turn");
  });

  it("throws when API responds with non-200", async () => {
    fetchSpy.mockResolvedValue(new Response("err", { status: 500 }));
    await expect(callAnthropic("k", "claude-3", messages)).rejects.toThrow(/500/);
  });
});

// ── callGoogle ──────────────────────────────────────────────────────────────

describe("callGoogle", () => {
  it("converts assistant messages to 'model' role and extracts text", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        candidates: [
          { content: { parts: [{ text: "Hello " }, { text: "there!" }] }, finishReason: "STOP" },
        ],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      }),
    );

    const result = await callGoogle("k", "gemini-2.0", [
      { role: "system", content: "be helpful" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "earlier reply" },
    ]);

    expect(result.content).toBe("Hello there!");
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
    expect(result.finishReason).toBe("STOP");

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)) as {
      contents: Array<{ role: string }>;
      systemInstruction?: { parts: Array<{ text: string }> };
      tools?: unknown;
    };
    expect(body.contents.map((c) => c.role)).toEqual(["user", "model"]);
    expect(body.systemInstruction?.parts[0]?.text).toBe("be helpful");
    expect(body.tools).toBeUndefined();
  });

  it("includes googleSearch tool when useGoogleSearch is true", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
      }),
    );

    await callGoogle("k", "gemini-2.0", [{ role: "user", content: "x" }], {
      useGoogleSearch: true,
    });

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)) as {
      tools?: unknown[];
    };
    expect(body.tools).toEqual([{ googleSearch: {} }]);
  });

  it("throws on non-200", async () => {
    fetchSpy.mockResolvedValue(new Response("oops", { status: 503 }));
    await expect(callGoogle("k", "gemini-2.0", messages)).rejects.toThrow(/503/);
  });
});

// ── stream wrappers ─────────────────────────────────────────────────────────

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("streamOpenAI", () => {
  it("yields content chunks and a done chunk from SSE", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
      'data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n',
      "data: [DONE]\n",
    ];
    fetchSpy.mockResolvedValue(sseResponse(chunks));

    const events = await collect(streamOpenAI("k", "gpt-4o", messages));

    expect(events).toEqual([
      { content: "Hel" },
      { content: "lo" },
      { done: true, finishReason: "stop" },
    ]);
  });

  it("throws on non-200", async () => {
    fetchSpy.mockResolvedValue(new Response("err", { status: 500 }));
    await expect(collect(streamOpenAI("k", "gpt-4o", messages))).rejects.toThrow(/500/);
  });

  it("throws when response has no body", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(collect(streamOpenAI("k", "gpt-4o", messages))).rejects.toThrow(/no body/i);
  });
});

describe("streamAnthropic", () => {
  it("yields content_block_delta chunks and message_delta with stop_reason", async () => {
    const chunks = [
      'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n',
      'data: {"type":"content_block_delta","delta":{"text":" there"}}\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n',
    ];
    fetchSpy.mockResolvedValue(sseResponse(chunks));

    const events = await collect(streamAnthropic("k", "claude-3", messages));

    expect(events).toEqual([
      { content: "Hi" },
      { content: " there" },
      { done: true, finishReason: "end_turn" },
    ]);
  });
});

describe("streamGoogle", () => {
  it("yields text chunks and emits a done event when finishReason is STOP", async () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"He"}]}}]}\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"llo"}]}}]}\n',
      'data: {"candidates":[{"finishReason":"STOP"}]}\n',
    ];
    fetchSpy.mockResolvedValue(sseResponse(chunks));

    const events = await collect(streamGoogle("k", "gemini", messages));

    // 末尾 STOP 単独イベントは done として yield される。
    // The lone STOP frame is yielded as `done`.
    expect(events).toContainEqual({ content: "He" });
    expect(events).toContainEqual({ content: "llo" });
    expect(events).toContainEqual({ done: true, finishReason: "STOP" });
  });

  it("yields a done event with non-STOP finishReason when present", async () => {
    const chunks = ['data: {"candidates":[{"finishReason":"SAFETY"}]}\n'];
    fetchSpy.mockResolvedValue(sseResponse(chunks));

    const events = await collect(streamGoogle("k", "gemini", messages));
    expect(events).toContainEqual({ done: true, finishReason: "SAFETY" });
  });
});

// ── ディスパッチャー / Dispatchers ──────────────────────────────────────────

describe("callProvider / streamProvider dispatchers", () => {
  it("callProvider routes to the OpenAI wrapper", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        choices: [{ message: { content: "x" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      }),
    );

    const result = await callProvider("openai", "k", "gpt-4o", messages);
    expect(result.content).toBe("x");
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("api.openai.com");
  });

  it("callProvider throws for unknown providers", async () => {
    await expect(callProvider("nope" as never, "k", "m", messages)).rejects.toThrow(
      /unknown provider/i,
    );
  });

  it("streamProvider routes to the OpenAI streamer", async () => {
    const chunks = ['data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n'];
    fetchSpy.mockResolvedValue(sseResponse(chunks));

    const events = await collect(streamProvider("openai", "k", "gpt-4o", messages));
    expect(events).toContainEqual({ done: true, finishReason: "stop" });
  });

  it("streamProvider throws synchronously for unknown providers", () => {
    // streamProvider は同期的に switch で投げるので、generator を返す前に throw する。
    // streamProvider throws synchronously from the switch before returning a generator.
    expect(() => streamProvider("zzz" as never, "k", "m", messages)).toThrow(/unknown provider/i);
  });
});
