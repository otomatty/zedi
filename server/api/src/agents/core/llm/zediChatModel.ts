/**
 * `ZediChatModel` — LangGraph 経路で使う LangChain `BaseChatModel` 実装。
 *
 * `ZediChatModel` is the bridge between LangGraph and Zedi's existing
 * `aiProviders` + `usageService` stack. Every LLM call inside an agent goes
 * through this class so that:
 *
 * 1. `callProvider` / `streamProvider` (legacy) stays the single network
 *    boundary to OpenAI / Anthropic / Google; the LangGraph layer never holds
 *    a provider SDK directly.
 *    全 LLM 呼び出しは `callProvider` / `streamProvider` を通る。LangGraph 層は
 *    プロバイダ SDK を直接握らない。
 *
 * 2. `validateModelAccess` + `recordUsage` are invoked exactly once per call,
 *    matching the accounting behaviour of `/api/ai/chat` so monthly budgets
 *    and feature labels stay consistent.
 *    `/api/ai/chat` と同じく `validateModelAccess` / `recordUsage` を 1 呼び出し
 *    あたり 1 回ずつ通す。月次予算と feature ラベルの整合性を保証する。
 *
 * 3. P0 (#948) supports backend = `zedi_managed` only. BYOK arrives in #951;
 *    the constructor accepts an `apiKey` opaquely so the future path can
 *    inject user-supplied credentials without changing the class shape.
 *    P0 は backend = `zedi_managed` のみサポート。BYOK は #951 で対応するが、
 *    本クラスは `apiKey` を不透明に受け取る形にして将来差し替え可能にしてある。
 *
 * Note on streaming: `_streamResponseChunks` reuses `streamProvider` and
 * accumulates tokens locally. Usage is recorded after the stream ends with the
 * cheap `chars/4` token estimator, identical to `routes/ai/chat.ts`. The estimate
 * is intentionally not pre-billed before the call — we charge on the way out.
 *
 * @see {@link callProvider} / {@link streamProvider}
 * @see https://github.com/otomatty/zedi/issues/948
 */
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
  type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";
import type { Runnable } from "@langchain/core/runnables";
import { callProvider, streamProvider } from "../../../services/aiProviders.js";
import { calculateCost } from "../../../services/usageService.js";
import type {
  AIChatOptions,
  AIProviderType,
  ApiMode,
  Database,
  UserTier,
  ZediChatTool,
  ZediToolChoice,
} from "../../../types/index.js";
import { recordZediUsage, toZediMessages, type RecordZediUsageResult } from "./usageCallback.js";

/**
 * `callProvider` / `streamProvider` のインジェクション型。テストでは fake を
 * 渡し、本番では `aiProviders` から取得した関数をそのまま渡す。
 *
 * Pluggable provider callers; tests inject fakes, production wires the real
 * `callProvider` / `streamProvider`.
 */
export interface CallProviderFn {
  (...args: Parameters<typeof callProvider>): ReturnType<typeof callProvider>;
}
export interface StreamProviderFn {
  (...args: Parameters<typeof streamProvider>): ReturnType<typeof streamProvider>;
}

