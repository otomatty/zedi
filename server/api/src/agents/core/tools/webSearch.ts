/**
 * `web_search` tool — runs a provider-internal web search and returns a
 * structured `{title,url,snippet}` list.
 *
 * Provider routing (issue #949):
 * - `process.env.WIKI_COMPOSE_WEB_SEARCH_MODEL_ID` (`ai_models.id` override) >
 * - cheapest active OpenAI model (`useWebSearch`) >
 * - cheapest active Google model (`useGoogleSearch`).
 *
 * If the session was created with `backend === "zedi_managed"` but no suitable
 * model exists (Anthropic-only seed, or no API keys configured), the tool
 * returns `{ ok:true, results:[], note:"web_search_unavailable" }` so the
 * `evaluate_sufficiency` node can carry on instead of throwing. The fallback
 * is intentional: `evaluate_sufficiency` already handles empty results, and
 * raising would tank the whole loop on a misconfigured env.
 *
 * LLM 呼び出しは `createZediChatModel` 経由で行うため、usage 記録は P0 で
 * 確立した課金経路にそのまま乗る。`extraProviderOptions` で `useWebSearch` /
 * `useGoogleSearch` を pass-through する。
 *
 * The LLM call goes through `createZediChatModel`, so usage attribution flows
 * through the existing `recordUsage` path established in P0 (#948).
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { GRAPH_CONTEXT_CONFIG_KEY, type GraphContext } from "../types/graphContext.js";
import { createZediChatModel } from "../llm/modelFactory.js";
import { resolveWebSearchModelId } from "./resolveWebSearchModel.js";
import type { ExtraProviderOptions } from "../llm/zediChatModel.js";
import { aiModels } from "../../../schema/index.js";

/** Tool name shared across subgraphs. 全 subgraph 共通の tool 名。 */
export const WEB_SEARCH_TOOL_NAME = "web_search" as const;

/**
 * Input schema (zod). `query` は必須、`limit` は 1〜10、`recencyDays` は省略可。
 * Input schema; `query` required, `limit` 1..10, `recencyDays` optional.
 */
export const webSearchInputSchema = z.object({
  query: z.string().min(1).describe("Search query string. 検索クエリ。"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Max results (default 5). 最大件数 (既定 5)。"),
  recencyDays: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Restrict to results within N days. N 日以内の結果に限定。"),
});

const webSearchResultSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().url(),
        snippet: z.string().optional(),
      }),
    )
    .max(10),
});

const SYSTEM_PROMPT =
  "You are a web search assistant. Use the provider's native web search to find " +
  "fresh, relevant pages for the user's query. Reply with JSON only, matching the " +
  "provided schema. Do not invent URLs; only include sources you actually retrieved.";

function buildUserPrompt(query: string, limit: number, recencyDays: number | undefined): string {
  const constraints: string[] = [];
  if (recencyDays !== undefined) constraints.push(`Restrict to the last ${recencyDays} days.`);
  constraints.push(`Return at most ${limit} results.`);
  return [`Query: ${query}`, ...constraints].join("\n");
}

/** Hit shape emitted on the wire (serialised as JSON). */
interface WebSearchToolHit {
  /**
   * Stable Source id: `src:<sha256(url)>`. Shared with `kind:"fetched"` so the
   * reducer (`mergeSourcesById`) upgrades the row in place when Readability
   * succeeds on the same URL.
   * web/fetched は同じ id 体系 (`src:<sha>`) を使うことで reducer が in-place
   * 昇格できる（codex review #956 P2 / gemini #4）。
   */
  id: string;
  kind: "web";
  title: string;
  url: string;
  snippet?: string;
}

interface WebSearchSuccess {
  ok: true;
  results: WebSearchToolHit[];
  /** Optional explanatory note (e.g. fallback path). */
  note?: string;
}

interface WebSearchFailure {
  ok: false;
  error: string;
  results: [];
}

