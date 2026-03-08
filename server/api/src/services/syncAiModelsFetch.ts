/**
 * AI モデル同期: HTTP 取得とプロバイダー別モデル一覧取得
 */
import type { Row } from "./syncAiModelsTypes.js";
import { assignTier } from "./syncAiModelsFilters.js";

const FETCH_TIMEOUT_MS = 15000;
const DEFAULT_COST_UNITS = 1;

export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Request timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOpenAIModels(apiKey: string): Promise<Row[]> {
  const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
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

export interface AnthropicFetchResult {
  rows: Row[];
  debug?: string;
}

export async function fetchAnthropicModels(apiKey: string): Promise<AnthropicFetchResult> {
  const all: Row[] = [];
  let afterId: string | undefined;
  let pageIndex = 0;
  let firstResponseBody: string | undefined;

  for (;;) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);
    const res = await fetchWithTimeout(url.toString(), {
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
    const baseSortOrder = all.length;
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
        sortOrder: baseSortOrder + i,
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

export async function fetchGoogleModels(apiKey: string): Promise<Row[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url);
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