/**
 * `ZediChatModel` を構築するためのパラメータ。
 * Constructor input for {@link ZediChatModel}.
 *
 * @property provider          AIProviderType。OpenAI / Anthropic / Google.
 * @property apiKey            プロバイダ向け API キー。P0 では `zedi_managed` 鍵が入る。
 *                             Provider API key (zedi_managed in P0, BYOK in #951).
 * @property apiModelId        プロバイダ側モデル ID（例: `gpt-4o-mini`）。
 *                             Provider model id (`ai_models.modelId`).
 * @property modelRowId        DB 上の `ai_models.id`。`recordUsage` で使う。
 *                             `ai_models.id` (DB row id) used by `recordUsage`.
 * @property inputCostUnits    入力 1k tokens あたりの cost units。
 *                             Input cost units per 1k tokens.
 * @property outputCostUnits   出力 1k tokens あたりの cost units。
 *                             Output cost units per 1k tokens.
 * @property userId            実行ユーザー ID。Executing user id.
 * @property tier              ユーザー tier（参照用。validate 済みの想定）。User tier (already validated).
 * @property db                Drizzle DB ハンドル。Drizzle DB handle.
 * @property feature           `recordUsage` の feature ラベル。`recordUsage` feature label.
 * @property apiMode           "system" / "user_key"。P0 では "system"。BYOK 時に切替。
 * @property callProvider      `callProvider` の差し替え（任意）。Optional override.
 * @property streamProvider    `streamProvider` の差し替え（任意）。Optional override.
 * @property extraProviderOptions  `callProvider` / `streamProvider` に追加で渡す
 *                                 オプション。`useWebSearch` / `useGoogleSearch` /
 *                                 `webSearchOptions` などプロバイダ固有ノブを
 *                                 LangGraph ノードから通すための薄い pass-through。
 *                                 Per-provider pass-through options merged into
 *                                 the `AIChatOptions` bag passed to
 *                                 `callProvider` / `streamProvider`. Lets nodes
 *                                 enable provider-side web search etc. without
 *                                 widening the constructor surface for every
 *                                 future knob.
 */
export interface ZediChatModelParams extends BaseChatModelParams {
  provider: AIProviderType;
  apiKey: string;
  apiModelId: string;
  modelRowId: string;
  inputCostUnits: number;
  outputCostUnits: number;
  userId: string;
  tier: UserTier;
  db: Database;
  feature: string;
  apiMode?: ApiMode;
  callProvider?: CallProviderFn;
  streamProvider?: StreamProviderFn;
  /** モデル呼び出しオプション。temperature / maxTokens 等。Provider options. */
  temperature?: number;
  maxTokens?: number;
  extraProviderOptions?: ExtraProviderOptions;
}

/**
 * `callProvider` / `streamProvider` に追加で渡すプロバイダ固有オプションの
 * サブセット。`AIChatOptions` から `feature`/`temperature`/`maxTokens`/`stream`
 * を除いた pass-through ノブ群（web 検索フラグ等）。
 *
 * Subset of {@link AIChatOptions} containing provider-specific knobs that
 * subgraphs may need to flip per call (e.g. `useWebSearch` for the research
 * loop's `web_search` tool). Kept narrow so the model class doesn't accept
 * arbitrary call options that would bypass usage accounting.
 */
export type ExtraProviderOptions = Pick<
  AIChatOptions,
  "useWebSearch" | "useGoogleSearch" | "webSearchOptions"
>;

/**
 * Call options surfaced by {@link ZediChatModel}, including LangChain tool binding.
 */
export interface ZediChatModelCallOptions extends BaseChatModelCallOptions {
  tools?: ZediChatTool[];
  tool_choice?: ZediToolChoice;
}

/**
 * Concrete `BaseChatModel` implementation routing through Zedi providers.
 * Zedi の providers 経由で呼び出す `BaseChatModel` 実装。
 */
export class ZediChatModel extends BaseChatModel<ZediChatModelCallOptions, AIMessageChunk> {
  /** LangChain serialization namespace. LangChain シリアライズ識別子。 */
  static lc_name(): string {
    return "ZediChatModel";
  }

  private readonly provider: AIProviderType;
  private readonly apiKey: string;
  private readonly apiModelId: string;
  private readonly modelRowId: string;
  private readonly inputCostUnits: number;
  private readonly outputCostUnits: number;
  private readonly userId: string;
  private readonly tier: UserTier;
  private readonly db: Database;
  private readonly feature: string;
  private readonly apiMode: ApiMode;
  private readonly callProviderFn: CallProviderFn;
  private readonly streamProviderFn: StreamProviderFn;
  private readonly temperature?: number;
  private readonly maxTokens?: number;
  private readonly extraProviderOptions?: ExtraProviderOptions;

