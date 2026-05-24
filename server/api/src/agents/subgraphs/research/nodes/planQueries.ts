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
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { getGraphContext } from "./shared/getGraphContext.js";
import { dispatchResearchIteration } from "./shared/dispatchSseCustom.js";
import type {
  ResearchLoopStateType,
  ResearchLoopStateUpdate,
} from "../state.js";
import type { PlannedQuery, Source } from "../types.js";

/** Default LLM model id for plan/evaluate/refine nodes; overridable by env. */
const ORCHESTRATOR_MODEL_ENV = "WIKI_COMPOSE_ORCHESTRATOR_MODEL_ID";
const ORCHESTRATOR_MODEL_FALLBACK = "claude-3-5-haiku";

export function getOrchestratorModelId(): string {
  return process.env[ORCHESTRATOR_MODEL_ENV]?.trim() || ORCHESTRATOR_MODEL_FALLBACK;
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

/**
 * Input shape recognised when the node sees `state.messages[0].content` parses
 * as JSON with `kind === "additional_research"`. Drives the "re-run" branch.
 *
 * Carried-over IDs are projected into `pendingSources` as bare entries; the
 * full record will be re-materialised when the LLM re-plans.
 */
interface AdditionalResearchInput {
  kind: "additional_research";
  instruction: string;
  carryOverApprovedIds?: string[];
  /** Optional brief carryover so the LLM has full context. */
  brief?: string;
}

function tryParseAdditional(state: ResearchLoopStateType): AdditionalResearchInput | null {
  // Look for an explicit messages[0] payload of the additional_research shape.
  // We accept either a parsed object (LangGraph state can carry arbitrary
  // entries) or a stringified one — frontends may send either.
  // messages の最初のメッセージから additional_research 構造を取り出す。
  const first = state.messages?.[0];
  if (!first) return null;
  const raw = (first as { content?: unknown }).content;
  if (raw && typeof raw === "object" && (raw as { kind?: unknown }).kind === "additional_research") {
    return raw as AdditionalResearchInput;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === "additional_research"
      ) {
        return parsed as AdditionalResearchInput;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function clampMaxIterations(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 3;
  const truncated = Math.trunc(raw);
  return Math.min(Math.max(truncated, 1), 5);
}

function briefFromState(state: ResearchLoopStateType, additional: AdditionalResearchInput | null): string {
  if (additional) {
    const parts = [
      "[Additional research request]",
      additional.instruction,
    ];
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
  const additional = tryParseAdditional(state);
  const brief = briefFromState(state, additional);

  // Resolve maxIterations: input override > existing state > default(3); clamp 1..5.
  // maxIterations は既存 state を優先しつつ 1..5 にクランプ。
  const maxIterations = clampMaxIterations(state.maxIterations ?? 3);

  const model = await createZediChatModel({
    modelId: getOrchestratorModelId(),
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
    { role: "system", content: SYSTEM_PROMPT },
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
        kind: id.startsWith("wiki:")
          ? "wiki"
          : id.startsWith("fetched:")
            ? "fetched"
            : "web",
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
  };
  if (additional) {
    // Additional-research re-run: reset accumulators except for explicit carryover.
    update.pendingSources = carriedSources;
  }
  return update;
}
