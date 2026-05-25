/**
 * Usage attribution helpers for `ZediChatModel`.
 *
 * `ZediChatModel` の usage 記録ヘルパー。LangGraph 経路でもチャットページと
 * 同じ `recordUsage` + `calculateCost` を通すための薄いアダプタ。BaseChatModel
 * の callback 機構を使わずに同期的に呼ぶ理由は、(1) graph 側の retry / 再実行で
 * cost を二重計上したくない、(2) 計算ロジックを単体テストしやすくするため。
 *
 * Thin adapter that routes LangGraph LLM usage through the same
 * `recordUsage` / `calculateCost` path as the chat endpoint. Kept as a plain
 * function instead of a LangChain callback so it can be unit-tested without
 * spinning up the callback system and so retries do not double-count.
 */
import type { BaseMessage } from "@langchain/core/messages";
import { calculateCost, recordUsage } from "../../../services/usageService.js";
import type {
  AIMessage as ZediAIMessage,
  ApiMode,
  Database,
  TokenUsage,
} from "../../../types/index.js";

/**
 * `recordZediUsage` の入力。
 * Input for {@link recordZediUsage}.
 *
 * @property db          Drizzle DB ハンドル。Drizzle DB handle.
 * @property userId      実行ユーザー ID。Executing user id.
 * @property modelId     `ai_models.id`。実モデル行 ID（API モデル名ではない）。
 *                       Database `ai_models.id` (not the provider model name).
 * @property feature     `ai_usage_logs.feature` のラベル。`recordUsage` feature label.
 * @property usage       消費したトークン数。Token consumption.
 * @property inputCostUnits  モデルの input 単価（1k tokens あたり cost_units）。
 *                            Per-1k input cost in cost units.
 * @property outputCostUnits モデルの output 単価（1k tokens あたり cost_units）。
 *                            Per-1k output cost in cost units.
 * @property apiMode     "system" / "user_key"。BYOK 導入後は "user_key" を渡す。
 *                       Future-proof flag for BYOK; pass "system" in P0.
 */
export interface RecordZediUsageInput {
  db: Database;
  userId: string;
  modelId: string;
  feature: string;
  usage: TokenUsage;
  inputCostUnits: number;
  outputCostUnits: number;
  apiMode: ApiMode;
}

/**
 * `recordZediUsage` の結果。クライアントに返したり SSE に流したりするのに使う。
 * Result of {@link recordZediUsage}; suitable to surface via SSE.
 */
export interface RecordZediUsageResult {
  inputTokens: number;
  outputTokens: number;
  costUnits: number;
}

/**
 * 1 回の LLM 呼び出しぶんの usage を計算して `ai_usage_logs` と `ai_monthly_usage`
 * に書き込む。LangGraph 経由でも `/api/ai/chat` と同等の課金を成立させる。
 *
 * Compute usage cost for a single LLM invocation and persist it via
 * `recordUsage`. Used by `ZediChatModel` after each provider call.
 */
export async function recordZediUsage(input: RecordZediUsageInput): Promise<RecordZediUsageResult> {
  const rawCostUnits = calculateCost(input.usage, input.inputCostUnits, input.outputCostUnits);
  // BYOK (#951): audit usage in logs but do not consume Zedi monthly CU.
  const costUnits = input.apiMode === "user_key" ? 0 : rawCostUnits;
  await recordUsage(
    input.userId,
    input.modelId,
    input.feature,
    input.usage,
    costUnits,
    input.apiMode,
    input.db,
  );
  return {
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    costUnits,
  };
}

/**
 * LangChain の `BaseMessage[]` を Zedi の `AIMessage[]` に変換する。
 * Convert LangChain `BaseMessage[]` to the legacy `AIMessage[]` shape that
 * `callProvider` / `streamProvider` expect.
 *
 * 既存の `aiProviders` 系 API は `role: "user" | "assistant" | "system"` の
 * 単純な dict 配列を取るため、本関数で type を取り出して文字列化する。Content が
 * 配列 (multi-modal) の場合は text ブロックのみ連結し、画像等は将来拡張。
 *
 * Until the providers gain multi-modal support, this helper concatenates text
 * blocks from a `BaseMessage` and drops non-text content blocks.
 */
export function toZediMessages(messages: BaseMessage[]): ZediAIMessage[] {
  return messages.map((m) => {
    const role = messageTypeToRole(m.getType());
    return { role, content: stringifyContent(m.content) };
  });
}

function messageTypeToRole(type: string): ZediAIMessage["role"] {
  // LangChain message types: "human" | "ai" | "system" | "tool" | "function" | ...
  // LangChain のメッセージ型を AIProviders が期待する role 文字列に正規化する。
  if (type === "system") return "system";
  if (type === "ai") return "assistant";
  // Treat tool / function / generic / human messages as user-side input to the
  // model. The providers do not have a richer notion in P0.
  // tool / function 等は P0 ではユーザー側入力として扱う。
  return "user";
}

function stringifyContent(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
    } else if (block && typeof block === "object" && "type" in block && block.type === "text") {
      // LangChain content blocks: prefer `.text`; fall back to `.value` if present.
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("");
}