  constructor(fields: ZediChatModelParams) {
    super(fields);
    this.provider = fields.provider;
    this.apiKey = fields.apiKey;
    this.apiModelId = fields.apiModelId;
    this.modelRowId = fields.modelRowId;
    this.inputCostUnits = fields.inputCostUnits;
    this.outputCostUnits = fields.outputCostUnits;
    this.userId = fields.userId;
    this.tier = fields.tier;
    this.db = fields.db;
    this.feature = fields.feature;
    this.apiMode = fields.apiMode ?? "system";
    this.callProviderFn = fields.callProvider ?? callProvider;
    this.streamProviderFn = fields.streamProvider ?? streamProvider;
    this.temperature = fields.temperature;
    this.maxTokens = fields.maxTokens;
    this.extraProviderOptions = fields.extraProviderOptions;
  }

  /**
   * LangChain 側のモデル種別識別子。LangSmith 等のトレースで使う。
   * LangChain `_llmType` identifier.
   */
  _llmType(): string {
    return "zedi-chat";
  }

  /**
   * Expose LangChain tool-binding kwargs to `_generate`.
   * `_generate` に LangChain の tool binding 引数を渡す。
   */
  get callKeys(): string[] {
    return [...super.callKeys, "tools", "tool_choice"];
  }

  /**
   * Bind OpenAI-shaped function tools for structured output / tool calling.
   * When a single tool is bound without tool_choice, force that function so
   * withStructuredOutput always receives tool_calls from providers.
   * 構造化出力・tool calling 向けに OpenAI 形式の function tools を束ねる。
   * tool_choice 未指定で 1 件だけ束ねるときは schema function を強制する。
   */
  bindTools(
    tools: ZediChatTool[],
    kwargs?: Partial<ZediChatModelCallOptions>,
  ): Runnable<BaseLanguageModelInput, AIMessageChunk, ZediChatModelCallOptions> {
    const singleToolName =
      kwargs?.tool_choice === undefined && tools.length === 1
        ? tools[0]?.function?.name
        : undefined;
    const defaultToolChoice: ZediToolChoice | undefined = singleToolName
      ? { type: "function", function: { name: singleToolName } }
      : undefined;

    return this.withConfig({
      tools,
      ...(defaultToolChoice ? { tool_choice: defaultToolChoice } : {}),
      ...kwargs,
    } as Partial<ZediChatModelCallOptions>);
  }

  /**
   * Non-streaming generation path.
   * 非ストリーミング呼び出し。`callProvider` → cost 計算 → `recordUsage`。
   */
  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const zediMessages = toZediMessages(messages);
    const providerOptions: AIChatOptions = {
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      feature: this.feature,
      ...this.extraProviderOptions,
    };
    if (options.tools?.length) {
      providerOptions.tools = options.tools;
    }
    if (options.tool_choice !== undefined) {
      providerOptions.toolChoice = options.tool_choice;
    }

    const result = await this.callProviderFn(
      this.provider,
      this.apiKey,
      this.apiModelId,
      zediMessages,
      providerOptions,
    );

    const usage = await recordZediUsage({
      db: this.db,
      userId: this.userId,
      modelId: this.modelRowId,
      feature: this.feature,
      usage: result.usage,
      inputCostUnits: this.inputCostUnits,
      outputCostUnits: this.outputCostUnits,
      apiMode: this.apiMode,
    });

    void this.tier;
    void runManager;

    const toolCalls = result.toolCalls?.map((call) => ({
      id: call.id,
      name: call.name,
      args: call.args,
      type: "tool_call" as const,
    }));

