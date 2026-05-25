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
 * - `src:<sha256(url)>` — web / fetched で **共通** に使う。同じ URL を後段で
 *   Readability に通すと、reducer (`mergeSourcesById`) が新値で上書きして
 *   `kind: "web"` → `kind: "fetched"` にインプレース昇格する。リダイレクト後の
 *   `finalUrl` は別フィールド (`finalUrl`) に格納し、id は常に **元 URL** の
 *   sha256 で安定させる（codex review #956: URL 正規化の問題対策）。
 * - `wiki:<pageId>` — Wiki ページ。pageId 自体が安定 ID なので hash は不要。
 *
 * A single research source. Web and fetched share the SAME `id` scheme
 * (`src:<sha256(originalUrl)>`) so the reducer dedups them across iterations
 * — fetched literally overwrites the matching web row by id. `finalUrl` is
 * stored separately so redirect / canonicalisation does not break dedup
 * (codex review #956).
 */
export interface Source {
  /** Stable id (`src:<sha256(url)>` for web/fetched, `wiki:<pageId>` for wiki). */
  id: string;
  /** Discriminator. `fetched` upgrades `web` after Readability succeeds. */
  kind: "web" | "wiki" | "fetched";
  /** Human-readable title. */
  title: string;
  /**
   * Original URL of the search hit. Present for `web` / `fetched`.
   * Stable across the loop — `id` is derived from this value, NOT from
   * `finalUrl`, so redirect URLs do not break id-based dedup.
   * 元の URL。`fetched` でも `finalUrl` ではなくこちらを id 計算に使う。
   */
  url?: string;
  /**
   * Post-redirect / Readability-resolved canonical URL.
   * Present only for `kind === "fetched"`. Used for display / citation; not
   * used for dedup so a redirect chain does not split a single article into
   * two state rows.
   * リダイレクト後の URL（表示・引用用、dedup には使わない）。
   */
  finalUrl?: string;
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
export type ExitReason =
  | "score_threshold"
  | "max_iterations"
  | "manual_stop"
  /** Orchestrator skipped the research loop after Brief (#953). */
  | "brief_skip";

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

/**
 * 追加調査リクエスト。`POST /run` の `body.input.kind === "additional_research"`
 * を route 層が `state.additionalRequest` に詰め替えて graph に渡す。
 * `plan_queries` が消費した後 `null` にクリアする。
 *
 * Additional-research seed. The route translates the documented
 * `body.input.kind === "additional_research"` payload into this field so
 * `plan_queries` can detect it from state (LangGraph drops unknown top-level
 * input keys, so a free-form `kind` field would not survive the boundary).
 * Cleared to `null` after `plan_queries` consumes it.
 */
export interface AdditionalResearchRequest {
  instruction: string;
  carryOverApprovedIds?: string[];
  brief?: string;
}
