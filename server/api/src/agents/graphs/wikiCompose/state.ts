/**
 * `WikiComposeState` — orchestrator-level LangGraph state for Wiki Compose
 * P2 (#950).
 *
 * Wiki Compose 全体グラフの state。`BaseState` (messages / phase / pageId /
 * userId) を継承しつつ、`ResearchLoopState` の channel 群 (`iteration` /
 * `pendingSources` / `approvedResearch` 等) を superset として保持することで、
 * 既存の `researchLoopSubgraph` をそのまま **subgraph as node** として組み込み、
 * state を自動的に共有させる。Brief / Structure / Draft の各フェーズ専用の
 * フィールド (`briefQuestions`, `brief`, `outlineProposal`, `approvedOutline`,
 * `draftedSections`, `completion`) を追加で持つ。
 *
 * Extends both `BaseState` and the research subgraph's channels so the compiled
 * research graph composes as a regular node (LangGraph maps state automatically
 * when channel names + reducers match). Each phase writes only to its own
 * slice; reducers are last-write-wins for scalars and id-keyed merge for arrays.
 *
 * Issue: otomatty/zedi#950
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
import type {
  ApprovedOutline,
  BriefQuestion,
  BriefResult,
  ComposeChatSeed,
  ComposeCompletion,
  DraftedSection,
  OutlineSection,
  PageSnapshot,
} from "./types.js";

/**
 * `pendingSources` 用 reducer。id 単位で dedup し、後勝ちで上書きする。
 * Source merge by id with last-write-wins; mirrors the research subgraph.
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
 * `draftedSections` 用 reducer。`sectionId` 単位で last-write-wins し、
 * 同じセクションを再ドラフトしたときに重複行が増えないようにする。
 *
 * Merge drafted sections by `sectionId`.
 */
function mergeSectionsById(
  prev: DraftedSection[],
  next: DraftedSection[] | undefined,
): DraftedSection[] {
  if (!next || next.length === 0) return prev;
  const order: string[] = [];
  const map = new Map<string, DraftedSection>();
  for (const s of prev) {
    if (!map.has(s.sectionId)) order.push(s.sectionId);
    map.set(s.sectionId, s);
  }
  for (const s of next) {
    if (!map.has(s.sectionId)) order.push(s.sectionId);
    map.set(s.sectionId, s);
  }
  return order.map((id) => map.get(id) as DraftedSection);
}

/**
 * Wiki Compose orchestrator state schema.
 *
 * Channel groups:
 * 1. `BaseState` — messages, phase, pageId, userId.
 * 2. Research mirror — superset of `ResearchLoopState` channels so the
 *    compiled research subgraph composes as a node and state flows through.
 * 3. Brief — `pageSnapshot`, `briefQuestions`, `brief`.
 * 4. Structure — `outlineProposal`, `approvedOutline`.
 * 5. Draft / completion — `draftedSections`, `completion`.
 */
export const WikiComposeState = Annotation.Root({
  ...BaseState.spec,

  // ── Brief phase ───────────────────────────────────────────────────────────
  /**
   * チャット由来 seed（outline + 会話）。AI Chat / Promote to Wiki からの
   * 初回 `POST /run` input でセットする (#950)。
   *
   * Chat → Compose seed (outline + conversation). Set on the first `POST /run`
   * input when the user arrives from AI Chat / Promote to Wiki (#950).
   */
  chatSeed: Annotation<ComposeChatSeed | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
  /** Page snapshot loaded once at session start. */
  pageSnapshot: Annotation<PageSnapshot | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
  /** Brief 質問群（0..7）。`briefDialogue` が一度だけ全置換する。 */
  briefQuestions: Annotation<BriefQuestion[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  /** Brief 確定結果。`humanReviewBrief` が resume payload を投影する。 */
  brief: Annotation<BriefResult | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),

  // ── Research mirror (matches ResearchLoopState exactly) ──────────────────
  /** 現在のループ回数（research subgraph が書く）。 */
  iteration: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  /** ループ上限（Brief で 1..5 にユーザー設定可、デフォルト 3）。 */
  maxIterations: Annotation<number>({
    reducer: (prev, next) => next ?? prev,
    default: () => 3,
  }),
  /** Research subgraph 内の直近クエリ。 */
  queries: Annotation<PlannedQuery[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  /** 蓄積調査ソース（research subgraph が書く）。 */
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
  /** 各ループの compile_batch スナップショット。 */
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
  /** 追加調査リクエスト（route 経由で投入）。 */
  additionalRequest: Annotation<AdditionalResearchRequest | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
  /**
   * P5 conflict-resolution marker. Populated before `conflict_resolution` interrupt;
   * cleared on resume. Routing uses `rejectedResearch` counts; this channel is for
   * future explicit conflict metadata from evaluate / resume payloads.
   *
   * P5 矛盾解消用マーカー。将来 evaluate や resume から明示的な矛盾リストを載せる。
   */
  researchConflicts: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  // ── Structure phase ──────────────────────────────────────────────────────
  /** Orchestrator が提案する初期アウトライン。 */
  outlineProposal: Annotation<OutlineSection[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  /** ユーザー承認後の確定アウトライン。 */
  approvedOutline: Annotation<ApprovedOutline | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),

  // ── Draft / completion ───────────────────────────────────────────────────
  /** 確定済みセクション本文。`draftSections` が 1 セクションずつ append する。 */
  draftedSections: Annotation<DraftedSection[]>({
    reducer: mergeSectionsById,
    default: () => [],
  }),
  /** 完了サマリ。`completed` ノードが書く。 */
  completion: Annotation<ComposeCompletion | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
});

/** `WikiComposeState.State` のショートカット。 */
export type WikiComposeStateType = typeof WikiComposeState.State;

/** `WikiComposeState.Update` のショートカット。ノードの戻り値型。 */
export type WikiComposeStateUpdate = typeof WikiComposeState.Update;
