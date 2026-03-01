/**
 * 各LLMプロバイダー（OpenAI / Anthropic / Google）からモデル一覧を取得し、
 * ai_models テーブルを更新する。
 *
 * 実行: npm run sync:ai-models (要 DATABASE_URL と各プロバイダーの API キー)
 *
 * 環境変数（任意）:
 *   OPENAI_MODEL_IDS  カンマ区切りで登録するモデルIDのみ（未設定なら取得した全件を登録）
 *   GOOGLE_MODEL_IDS  同上（例: gemini-2.0-flash,gemini-1.5-pro）
 *
 * Anthropic: https://docs.anthropic.com/en/api/models-list の data 配列を使用
 */
import { eq, and, notInArray } from "drizzle-orm";
import type { AIProviderType } from "../types/index.js";
import { getProviderApiKeyName } from "./aiProviders.js";
import { getOptionalEnv } from "../lib/env.js";
import { getDb } from "../db/client.js";
import { aiModels } from "../schema/index.js";

const DEFAULT_COST_UNITS = 1;

/**
 * テキストチャット用途のモデルかどうかを判定する。
 * 画像生成・動画生成・音声/TTS・Embedding・リアルタイム・転写・コード実行専用等を除外。
 */
function isTextChatModel(provider: AIProviderType, modelId: string): boolean {
  const id = modelId.toLowerCase();

  if (provider === "openai") {
    const excludePatterns = [
      "image", // gpt-image-1, gpt-image-1-mini, gpt-image-1.5
      "tts", // gpt-4o-mini-tts
      "audio", // gpt-4o-audio-preview, gpt-audio-*
      "realtime", // gpt-realtime-*
      "transcribe", // gpt-4o-transcribe, gpt-4o-mini-transcribe
      "instruct", // gpt-3.5-turbo-instruct (completion-only)
      "codex", // gpt-5-codex, gpt-5.1-codex (code execution API)
      "search", // gpt-4o-search-preview, gpt-5-search-api
    ];
    return !excludePatterns.some((p) => id.includes(p));
  }

  if (provider === "google") {
    const excludePatterns = [
      "imagen", // imagen-4.0-*
      "veo", // veo-2.0-*, veo-3.0-*
      "embedding", // gemini-embedding-001
      "tts", // gemini-*-tts
      "audio", // gemini-*-native-audio-*
      "image", // gemini-*-image-*, nano-banana
      "aqa", // aqa (Attributed Question Answering)
      "robotics", // gemini-robotics-*
      "computer-use", // gemini-*-computer-use-*
      "deep-research", // deep-research-*
      "gemma", // gemma-* (small open-weight, not API chat)
      "nano-banana", // alias for image models
    ];
    return !excludePatterns.some((p) => id.includes(p));
  }

  return true;
}

/**
 * 最新世代のモデルのみを残す。
 * 旧世代・日付付きバージョン・冗長エイリアスを除外。
 */
function isLatestGeneration(provider: AIProviderType, modelId: string): boolean {
  const id = modelId.toLowerCase();

  // OpenAI: YYYY-MM-DD 日付サフィックスを除外
  if (provider === "openai" && /\d{4}-\d{2}-\d{2}$/.test(id)) return false;
  // Anthropic: YYYYMMDD 日付サフィックスを除外
  if (provider === "anthropic" && /\d{8}$/.test(id)) return false;

  if (provider === "openai") {
    if (id.startsWith("gpt-3.5")) return false;
    if (id.endsWith("-chat-latest")) return false;
    return true;
  }

  if (provider === "anthropic") {
    if (/^claude-3(-|$)/.test(id)) return false;
    return true;
  }

  if (provider === "google") {
    if (/-(0\d{2})$/.test(id)) return false;
    if (id.endsWith("-latest")) return false;
    if (/\d{2}-\d{4}$/.test(id)) return false;
    if (id.includes("customtools")) return false;
    return true;
  }

  return true;
}

