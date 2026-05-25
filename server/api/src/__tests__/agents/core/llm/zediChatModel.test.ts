/**
 * `ZediChatModel` のテスト。mock provider を注入し、`/api/ai/chat` と同じ usage
 * 記録経路を通っていることを確認する。`recordUsage` 自体は `usageService.test.ts`
 * 側で検証済みなので、本ファイルでは DB チェーンの呼び出し回数・cost 計算結果を
 * 主に見る。
 *
 * Tests for {@link ZediChatModel}. Injects fake `callProvider` / `streamProvider`
 * and asserts (1) the provider was called with the converted message shape,
 * (2) `recordUsage` is invoked exactly once per call, (3) the LangChain
 * `_generate` / `_streamResponseChunks` outputs surface usage metadata.
 */
import { describe, it, expect } from "vitest";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { ZediChatModel } from "../../../../agents/core/llm/zediChatModel.js";
import { createMockDb } from "../../../createMockDb.js";
import type {
  AIChatOptions,
  AIMessage as ZediAIMessage,
  AIProviderType,
  Database,
} from "../../../../types/index.js";

function asDb(results: unknown[]) {
  const { db, chains } = createMockDb(results);
  return { db: db as unknown as Database, chains };
}

interface CallSpy {
  provider: AIProviderType;
  apiKey: string;
  model: string;
  messages: ZediAIMessage[];
  options: AIChatOptions;
}

function buildModel(
  callResult: {
    content: string;
    usage: { inputTokens: number; outputTokens: number };
    finishReason: string;
  },
  spy: { calls: CallSpy[] },
) {
  const { db, chains } = asDb([undefined, undefined]);
  const model = new ZediChatModel({
    provider: "openai",
    apiKey: "test-key",
    apiModelId: "gpt-test",
    modelRowId: "model-1",
    inputCostUnits: 10,
    outputCostUnits: 30,
    userId: "user-1",
    tier: "free",
    db,
    feature: "wiki_compose:test",
    callProvider: async (provider, apiKey, model, messages, options = {}) => {
      spy.calls.push({ provider, apiKey, model, messages, options });
      return callResult;
    },
    streamProvider: async function* () {
      // Unused in non-streaming tests.
    },
  });
  return { model, db, chains };
}

describe("ZediChatModel._generate", () => {
  it("calls the injected provider with converted messages and records usage", async () => {
    const spy = { calls: [] as CallSpy[] };
    const { model, chains } = buildModel(
      {
        content: "Hello, world!",
        usage: { inputTokens: 100, outputTokens: 50 },
        finishReason: "stop",
      },
      spy,
    );

    const result = await model.invoke([new SystemMessage("Be concise."), new HumanMessage("Hi")]);

    // Provider called exactly once with converted role/content.
    // プロバイダは 1 回だけ呼ばれ、role と content が変換済みである。
    expect(spy.calls).toHaveLength(1);
    const call = spy.calls[0];
    expect(call?.provider).toBe("openai");
    expect(call?.model).toBe("gpt-test");
    expect(call?.messages).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "Hi" },
    ]);

    // usage was persisted: insert(aiUsageLogs) + insert(aiMonthlyUsage upsert).
    // usage 記録 (aiUsageLogs + aiMonthlyUsage の 2 チェーン) が走っている。
    expect(chains.length).toBe(2);
    expect(chains[0]?.startMethod).toBe("insert");
    expect(chains[1]?.startMethod).toBe("insert");

    const valuesArg = chains[0]?.ops.find((op) => op.method === "values")?.args[0] as
      | Record<string, unknown>
      | undefined;
    expect(valuesArg?.modelId).toBe("model-1");
    expect(valuesArg?.feature).toBe("wiki_compose:test");
    expect(valuesArg?.inputTokens).toBe(100);
    expect(valuesArg?.outputTokens).toBe(50);
    // calculateCost: (100/1000)*10 + (50/1000)*30 = 1 + 1.5 = 2.5 → ceil → 3
    expect(valuesArg?.costUnits).toBe(3);
    expect(valuesArg?.apiMode).toBe("system");

    // LangChain message exposes usage in response_metadata.
    // LangChain メッセージ側にも usage 情報が乗る。
    expect(result.content).toBe("Hello, world!");
    expect(result.response_metadata?.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      costUnits: 3,
    });
  });

  it("treats AI messages as 'assistant' role when converting", async () => {
    const spy = { calls: [] as CallSpy[] };
    const { model } = buildModel(
      {
        content: "next",
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: "stop",
      },
      spy,
    );

    await model.invoke([new HumanMessage("Q1"), new AIMessage("A1"), new HumanMessage("Q2")]);

    expect(spy.calls[0]?.messages).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
    ]);
  });

  it("uses 'user_key' apiMode when constructed with apiMode='user_key' (BYOK forward-compat)", async () => {
    const spy = { calls: [] as CallSpy[] };
    const { db, chains } = asDb([undefined, undefined]);
    const model = new ZediChatModel({
      provider: "anthropic",
      apiKey: "byok-key",
      apiModelId: "claude-test",
      modelRowId: "model-2",
      inputCostUnits: 20,
      outputCostUnits: 60,
      userId: "u",
      tier: "pro",
      db,
      feature: "wiki_compose:byok",
      apiMode: "user_key",
      callProvider: async (provider, apiKey, model, messages, options = {}) => {
        spy.calls.push({ provider, apiKey, model, messages, options });
        return {
          content: "ok",
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: "stop",
        };
      },
      streamProvider: async function* () {},
    });
    void db;

    await model.invoke([new HumanMessage("hi")]);

    const valuesArg = chains[0]?.ops.find((op) => op.method === "values")?.args[0] as
      | Record<string, unknown>
      | undefined;
    expect(valuesArg?.apiMode).toBe("user_key");
  });
});

