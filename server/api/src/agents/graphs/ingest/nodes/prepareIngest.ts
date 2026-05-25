/**
 * `prepare_ingest` — seeds article / candidates and messages for the research loop.
 *
 * `POST /api/ingest/graph/run` の input を state に投影し、続く
 * `researchLoopSubgraph`（共有ノード配線）が参照する `messages` を組み立てる。
 */
import { HumanMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import type { IngestPlannerStateType, IngestPlannerStateUpdate } from "../state.js";

function clampMaxIterations(raw: number): number {
  if (!Number.isFinite(raw)) return 3;
  const truncated = Math.trunc(raw);
  return Math.min(Math.max(truncated, 1), 5);
}

/**
 * Project graph run input into ingest + research seed state.
 *
 * LangGraph merges `POST /run` input keys that match state annotations (`article`,
 * `candidates`, `userSchema`, `maxIterations`) before this node runs.
 */
export async function prepareIngest(
  state: IngestPlannerStateType,
  config: LangGraphRunnableConfig,
): Promise<IngestPlannerStateUpdate> {
  const ctx = getGraphContext(config);

  const article = state.article;
  if (!article?.title?.trim() || !article.url?.trim()) {
    throw new Error("prepare_ingest: article { title, url, excerpt } is required");
  }

  const candidates = state.candidates;
  const userSchema = state.userSchema;
  const maxIterations = clampMaxIterations(state.maxIterations);

  const candidateBlock =
    candidates.length === 0
      ? "(no candidates)"
      : candidates
          .map(
            (c, i) =>
              `[${i + 1}] id=${c.id}\n    title: ${c.title}\n    excerpt: ${c.excerpt.slice(0, 400)}`,
          )
          .join("\n\n");

  const brief = [
    "[Ingest clip]",
    `title: ${article.title}`,
    `url: ${article.url}`,
    "",
    "excerpt:",
    article.excerpt.slice(0, 4000),
    "",
    "## CANDIDATES",
    candidateBlock,
  ].join("\n");

  return {
    article,
    candidates,
    userSchema,
    maxIterations,
    userId: ctx.userId,
    pageId: ctx.pageId,
    phase: "ingest:prepare",
    messages: [new HumanMessage(brief)],
  };
}