/**
 * モデルの料金ティアを判定する。
 * mini/nano/flash 系は free、flagship/pro 系は pro。
 */
function assignTier(provider: AIProviderType, modelId: string): "free" | "pro" {
  const id = modelId.toLowerCase();

  if (provider === "openai") {
    if (id.includes("mini") || id.includes("nano")) return "free";
    return "pro";
  }

  if (provider === "anthropic") {
    if (id.includes("haiku") || id.includes("sonnet")) return "free";
    return "pro";
  }

  if (provider === "google") {
    if (id.includes("pro")) return "pro";
    return "free";
  }

  return "free";
}

/** カンマ区切り環境変数を ID の Set に（空 or 未設定なら null = 全件対象） */
function parseAllowlist(envValue: string): Set<string> | null {
  const s = envValue?.trim();
  if (!s) return null;
  const ids = s
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

type Row = {
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

async function fetchOpenAIModels(apiKey: string): Promise<Row[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenAI models list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: Array<{ id: string }> };
  const list = data.data ?? [];
  return list
    .filter((m) => m.id?.startsWith("gpt-") || m.id?.startsWith("o1-") || m.id?.startsWith("o3-"))
    .map((m, i) => ({
      id: `openai:${m.id}`,
      provider: "openai" as const,
      modelId: m.id,
      displayName: m.id,
      tierRequired: assignTier("openai", m.id),
      inputCostUnits: DEFAULT_COST_UNITS,
      outputCostUnits: DEFAULT_COST_UNITS,
      isActive: true,
      sortOrder: i,
    }));
}

/**
 * Anthropic モデル一覧を取得（GET /v1/models）。
 * 公式: https://docs.anthropic.com/en/api/models-list — レスポンスは data 配列、ページネーションは has_more / after_id。
 */
interface AnthropicFetchResult {
  rows: Row[];
  debug?: string;
}

async function fetchAnthropicModels(apiKey: string): Promise<AnthropicFetchResult> {
  const all: Row[] = [];
  let afterId: string | undefined;
  let pageIndex = 0;
  let firstResponseBody: string | undefined;

  for (;;) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);
    const res = await fetch(url.toString(), {
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
    });
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`Anthropic models list failed: ${res.status} ${rawText}`);
    }

    if (pageIndex === 0) {
      firstResponseBody = rawText.slice(0, 2000);
    }

    let body: {
      data?: Array<{ id: string; display_name?: string }>;
      has_more?: boolean;
      last_id?: string;
    };
    try {
      body = JSON.parse(rawText);
    } catch {
      throw new Error(`Anthropic: invalid JSON response: ${rawText.slice(0, 500)}`);
    }

    const list = body.data ?? [];
    list.forEach((m, i) => {
      all.push({
        id: `anthropic:${m.id}`,
        provider: "anthropic" as const,
        modelId: m.id,
        displayName: m.display_name ?? m.id,
        tierRequired: assignTier("anthropic", m.id),
        inputCostUnits: DEFAULT_COST_UNITS,
        outputCostUnits: DEFAULT_COST_UNITS,
        isActive: true,
        sortOrder: all.length + i,
      });
    });
    if (!body.has_more || list.length === 0) break;
    afterId = body.last_id ?? list[list.length - 1]?.id;
    pageIndex++;
    if (pageIndex > 20) break;
  }

  return {
    rows: all,
    debug:
      all.length === 0
        ? `status=200, pages=${pageIndex + 1}, body_sample=${firstResponseBody}`
        : undefined,
  };
}

async function fetchGoogleModels(apiKey: string): Promise<Row[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google models list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    models?: Array<{ name?: string; displayName?: string }>;
  };
  const list = data.models ?? [];
  return list
    .filter((m) => m.name && (m.name.includes("gemini") || m.name.includes("models/")))
    .map((m, i) => {
      const rawId = (m.name ?? "").replace(/^models\//, "");
      return {
        id: `google:${rawId}`,
        provider: "google" as const,
        modelId: rawId,
        displayName: m.displayName ?? rawId,
        tierRequired: assignTier("google", rawId),
        inputCostUnits: DEFAULT_COST_UNITS,
        outputCostUnits: DEFAULT_COST_UNITS,
        isActive: true,
        sortOrder: i,
      };
    });
}