describe("ZediChatModel._streamResponseChunks", () => {
  it("streams provider chunks and records usage with chars/4 fallback", async () => {
    const { db, chains } = asDb([undefined, undefined]);
    const model = new ZediChatModel({
      provider: "google",
      apiKey: "k",
      apiModelId: "gemini-test",
      modelRowId: "model-3",
      inputCostUnits: 1,
      outputCostUnits: 2,
      userId: "user-x",
      tier: "free",
      db,
      feature: "wiki_compose:stream",
      callProvider: async () => ({
        content: "",
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: "stop",
      }),
      streamProvider: async function* () {
        yield { content: "Hello, " };
        yield { content: "world!" };
        yield { done: true, finishReason: "stop" };
      },
    });

    const stream = await model.stream([new HumanMessage("Tell me a story")]);
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk.content === "string" ? chunk.content : "");
    }

    // Provider emitted two text chunks → those surface to the caller plus a
    // final "" chunk that carries aggregated usage_metadata.
    // プロバイダの 2 件のテキストチャンクが届き、最後に空 content + usage チャンクが届く。
    expect(chunks).toEqual(["Hello, ", "world!", ""]);

    // Usage was recorded with the chars/4 estimator.
    // chars/4 推定で usage 記録が走る。
    expect(chains.length).toBe(2);
    const valuesArg = chains[0]?.ops.find((op) => op.method === "values")?.args[0] as
      | Record<string, unknown>
      | undefined;

    // prompt: "Tell me a story" = 15 chars → ceil(15/4) = 4
    // response: "Hello, world!" = 13 chars → ceil(13/4) = 4
    expect(valuesArg?.inputTokens).toBe(4);
    expect(valuesArg?.outputTokens).toBe(4);
    // (4/1000)*1 + (4/1000)*2 = 0.012 → ceil → 1
    expect(valuesArg?.costUnits).toBe(1);
  });

  it("uses 'incomplete' finishReason when the provider stream ends without done=true", async () => {
    const { db, chains } = asDb([undefined, undefined]);
    const model = new ZediChatModel({
      provider: "openai",
      apiKey: "k",
      apiModelId: "m",
      modelRowId: "m",
      inputCostUnits: 0,
      outputCostUnits: 0,
      userId: "u",
      tier: "free",
      db,
      feature: "x",
      streamProvider: async function* () {
        yield { content: "partial" };
        // No done chunk before generator returns.
      },
    });

    const lastChunks: unknown[] = [];
    const stream = await model.stream([new HumanMessage("hi")]);
    for await (const chunk of stream) lastChunks.push(chunk);
    const last = lastChunks[lastChunks.length - 1] as {
      response_metadata?: { finishReason?: string };
    };
    expect(last.response_metadata?.finishReason).toBe("incomplete");
    expect(chains.length).toBe(0);
  });

  it("does not record usage when the provider stream throws", async () => {
    const { db, chains } = asDb([undefined, undefined]);
    const model = new ZediChatModel({
      provider: "openai",
      apiKey: "k",
      apiModelId: "m",
      modelRowId: "m",
      inputCostUnits: 1,
      outputCostUnits: 2,
      userId: "u",
      tier: "free",
      db,
      feature: "x",
      streamProvider: async function* () {
        yield { content: "partial" };
        throw new Error("provider 502");
      },
    });

    const stream = await model.stream([new HumanMessage("hi")]);
    await expect(async () => {
      for await (const _chunk of stream) {
        /* drain */
      }
    }).rejects.toThrow("provider 502");
    expect(chains.length).toBe(0);
  });
});

describe("ZediChatModel._llmType", () => {
  it("identifies the model family as 'zedi-chat'", () => {
    const spy = { calls: [] as CallSpy[] };
    const { model } = buildModel(
      { content: "", usage: { inputTokens: 0, outputTokens: 0 }, finishReason: "stop" },
      spy,
    );
    expect(model._llmType()).toBe("zedi-chat");
  });
});
