/**
 * `ResearchLoopState` — LangGraph state for the Wiki Compose research loop (#949).
 *
 * 調査ループ subgraph の state。`BaseState` を継承し、ループ制御 (`iteration`,
 * `maxIterations`, `exitReason`)、調査結果 (`pendingSources`, `batches`)、評価
 * (`lastEvaluation`)、HITL 結果 (`approvedResearch`, `rejectedResearch`) を持つ。
 *
 * Extends `BaseState` with loop control, accumulated sources, evaluation, and
 * post-interrupt human review output. Reducers favour idempotency:
 * - `pendingSources` merges by stable `Source.id` so refining the same URL
 *   upgrades it in place from `kind:"web"` to `kind:"fetched"` instead of
 *   doubling.
 * - `batches` appends so the frontend can show a full history.
 * - All scalar fields use `next ?? prev` so partial updates don't blank state.
 */
import { Annotation } from "@langchain/langgraph";
import { BaseState } from "../../core/state/baseState.js";
import { RESEARCH_SAFETY_MAX_ITERATIONS } from "./constants.js";
import type {
  AdditionalResearchRequest,
  Evaluation,
  ExitReason,
  PlannedQuery,
  ResearchBatch,
  Source,
} from "./types.js";

/**
 * `pendingSources` 用 reducer。id 単位で dedup し、後勝ちで上書きする。
 * fetch_articles が `web` → `fetched` への昇格をした際にも、同じ id で送ると
 * 1 行にまとまる。
 *
 * Merge sources by `id` with last-write-wins semantics so the loop can upgrade
 * a `kind:"web"` row to `kind:"fetched"` without duplication. Order is
 * preserved by first appearance.
 */
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

/**
 * Research loop state schema. Subgraph nodes update slices of this.
 *
 * 調査ループ state スキーマ。各ノードがこの slice を返して更新する。
 */
export const ResearchLoopState = Annotation.Root({
  ...BaseState.spec,

  /** 現在のループ回数（0 基点。`evaluate_sufficiency` で +1）。 */
  iteration: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  /** ループ回数上限。ingest が 1..5 を明示した場合はその cap、それ以外は安全上限。 */
  maxIterations: Annotation<number>({
    reducer: (prev, next) => next ?? prev,
    default: () => RESEARCH_SAFETY_MAX_ITERATIONS,
  }),
  /** 直近のクエリリスト。`plan_queries` / `refine_queries` が全置換する。 */
  queries: Annotation<PlannedQuery[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  /** 蓄積ソース。`mergeSourcesById` で dedup マージ。 */
  pendingSources: Annotation<Source[]>({
    reducer: mergeSourcesById,
    default: () => [],
  }),
  /** 直近の評価。 */
  lastEvaluation: Annotation<Evaluation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  /** 終了理由。 */
  exitReason: Annotation<ExitReason | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  /** 各ループの compile_batch スナップショット。append。 */
  batches: Annotation<ResearchBatch[]>({
    reducer: (prev, next) => (next === undefined ? prev : [...prev, ...next]),
    default: () => [],
  }),
  /** 採用ソース。`human_review_research` が resume 値から projection する。 */
  approvedResearch: Annotation<Source[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  /** 除外ソース。 */
  rejectedResearch: Annotation<Source[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  /**
   * 追加調査リクエスト。`POST /run` の `body.input.kind === "additional_research"`
   * を route 層が詰め直す（LangGraph は未定義の top-level input キーを落とすため
   * 仲介フィールドが必要）。`plan_queries` が消費後 `null` にクリアする。
   *
   * Additional-research seed populated by the route from `body.input`; cleared
   * to null by `plan_queries` after one read.
   */
  additionalRequest: Annotation<AdditionalResearchRequest | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
});

/** `ResearchLoopState.State` のショートカット。 */
export type ResearchLoopStateType = typeof ResearchLoopState.State;

/** `ResearchLoopState.Update` のショートカット。ノードの戻り値型。 */
export type ResearchLoopStateUpdate = typeof ResearchLoopState.Update;
