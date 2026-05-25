/**
 * Build a {@link ZediChatModel} for a Wiki Compose run.
 *
 * 1 つの compose セッションぶんの `ZediChatModel` を組み立てるファクトリ。
 * `validateModelAccess` で tier ゲートと cost 単価を解決し、backend に応じて
 * API キーを解決して `ZediChatModel` に注入する。
 *
 * Resolves model access (tier check + cost units) and provider credentials,
 * then constructs a `ZediChatModel`. Centralising this lets BYOK paths branch in
 * one place instead of every subgraph.
 */
import { getProviderApiKeyName } from "../../../services/aiProviders.js";
import { getUserAiCredentialPlaintext } from "../../../services/userAiCredentialService.js";
import { validateModelAccess } from "../../../services/usageService.js";
import type { AIProviderType, ApiMode, Database, UserTier } from "../../../types/index.js";
import {
  backendToCredentialProvider,
  isExecutionBackend,
  isUserByokBackend,
  SUPPORTED_COMPOSE_BACKENDS,
  type ExecutionBackend,
} from "../types/executionBackend.js";
import { ZediChatModel, type ExtraProviderOptions } from "./zediChatModel.js";

/**
 * `createZediChatModel` の入力。
 * Input for {@link createZediChatModel}.
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
  extraProviderOptions?: ExtraProviderOptions;
}

/**
 * Thrown when a caller hands in a backend that is not yet wired up.
 * 未対応 backend が渡されたときに投げる。
 */
export class UnsupportedBackendError extends Error {
  readonly code = "UNSUPPORTED_BACKEND";
  readonly backend: string;
  constructor(backend: string) {
    super(`Execution backend "${backend}" is not supported for Wiki Compose.`);
    this.name = "UnsupportedBackendError";
    this.backend = backend;
  }
}

/**
 * Thrown when BYOK backend is selected but no credential is stored.
 * BYOK だが credential 未登録のときに投げる。
 */
export class MissingUserCredentialError extends Error {
  readonly code = "MISSING_USER_CREDENTIAL";
  readonly backend: ExecutionBackend;
  constructor(backend: ExecutionBackend) {
    super(`No API credential configured for backend "${backend}"`);
    this.name = "MissingUserCredentialError";
    this.backend = backend;
  }
}

/**
 * Thrown when the model's provider does not match the BYOK backend.
 * モデル provider と BYOK backend が一致しないときに投げる。
 */
export class BackendProviderMismatchError extends Error {
  readonly code = "BACKEND_PROVIDER_MISMATCH";
  readonly backend: ExecutionBackend;
  readonly provider: AIProviderType;
  constructor(backend: ExecutionBackend, provider: AIProviderType) {
    super(`Backend "${backend}" does not match model provider "${provider}"`);
    this.name = "BackendProviderMismatchError";
    this.backend = backend;
    this.provider = provider;
  }
}

/**
 * Validate that the requested `backend` is supported for Wiki Compose (#951).
 */
export function assertSupportedComposeBackend(backend: string): ExecutionBackend {
  if (!isExecutionBackend(backend) || !SUPPORTED_COMPOSE_BACKENDS.includes(backend)) {
    throw new UnsupportedBackendError(backend);
  }
  return backend;
}

/**
 * @deprecated Use {@link assertSupportedComposeBackend}. Kept for barrel exports.
 */
export const assertSupportedBackendP0 = assertSupportedComposeBackend;

/**
 * Build a {@link ZediChatModel} ready to be plugged into a LangGraph node.
 */
export async function createZediChatModel(input: CreateZediChatModelInput): Promise<ZediChatModel> {
  const backend = assertSupportedComposeBackend(input.backend);

  const modelInfo = await validateModelAccess(input.modelId, input.tier, input.db);
  const provider = modelInfo.provider as AIProviderType;

  if (isUserByokBackend(backend)) {
    const expected = backendToCredentialProvider(backend);
    if (provider !== expected) {
      throw new BackendProviderMismatchError(backend, provider);
    }
  }

  const apiKey = await resolveApiKey({
    backend,
    provider,
    userId: input.userId,
    db: input.db,
    overrideKey: input.apiKey,
  });
  const apiMode: ApiMode = isUserByokBackend(backend) ? "user_key" : "system";

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
    extraProviderOptions: input.extraProviderOptions,
  });
}

interface ResolveApiKeyInput {
  backend: ExecutionBackend;
  provider: AIProviderType;
  userId: string;
  db: Database;
  overrideKey: string | undefined;
}

async function resolveApiKey(input: ResolveApiKeyInput): Promise<string> {
  const { backend, provider, userId, db, overrideKey } = input;

  if (backend === "zedi_managed") {
    const envName = getProviderApiKeyName(provider);
    const key = process.env[envName];
    if (!key) {
      throw new Error(`API key not configured: ${envName}`);
    }
    return key;
  }

  if (isUserByokBackend(backend)) {
    if (overrideKey?.trim()) {
      return overrideKey.trim();
    }
    const credentialProvider = backendToCredentialProvider(backend);
    const stored = await getUserAiCredentialPlaintext(userId, credentialProvider, db);
    if (!stored?.trim()) {
      throw new MissingUserCredentialError(backend);
    }
    return stored.trim();
  }

  throw new UnsupportedBackendError(backend);
}