    const aiMessage = new AIMessageChunk({
      content: result.content,
      tool_calls: toolCalls,
      response_metadata: {
        finishReason: result.finishReason,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUnits: usage.costUnits,
        },
      },
    });

    return {
      generations: [
        {
          text: result.content,
          message: aiMessage,
          generationInfo: { finishReason: result.finishReason },
        },
      ],
      llmOutput: {
        tokenUsage: {
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens,
        },
        costUnits: usage.costUnits,
        finishReason: result.finishReason,
      },
    };
  }

  /**
   * ストリーミング呼び出し。`streamProvider` の async generator を `ChatGenerationChunk`
   * に変換しつつ、累積トークンを cost 算出のために保持する。`/api/ai/chat` の挙動
   * と同じく `chars/4` を fallback 推定とする（プロバイダ側がトークン数を返さない
   * パスでも課金破綻させない）。
   *
   * Streaming generation; mirrors `routes/ai/chat.ts` token-accounting fallback
   * by estimating with `chars/4` when the provider does not surface usage in a
   * streaming response.
   */
  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const zediMessages = toZediMessages(messages);
    const gen = this.streamProviderFn(this.provider, this.apiKey, this.apiModelId, zediMessages, {
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      feature: this.feature,
      ...this.extraProviderOptions,
    });

    let accumulated = "";
    let finishReason: string | undefined;
    let done = false;

    for await (const chunk of gen) {
      if (chunk.content) {
        accumulated += chunk.content;
        const chatChunk = new ChatGenerationChunk({
          text: chunk.content,
          message: new AIMessageChunk({ content: chunk.content }),
        });
        // LangChain callback / SSE 向けにトークン delta を先に流す。
        // Surface incremental tokens to LangChain callback consumers so any
        // `streamEvents` listener (e.g. SSE mapper) sees deltas before usage.
        await runManager?.handleLLMNewToken(
          chunk.content,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            chunk: chatChunk,
          },
        );
        yield chatChunk;
      }
      if (chunk.done) {
        finishReason = chunk.finishReason;
        done = true;
        break;
      }
    }

    const promptLength = zediMessages.reduce((sum, m) => sum + m.content.length, 0);
    const inputTokens = Math.ceil(promptLength / 4);
    const outputTokens = Math.ceil(accumulated.length / 4);

    let usage: RecordZediUsageResult;
    if (done) {
      try {
        usage = await recordZediUsage({
          db: this.db,
          userId: this.userId,
          modelId: this.modelRowId,
          feature: this.feature,
          usage: { inputTokens, outputTokens },
          inputCostUnits: this.inputCostUnits,
          outputCostUnits: this.outputCostUnits,
          apiMode: this.apiMode,
        });
      } catch (err) {
        // Billing failure must not mask a successful stream.
        // 課金記録失敗で成功ストリームを潰さない。
        console.error("Failed to record streaming usage", err);
        usage = {
          inputTokens,
          outputTokens,
          costUnits:
            this.apiMode === "user_key"
              ? 0
              : calculateCost(
                  { inputTokens, outputTokens },
                  this.inputCostUnits,
                  this.outputCostUnits,
                ),
        };
      }
    } else {
      // Stream ended without `done` — expose metadata only, no DB billing (chat.ts 同様).
      // `done` 未到達で終了した incomplete ストリームは DB 課金しない。
      usage = { inputTokens, outputTokens, costUnits: 0 };
    }

    // Final chunk surfaces aggregate usage so downstream consumers (sseMapper,
    // LangChain callbacks) can read totals from a single ChatGenerationChunk.
    // 集計 usage を最終チャンクで返し、sseMapper 等が 1 箇所から読めるようにする。
    yield new ChatGenerationChunk({
      text: "",
      message: new AIMessageChunk({
        content: "",
        response_metadata: {
          finishReason: finishReason ?? (done ? "stop" : "incomplete"),
        },
        usage_metadata: {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          total_tokens: usage.inputTokens + usage.outputTokens,
        },
      }),
      generationInfo: {
        finishReason: finishReason ?? (done ? "stop" : "incomplete"),
        costUnits: usage.costUnits,
      },
    });
  }
}
