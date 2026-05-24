/**
 * `evaluate_sufficiency` — scores the current `pendingSources` against the
 * brief, post-increments `iteration`, and emits a `research_evaluation` SSE
 * custom event.
 *
 * 現在の `pendingSources` が brief を満たしているかを LLM で評価し、
 * `score` (0..1) と `missingAspects` を返す。post-increment した `iteration`
 * を返すことで、後段の `shouldRefine` がループ終了条件
 * (`score >= 0.75 || iteration >= maxIterations`) を正しく判定できる。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { getGraphContext } from "./shared/getGraphContext.js";
import { dispatchResearchEvaluation } from "./shared/dispatchSseCustom.js";
import { getOrchestratorModelId } from "./planQueries.js";
import type { ResearchLoopStateType, ResearchLoopStateUpdate } from "../state.js";
import type { Evaluation } from "../types.js";

export const evaluationSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string().min(1).max(500),
  missingAspects: z.array(z.string().min(1)).max(5),
});

const SYSTEM_PROMPT =
  "You are evaluating whether the research sources collected so far are sufficient " +
  "to write the requested wiki article. Score 0..1 (≥0.75 means 'good enough'), " +
  "give a short rationale, and list up to 5 missing aspects. Output JSON only.";

function buildUserPrompt(state: ResearchLoopStateType): string {
  const brief = state.messages
    .map((m) => {
      const raw = (m as { content?: unknown }).content;
      return typeof raw === "string" ? raw : "";
    })
    .filter((s) => s.length > 0)
    .join("\n\n");
  const sourceLines = state.pendingSources.map((s, i) => {
    const tag = s.kind === "fetched" ? "FETCHED" : s.kind === "wiki" ? "WIKI" : "WEB";
    const body = s.excerpt ?? s.snippet ?? "(no preview)";
    return `[${i + 1}] ${tag} ${s.title}\n${body}`;
  });
  return [
    "[Brief]",
    brief || "(empty brief — assume general coverage)",
    "",
    `[Sources collected: ${state.pendingSources.length}]`,
    ...sourceLines,
    "",
    `Iteration so far: ${state.iteration} / ${state.maxIterations}`,
  ].join("\n");
}

export async function evaluateSufficiency(
  state: ResearchLoopStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchLoopStateUpdate> {
  const ctx = getGraphContext(config);

  const model = await createZediChatModel({
    modelId: getOrchestratorModelId(),
    userId: ctx.userId,
    tier: ctx.tier,
    db: ctx.db,
    feature: `${ctx.feature}:evaluate`,
    backend: ctx.backend,
    temperature: 0.1,
    // 1024 leaves enough room for a verbose `rationale` + `missingAspects`
    // array without truncating mid-JSON (gemini review #956).
    maxTokens: 1024,
  });
  const structured = model.withStructuredOutput(evaluationSchema, {
    name: "research_evaluation",
  });
  const parsed = await structured.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(state) },
  ]);
  const evaluation: Evaluation = {
    score: parsed.score,
    rationale: parsed.rationale,
    missingAspects: parsed.missingAspects,
  };
  const nextIteration = state.iteration + 1;

  await dispatchResearchEvaluation(
    {
      iteration: nextIteration,
      score: evaluation.score,
      rationale: evaluation.rationale,
      missingAspectsCount: evaluation.missingAspects.length,
    },
    config,
  );

  return {
    lastEvaluation: evaluation,
    iteration: nextIteration,
    phase: "research:evaluated",
  };
}