export interface SyncResult {
  provider: AIProviderType;
  fetched: number;
  upserted: number;
  filtered?: number;
  deactivated?: number;
  error?: string;
  debug?: string;
}

export async function syncAiModels(db: ReturnType<typeof getDb>): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const providers: AIProviderType[] = ["openai", "anthropic", "google"];

  for (const provider of providers) {
    const keyName = getProviderApiKeyName(provider);
    const apiKey = getOptionalEnv(keyName);
    if (!apiKey) {
      results.push({ provider, fetched: 0, upserted: 0, error: `${keyName} not set` });
      continue;
    }

    try {
      let rows: Row[];
      let debug: string | undefined;
      switch (provider) {
        case "openai":
          rows = await fetchOpenAIModels(apiKey);
          break;
        case "anthropic": {
          const result = await fetchAnthropicModels(apiKey);
          rows = result.rows;
          debug = result.debug;
          break;
        }
        case "google":
          rows = await fetchGoogleModels(apiKey);
          break;
        default:
          rows = [];
      }

      const fetchedTotal = rows.length;

      // テキストチャットモデル以外を除外し、最新世代のみ残す
      rows = rows.filter(
        (r) => isTextChatModel(r.provider, r.modelId) && isLatestGeneration(r.provider, r.modelId),
      );

      // 特定モデルのみ登録する場合は環境変数でフィルタ（未設定なら全件）
      const openaiAllowlist = parseAllowlist(getOptionalEnv("OPENAI_MODEL_IDS"));
      const googleAllowlist = parseAllowlist(getOptionalEnv("GOOGLE_MODEL_IDS"));
      if (provider === "openai" && openaiAllowlist) {
        rows = rows.filter((r) => openaiAllowlist.has(r.modelId));
      }
      if (provider === "google" && googleAllowlist) {
        rows = rows.filter((r) => googleAllowlist.has(r.modelId));
      }

      let upserted = 0;
      for (const row of rows) {
        await db
          .insert(aiModels)
          .values({
            id: row.id,
            provider: row.provider,
            modelId: row.modelId,
            displayName: row.displayName,
            tierRequired: row.tierRequired,
            inputCostUnits: row.inputCostUnits,
            outputCostUnits: row.outputCostUnits,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
          })
          .onConflictDoUpdate({
            target: aiModels.id,
            set: {
              modelId: row.modelId,
              displayName: row.displayName,
              tierRequired: row.tierRequired,
              inputCostUnits: row.inputCostUnits,
              outputCostUnits: row.outputCostUnits,
              isActive: row.isActive,
              sortOrder: row.sortOrder,
            },
          });
        upserted += 1;
      }

      // 今回 upsert 対象外のモデルを非アクティブ化
      const activeIds = rows.map((r) => r.id);
      let deactivated = 0;
      if (activeIds.length > 0) {
        const result = await db
          .update(aiModels)
          .set({ isActive: false })
          .where(and(eq(aiModels.provider, provider), notInArray(aiModels.id, activeIds)));
        deactivated = result.rowCount ?? 0;
      } else {
        const result = await db
          .update(aiModels)
          .set({ isActive: false })
          .where(eq(aiModels.provider, provider));
        deactivated = result.rowCount ?? 0;
      }

      results.push({
        provider,
        fetched: fetchedTotal,
        filtered: fetchedTotal - rows.length,
        upserted,
        deactivated,
        debug,
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const message = err.message + (err.cause ? ` (cause: ${String(err.cause)})` : "");
      console.error(`[syncAiModels] ${provider} error:`, err.message, err.cause ?? err);
      results.push({ provider, fetched: 0, upserted: 0, error: message });
    }
  }

  return results;
}
