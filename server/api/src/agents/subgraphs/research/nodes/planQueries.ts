/**
 * `plan_queries` — generates the initial query set for the research loop.
 *
 * 調査ループの最初のノード。Brief / 指示メッセージから 1〜8 件の調査クエリを
 * 生成し、`maxIterations` を 1..5 にクランプする。"additional_research" 入力で
 * 既存セッションの追加調査として呼ばれた場合、`iteration / lastEvaluation /
 * exitReason` をリセットし、`carryOverApprovedIds` で `pendingSources` を初期化
 * する（issue #949 の追加調査 API パス）。
 *
 * Initial node. Emits a structured query list via `ZediChatModel
 * .withStructuredOutput`. Honours an "additional_research" input shape so the
 * same graph id can serve re-runs without a separate route.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { composeContentLocaleInstruction } from "../../../core/composeLocale.js";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { resolveComposeModelId } from "../../../core/llm/resolveComposeModelId.js";
import { getGraphContext } from "./shared/getGraphContext.js";
import { dispatchResearchIteration } from "./shared/dispatchSseCustom.js";
import type { ResearchLoopStateType, ResearchLoopStateUpdate } from "../state.js";
import type { PlannedQuery, Source } from "../types.js";

/**
 * @deprecated Use {@link resolveComposeModelId} with graph context. Kept for tests importing the symbol.
 */
export function getOrchestratorModelId(): string {
  return process.env.WIKI_COMPOSE_ORCHESTRATOR_MODEL_ID?.trim() || "claude-3-5-haiku";
}

/** Schema for the LLM's structured output. */
export const planQueriesSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string().min(1),
        rationale: z.string().optional(),
        channels: z.array(z.enum(["web", "wiki"])).min(1),
      }),
    )
    .min(1)
    .max(8),
});

const SYSTEM_PROMPT =
  "You are an orchestrator planning research queries for a wiki article. " +
  "Given the user's brief, propose 1-6 search queries that cover distinct angles. " +
  "Each query MUST specify at least one channel from ['web','wiki']. " +
  "Prefer 'wiki' for queries likely answered by the user's own knowledge base " +
  "and 'web' for queries needing fresh public information. Output JSON only.";

import type { AdditionalResearchRequest } from "../types.js";

function clampMaxIterations(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 3;
  const truncated = Math.trunc(raw);
  return Math.min(Math.max(truncated, 1), 5);
}

function briefFromState(
  state: ResearchLoopStateType,
  additional: AdditionalResearchRequest | null,
): string {
  if (additional) {
    const parts = ["[Additional research request]", additional.instruction];
    if (additional.brief) parts.push("", "[Original brief]", additional.brief);
    return parts.join("\n");
  }
  // Fall back to concatenating all text content of `messages`. Empty string is
  // valid — the LLM will still produce default coverage queries.
  return state.messages
    .map((m) => {
      const raw = (m as { content?: unknown }).content;
      return typeof raw === "string" ? raw : "";
    })
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/**
 * `plan_queries` node implementation. Exported for direct unit testing.
 *
 * 単体テストから直接呼べるよう export する。
 */
export async function planQueries(
  state: ResearchLoopStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchLoopStateUpdate> {
  const ctx = getGraphContext(config);
  // Detect additional-research input from the dedicated state field. The route
  // layer translates `body.input.kind === "additional_research"` into this
  // shape so LangGraph's strict state schema does not drop unknown top-level
  // input keys (codex review #956 P1).
  // 追加調査の検出は state.additionalRequest 専用フィールドで行う。
  const additional = state.additionalRequest ?? null;
  const brief = briefFromState(state, additional);

  // Resolve maxIterations: input override > existing state > default(3); clamp 1..5.
  // maxIterations は既存 state を優先しつつ 1..5 にクランプ。
  const maxIterations = clampMaxIterations(state.maxIterations ?? 3);

  const modelId = await resolveComposeModelId("orchestrator", ctx.backend, ctx.tier, ctx.db);
  const model = await createZediChatModel({
    modelId,
    userId: ctx.userId,
    tier: ctx.tier,
    db: ctx.db,
    feature: `${ctx.feature}:plan`,
    backend: ctx.backend,
    temperature: 0.4,
    maxTokens: 1024,
  });
  const structured = model.withStructuredOutput(planQueriesSchema, { name: "plan_queries" });
  const planned = await structured.invoke([
    {
      role: "system",
      content: SYSTEM_PROMPT + composeContentLocaleInstruction(ctx.contentLocale),
    },
    { role: "user", content: brief || "(no brief provided; produce 2 broad coverage queries)" },
  ]);

  const queries: PlannedQuery[] = planned.queries.map((q) => ({
    id: randomUUID(),
    query: q.query,
    rationale: q.rationale,
    channels: q.channels,
  }));

  const carriedSources: Source[] = additional?.carryOverApprovedIds
    ? additional.carryOverApprovedIds.map((id) => ({
        id,
        kind: id.startsWith("wiki:") ? "wiki" : "fetched",
        title: "(carried over)",
      }))
    : [];

  await dispatchResearchIteration(
    { iteration: 0, status: "planned", queryCount: queries.length },
    config,
  );

  const update: ResearchLoopStateUpdate = {
    queries,
    maxIterations,
    iteration: 0,
    lastEvaluation: null,
    exitReason: null,
    phase: "research:plan",
    // Consume the additional-research seed so a subsequent re-plan inside the
    // same session (defensive) does not loop on the same instruction.
    // 追加調査リクエストは 1 度読んだら null にクリアする。
    additionalRequest: null,
  };
  if (additional) {
    // Additional-research re-run: reset accumulators except for explicit carryover.
    update.pendingSources = carriedSources;
  }
  return update;
}
