/**
 * Shared value types for the Wiki Compose orchestrator graph (#950 / P2).
 *
 * Wiki Compose 全体グラフが扱う値型。
 * `WikiComposeState` (state.ts) と各ノードが参照する。
 *
 * Pure data types referenced by `WikiComposeState` and the orchestrator nodes.
 * Kept separate from `Annotation.Root` so non-LangGraph modules (frontend
 * wire types, vitest fixtures) can import without pulling LangGraph runtime.
 */

import type { Source } from "../../subgraphs/research/types.js";

/** Re-exported here so orchestrator nodes can import everything from one barrel. */
export type { Source };

/**
 * Optional chat context seeded when entering Compose from AI Chat (#950).
 * Passed on the first graph `input` and stored on the session row metadata.
 */
export interface ComposeChatSeed {
  outline: string;
  conversationText: string;
  userSchema?: string;
  conversationId?: string;
}

/**
 * Brief フェーズで Orchestrator が生成する 1 つの構造化質問。
 *
 * One structured Brief question. Brief never opens a free-form chat; the
 * frontend renders this as a question card with selectable options + an
 * optional free-text addendum. `0..7` questions are emitted (the Orchestrator
 * decides; `0` means "skip Brief entirely").
 */
export interface BriefQuestion {
  /** Stable uuid. */
  id: string;
  /** Question text shown to the user. */
  question: string;
  /**
   * Optional rationale shown as helper text. Surfaced so the user understands
   * why each question matters.
   */
  rationale?: string;
  /**
   * Answer choices (option chips). When empty, the UI renders a single
   * free-text input. The frontend always allows a free-text addendum on top
   * of any chip selection.
   */
  options: BriefOption[];
  /** Whether the user MUST answer this question to proceed. */
  required: boolean;
}

/** One selectable option chip in a {@link BriefQuestion}. */
export interface BriefOption {
  /** Stable id within the question (used by the resume payload). */
  id: string;
  /** Display label. */
  label: string;
  /** Optional follow-up hint shown when this option is selected. */
  hint?: string;
}

/**
 * User's reply to a single Brief question. Resume payload value.
 *
 * Brief 質問への 1 件分の回答（resume payload の単位）。
 */
export interface BriefAnswer {
  /** Question id this answer responds to. */
  questionId: string;
  /** Selected option ids (may be empty when only free-text is provided). */
  selectedOptionIds: string[];
  /** Optional free-text addendum (always allowed). */
  freeText?: string;
}

/**
 * Aggregated Brief result projected into state after the user resumes.
 *
 * Brief 完了時に state に投影される確定回答セット。`structureDialogue` と
 * `researchPhase` がプロンプト構築時にここを読む。
 */
export interface BriefResult {
  /** Question/answer pairs in their original order. */
  answers: BriefAnswer[];
  /**
   * Free-form natural-language summary derived from the answers. Used by
   * downstream nodes so they do not have to re-traverse the Q&A pairs.
   */
  summary: string;
  /**
   * Optional addition mode flag — populated when the page already has body
   * content and the user chose "append" instead of "replace". The draft
   * phase reads this to decide whether to write into a fresh document or to
   * merge with the existing body.
   */
  appendToExisting: boolean;
}

/**
 * Page snapshot loaded at session start. Used by Brief to surface the
 * current page state and by Draft to know whether to append vs replace.
 *
 * セッション開始時に読み込むページのスナップショット。Brief / Draft が参照する。
 */
export interface PageSnapshot {
  pageId: string;
  /** Wiki page title. */
  title: string;
  /** Existing body markdown (may be empty). */
  body: string;
  /** True when `body.trim().length > 0`. */
  hasContent: boolean;
}

/**
 * Structure フェーズで生成された 1 つのアウトライン項目。
 *
 * Single outline node. The orchestrator emits a flat or 1-level nested list;
 * the frontend supports drag-and-drop reordering before approval.
 */
export interface OutlineSection {
  /** Stable uuid. */
  id: string;
  /** Section heading text (without `# ` prefix). */
  heading: string;
  /** Heading depth (1 = top-level h2, 2 = h3, …; the page title itself is h1). */
  depth: number;
  /**
   * Short description / what to cover. Surfaced as helper text in the outline
   * editor and consumed by the draft node as the section brief.
   */
  intent: string;
  /**
   * Optional list of source ids (from `approvedResearch`) that the user
   * marked as relevant for this section. Populated post-approval via the
   * outline resume payload.
   */
  sourceIds?: string[];
}

/**
 * Outline approved by the user via the `human_review_outline` interrupt.
 *
 * `humanReviewOutline` が resume payload を投影して作る。Draft フェーズが
 * 各セクションを順に LLM ストリームで書き起こす。
 */
export interface ApprovedOutline {
  /** Final ordered sections (after user edits). */
  sections: OutlineSection[];
}

/**
 * Section draft result. One per outline section, filled in by
 * `draft_sections` as it streams.
 *
 * 確定済みの 1 セクション分本文。各セクションは LLM トークンストリームで
 * 書き起こされ、確定後に本配列へ append される。
 */
export interface DraftedSection {
  /** Matches {@link OutlineSection.id}. */
  sectionId: string;
  /** Final heading (may differ if user renamed mid-flight). */
  heading: string;
  /** Final markdown body for the section (excluding the heading). */
  body: string;
  /** Source ids cited in this section (subset of `approvedResearch`). */
  citedSourceIds: string[];
  /** ISO timestamp when the section completed. */
  completedAt: string;
}

/**
 * Final compose output stamped onto state at the `completed` node.
 *
 * 完了時のサマリ。フロントは `/notes/:noteId/:pageId` に戻るときの最終本文を
 * ここから読む。
 */
export interface ComposeCompletion {
  /** Final markdown body (sections joined). */
  markdown: string;
  /** Sections in their final order. */
  sections: DraftedSection[];
  /** Approved sources collated for citation export. */
  citedSources: Source[];
  /** ISO timestamp at completion. */
  completedAt: string;
}

/**
 * Discriminated union of the values emitted by the orchestrator's interrupt
 * nodes. Surfaces on the wire as `SseInterruptEvent.payload`.
 *
 * 各 interrupt ノードが `interrupt(value)` で渡すペイロード。フロントは
 * `kind` で分岐して UI を出し分ける。
 */
export type WikiComposeInterruptPayload =
  | { kind: "human_review_brief"; questions: BriefQuestion[]; pageSnapshot: PageSnapshot }
  | { kind: "human_review_research"; batchId: string | null; pendingSources: Source[] }
  | { kind: "human_review_outline"; outline: OutlineSection[]; approvedSources: Source[] };

/**
 * Resume payloads expected at each interrupt point. Each is validated at the
 * node boundary via the matching zod schema in `resumeSchemas.ts`.
 *
 * 各 interrupt 点の resume payload TS 型。実体は zod で検証する。
 */
export interface BriefResumeInput {
  answers: BriefAnswer[];
  /** True when the user chose "append to existing body" (U2). */
  appendToExisting?: boolean;
  /** Optional override for the research loop's max iterations (1..5). */
  researchMaxIterations?: number;
}

/** Resume payload for the outline interrupt. */
export interface OutlineResumeInput {
  /** Final outline (reordered / edited by the user). */
  sections: OutlineSection[];
}
