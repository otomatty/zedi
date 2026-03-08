/**
 * AI モデル同期まわりの型定義
 */
import type { AIProviderType } from "../types/index.js";

export type Row = {
  id: string;
  provider: AIProviderType;
  modelId: string;
  displayName: string;
  tierRequired: "free" | "pro";
  inputCostUnits: number;
  outputCostUnits: number;
  isActive: boolean;
  sortOrder: number;
};

export interface SyncedModelInfo {
  id: string;
  modelId: string;
  inputCostUnits: number;
  outputCostUnits: number;
}

export interface SyncResult {
  provider: AIProviderType;
  fetched: number;
  upserted: number;
  filtered?: number;
  deactivated?: number;
  pricingSource?: "openrouter" | "default";
  models?: SyncedModelInfo[];
  error?: string;
  debug?: string;
}

export interface SyncPreviewItem {
  id: string;
  provider: AIProviderType;
  modelId: string;
  displayName: string;
  tierRequired: "free" | "pro";
  isActive: boolean;
}

export interface SyncPreviewResult {
  provider: AIProviderType;
  toAdd: SyncPreviewItem[];
  error?: string;
}

/** OpenRouter API の料金オブジェクト（USD per token, string） */
export interface OpenRouterPricing {
  prompt: string;
  completion: string;
}

/** OpenRouter /api/v1/models のモデルエントリ */
export interface OpenRouterModel {
  id: string;
  pricing: OpenRouterPricing;
}