export const webSearchTool = tool(
  async (input, config?: LangGraphRunnableConfig) => {
    const ctx = readGraphContext(config);
    if (!ctx) {
      return JSON.stringify({
        ok: false,
        error: "missing_graph_context",
        results: [],
      } satisfies WebSearchFailure);
    }
    const limit = input.limit ?? 5;
    const recencyDays = input.recencyDays;

    let modelId: string | null;
    try {
      modelId = await resolveWebSearchModelId(ctx.db);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        ok: false,
        error: `web_search_model_resolution_failed:${message}`,
        results: [],
      } satisfies WebSearchFailure);
    }

    if (!modelId) {
      // No OpenAI/Google model configured. Return empty results so the loop
      // can carry on; `evaluate_sufficiency` is tolerant of empty channels.
      // OpenAI / Google モデルが見つからない場合は空結果 + note を返す。
      return JSON.stringify({
        ok: true,
        results: [],
        note: "web_search_unavailable",
      } satisfies WebSearchSuccess);
    }

    try {
      const provider = await detectProviderForModelId(ctx, modelId);
      const extraProviderOptions = providerOptions(provider);
      const model = await createZediChatModel({
        modelId,
        userId: ctx.userId,
        tier: ctx.tier,
        db: ctx.db,
        feature: `${ctx.feature}:web_search`,
        backend: "zedi_managed",
        temperature: 0.2,
        maxTokens: 1024,
        extraProviderOptions,
      });
      const structured = model.withStructuredOutput(webSearchResultSchema, {
        name: "web_search_results",
      });
      const parsed = await structured.invoke([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input.query, limit, recencyDays) },
      ]);
      const results: WebSearchToolHit[] = await Promise.all(
        parsed.results.slice(0, limit).map(async (r) => ({
          id: `src:${await sha256Hex(r.url)}`,
          kind: "web",
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
      );
      return JSON.stringify({ ok: true, results } satisfies WebSearchSuccess);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        ok: false,
        error: message,
        results: [],
      } satisfies WebSearchFailure);
    }
  },
  {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      "Search the public web for fresh information. Returns top results with title + snippet + url. " +
      "公開 Web を検索し、タイトル・抜粋・URL を返す。",
    schema: webSearchInputSchema,
  },
);

function readGraphContext(config: LangGraphRunnableConfig | undefined): GraphContext | null {
  const configurable = config?.configurable as Record<string, unknown> | undefined;
  const candidate = configurable?.[GRAPH_CONTEXT_CONFIG_KEY];
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as GraphContext;
}

/**
 * Look up the provider for a given `ai_models.id`. We could reuse
 * `validateModelAccess` but that throws for tier-blocked models and we don't
 * want a tier check here (the call is at the `web_search` feature, billed to
 * the user regardless of which model is picked).
 *
 * Returns "openai" / "google" / "anthropic". Throws if the model is missing.
 */
async function detectProviderForModelId(
  ctx: GraphContext,
  modelId: string,
): Promise<"openai" | "anthropic" | "google"> {
  const [row] = await ctx.db
    .select({ provider: aiModels.provider })
    .from(aiModels)
    .where(eq(aiModels.id, modelId))
    .limit(1);
  if (!row) throw new Error(`Model not found: ${modelId}`);
  if (row.provider === "openai" || row.provider === "anthropic" || row.provider === "google") {
    return row.provider;
  }
  throw new Error(`Unknown provider for model ${modelId}: ${row.provider}`);
}

function providerOptions(provider: "openai" | "anthropic" | "google"): ExtraProviderOptions {
  if (provider === "openai") {
    return { useWebSearch: true, webSearchOptions: { search_context_size: "medium" } };
  }
  if (provider === "google") {
    return { useGoogleSearch: true };
  }
  // Anthropic is not selected by `resolveWebSearchModelId`; this is defensive
  // for the env-override branch. The structured prompt still works, just
  // without provider-side search.
  return {};
}

/**
 * `sha256` hex digest of a string. Used to mint stable `Source.id` for web
 * search hits so a URL appearing in iteration N upgrades to `kind:"fetched"`
 * in iteration N+1 in place.
 */
async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
