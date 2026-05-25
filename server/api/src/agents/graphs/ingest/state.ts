/**
 * `IngestPlannerState` — LangGraph state for the Ingest planner graph (#952).
 *
 * `ResearchLoopState` の channel 群を superset として保持し、
 * `wireResearchLoopSubgraph` で P1 調査ループを組み込む。記事クリップ用の
 * `article` / `candidates` / `ingestPlan` を追加する。
 *
 * Extends research-loop channels so {@link wireResearchLoopSubgraph} can share
 * nodes with Compose. Adds ingest-specific fields for clip planning.
 */
import { Annotation } from "@langchain/langgraph";
import { BaseState } from "../../core/state/baseState.js";
import type {
  AdditionalResearchRequest,
  Evaluation,
  ExitReason,
  PlannedQuery,
  ResearchBatch,
  Source,
} from "../../subgraphs/research/types.js";
import type { CandidatePage, IngestArticleSummary, IngestPlan } from "./types.js";

function mergeSourcesById(prev: Source[], next: Source[] | undefined): Source[] {
  if (!next || next.length === 0) return prev;
  const order: string[] = [];
  const map = new Map<string, Source>();
  for (const s of prev) {
    if (!map.has(s.id)) order.push(s.id);
    map.set(s.id, s);
  }
  for (const s of next) {
    if (!map.has(s.id)) order.push(s.id);
    map.set(s.id, s);
  }
  return order.map((id) => map.get(id) as Source);
}

export const IngestPlannerState = Annotation.Root({
  ...BaseState.spec,

  // ── Ingest clip input ─────────────────────────────────────────────────────
  article: Annotation<IngestArticleSummary | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
  candidates: Annotation<CandidatePage[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  userSchema: Annotation<string | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
  ingestPlan: Annotation<IngestPlan | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),

  // ── Research mirror (matches ResearchLoopState) ───────────────────────────
  iteration: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (prev, next) => next ?? prev,
    default: () => 3,
  }),
  queries: Annotation<PlannedQuery[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  pendingSources: Annotation<Source[]>({
    reducer: mergeSourcesById,
    default: () => [],
  }),
  lastEvaluation: Annotation<Evaluation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  exitReason: Annotation<ExitReason | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  batches: Annotation<ResearchBatch[]>({
    reducer: (prev, next) => (next === undefined ? prev : [...prev, ...next]),
    default: () => [],
  }),
  approvedResearch: Annotation<Source[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  rejectedResearch: Annotation<Source[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  additionalRequest: Annotation<AdditionalResearchRequest | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
});

export type IngestPlannerStateType = typeof IngestPlannerState.State;
export type IngestPlannerStateUpdate = typeof IngestPlannerState.Update;
