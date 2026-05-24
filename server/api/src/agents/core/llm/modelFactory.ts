/**
 * Build a {@link ZediChatModel} for a Wiki Compose run.
 *
 * 1 つの compose セッションぶんの `ZediChatModel` を組み立てるファクトリ。
 * `validateModelAccess` で tier ゲートと cost 単価を解決し、`process.env` から
 * provider API キーを引いて `ZediChatModel` に注入する。BYOK (#951) で
 * `backend === "byok"` が来た場合の経路もこのファクトリで分岐する想定。
 *
 * Resolves model access (tier check + cost units) and provider credentials,
 * then constructs a `ZediChatModel`. Centralising this lets future BYOK paths
 * branch in one place instead of every subgraph.
 */
import { getProviderApiKeyName } from "../../../services/aiProviders.js";
import { validateModelAccess } from "../../../services/usageService.js";
import type { AIProviderType, ApiMode, Database, UserTier } from "../../../types/index.js";
import {
  isExecutionBackend,
  SUPPORTED_BACKENDS_P0,
  type ExecutionBackend,
} from "../types/executionBackend.js";
import { ZediChatModel } from "./zediChatModel.js";

/**
 * `createZediChatModel` の入力。
 * Input for {@link createZediChatModel}.
 *
 * @property modelId  `ai_models.id`。`validateModelAccess` の入力と同じ。
 *                    `ai_models.id` (matches `validateModelAccess`).
 * @property userId   実行ユーザー ID。Executing user id.
 * @property tier     ユーザー tier。先に `getUserTier` で解決済みのものを渡す。
 *                    User tier (pre-resolved via `getUserTier`).
 * @property db       Drizzle DB ハンドル。Drizzle DB handle.
 * @property feature  `recordUsage` の feature ラベル。`recordUsage` feature label.
 * @property backend  実行 backend。P0 では `zedi_managed` のみ受理。
 *                    Execution backend; P0 only accepts `zedi_managed`.
 * @property apiKey   BYOK 用の上書き API キー（任意）。`backend === "byok"` の時必須。
 *                    Override API key for BYOK; required when `backend === "byok"`.
 * @property temperature  Provider オプション。Provider option.
 * @property maxTokens    Provider オプション。Provider option.
 */
export interface CreateZediChatModelInput {
  modelId: string;
  userId: string;
  tier: UserTier;
  db: Database;
  feature: string;
  backend: ExecutionBackend;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 未サポート backend を投げる時のエラー。route 層が 4xx に変換できるよう
 * 専用クラスにしておく。
 *
 * Thrown when a caller hands in a backend that is not yet wired up. Carries a
 * machine-readable code so the route layer can map to a 4xx without sniffing
 * the message string.
 */
export class UnsupportedBackendError extends Error {
  /** Machine-readable code. */
  readonly code = "UNSUPPORTED_BACKEND";
  /** The backend value that triggered the error. */
  readonly backend: string;
  constructor(backend: string) {
    super(`Execution backend "${backend}" is not supported in P0 (zedi_managed only).`);
    this.name = "UnsupportedBackendError";
    this.backend = backend;
  }
}

/**
 * Validate that the requested `backend` is a P0-supported value and return it
 * narrowed to {@link ExecutionBackend}.
 *
 * P0 でサポートされる backend かを検証する。`byok` / `byo_runner` は #951 以降。
 */
export function assertSupportedBackendP0(backend: string): ExecutionBackend {
  if (!isExecutionBackend(backend) || !SUPPORTED_BACKENDS_P0.includes(backend)) {
    throw new UnsupportedBackendError(backend);
  }
  return backend;
}

/**
 * Build a {@link ZediChatModel} ready to be plugged into a LangGraph node.
 * LangGraph ノードへ差し込む `ZediChatModel` を組み立てて返す。
 *
 * 1. backend を検証（P0 は `zedi_managed` のみ）。
 * 2. `validateModelAccess` で tier ゲート + cost 単価を解決。
 * 3. provider API キーを backend に応じて解決
 *    （`zedi_managed` → `process.env[apiKeyName]`、`byok` → 入力の `apiKey`）。
 */
export async function createZediChatModel(input: CreateZediChatModelInput): Promise<ZediChatModel> {
  const backend = assertSupportedBackendP0(input.backend);

  const modelInfo = await validateModelAccess(input.modelId, input.tier, input.db);
  const provider = modelInfo.provider as AIProviderType;

  const apiKey = resolveApiKey(backend, provider, input.apiKey);
  const apiMode: ApiMode = backend === "byok" ? "user_key" : "system";

  return new ZediChatModel({
    provider,
    apiKey,
    apiModelId: modelInfo.apiModelId,
    modelRowId: input.modelId,
    inputCostUnits: modelInfo.inputCostUnits,
    outputCostUnits: modelInfo.outputCostUnits,
    userId: input.userId,
    tier: input.tier,
    db: input.db,
    feature: input.feature,
    apiMode,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
}

/**
 * Backend + provider に応じた API キー解決。`zedi_managed` は `process.env` を
 * 引き、`byok` は呼び出し側からの注入キーを必須にする。
 *
 * Resolve the provider API key per backend. `zedi_managed` reads `process.env`;
 * `byok` requires an explicitly injected key.
 */
function resolveApiKey(
  backend: ExecutionBackend,
  provider: AIProviderType,
  overrideKey: string | undefined,
): string {
  if (backend === "zedi_managed") {
    const envName = getProviderApiKeyName(provider);
    const key = process.env[envName];
    if (!key) {
      throw new Error(`API key not configured: ${envName}`);
    }
    return key;
  }
  if (!overrideKey || !overrideKey.trim()) {
    throw new Error(`apiKey is required for backend="${backend}"`);
  }
  return overrideKey;
}
