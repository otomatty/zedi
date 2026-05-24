/**
 * Shared value types for the Wiki Compose research loop subgraph (#949).
 *
 * 調査ループ subgraph の値型。`ResearchLoopState`（{@link ./state.ts}）の
 * 各フィールドが参照する。
 *
 * Pure data types referenced by `ResearchLoopState`. Kept separate from the
 * `Annotation.Root` definition so node modules can import the types without
 * pulling LangGraph's runtime symbols into their compilation graph.
 */

/**
 * 1 ソースを表す軽量レコード。Web 検索結果 / Wiki 検索結果 / Readability で
 * 取得した記事本文プレビュー、いずれも同じ shape にまとめる。
 *
 * `id` は安定する単一値で、reducer が dedup するキーになる:
 * - `web:<sha256(url)>`
 * - `wiki:<pageId>`
 * - `fetched:<sha256(finalUrl)>`
 *
 * `kind` は同 id で `web` → `fetched` に遷移可能（reducer は新値で上書き）。
 *
 * A single research source. The same shape covers web search hits, internal
 * wiki search hits, and Readability-extracted articles so the reducer can
 * dedup across iterations via a stable `id`.
 */
export interface Source {
  /** Stable id (`web:<sha>`, `wiki:<pageId>`, `fetched:<sha>`). */
  id: string;
  /** Discriminator. `fetched` upgrades `web` after Readability succeeds. */
  kind: "web" | "wiki" | "fetched";
  /** Human-readable title. */
  title: string;
  /** Present for `web` / `fetched`. */
  url?: string;
  /** Snippet from the search result (pre-fetch). */
  snippet?: string;
  /** Readability excerpt (post-fetch). Populated for `kind === "fetched"`. */
  excerpt?: string;
  /** Internal wiki page id. Populated for `kind === "wiki"`. */
  pageId?: string;
  /** Internal wiki note id. Populated for `kind === "wiki"`. */
  noteId?: string;
  /** Content hash (sha256 of body). Populated for `kind === "fetched"`. */
  contentHash?: string;
  /** ISO timestamp. Populated for `kind === "fetched"`. */
  fetchedAt?: string;
}

/**
 * Orchestrator LLM が組み立てた 1 つの調査クエリ。
 * `channels` は web / wiki どちらに投げるかを指定する。
 *
 * A single planned research query. `channels` decides which search node(s)
 * the query is dispatched to.
 */
export interface PlannedQuery {
  /** Stable uuid for traceability. */
  id: string;
  /** Free-form query string. */
  query: string;
  /** Optional model rationale; surfaced for debug only. */
  rationale?: string;
  /** Dispatch channels. Non-empty. */
  channels: Array<"web" | "wiki">;
}

/**
 * `evaluate_sufficiency` ノードの出力。`score >= 0.75` で `compile_batch` 側へ
 * 分岐する（{@link ./researchGraph.ts} の `shouldRefine`）。
 *
 * Output of `evaluate_sufficiency`. The conditional edge uses
 * `score >= 0.75` as the exit predicate.
 */
export interface Evaluation {
  /** 0..1. ≥ 0.75 → exit; otherwise refine. */
  score: number;
  /** Short natural-language rationale for the score. */
  rationale: string;
  /** Up to 5 short labels for what's still missing. */
  missingAspects: string[];
}

/**
 * `compile_batch` が組み立てる UI 提示用のバッチ。1 ループぶんのスナップショット。
 *
 * UI-facing batch produced by `compile_batch`. One per loop iteration; the
 * frontend reads the latest one when the graph interrupts at
 * `human_review_research`.
 */
export interface ResearchBatch {
  /** Stable uuid. */
  id: string;
  /** Iteration index that produced this batch (0-based). */
  iteration: number;
  /** Queries that were dispatched in this iteration. */
  queries: PlannedQuery[];
  /** Snapshot of `pendingSources` at compile time. */
  sources: Source[];
  /** Last evaluation. `null` only if compile is forced before any evaluate. */
  evaluation: Evaluation | null;
  /** ISO timestamp at compile time. */
  createdAt: string;
}

/**
 * ループ終了理由。`compile_batch` で確定し、HITL に渡される。
 *
 * Reason the loop exited; set by `compile_batch`.
 */
export type ExitReason = "score_threshold" | "max_iterations" | "manual_stop";

/**
 * `human_review_research` ノードが期待する resume payload の TS 型。
 * 実体は `resumeSchema.ts` の zod で検証する。
 *
 * TS shape of the resume payload accepted by `human_review_research`. The
 * runtime validator lives in `resumeSchema.ts`.
 */
export interface ResearchResumeInput {
  approvedSourceIds: string[];
  rejectedSourceIds?: string[];
  note?: string;
}
