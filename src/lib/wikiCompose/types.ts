/**
 * Wiki Compose wire types — frontend mirror of `server/api/src/agents/...`
 * (#950).
 *
 * Compose session のクライアント側 wire 型。バックエンドの `sseEvents.ts` と
 * `graphs/wikiCompose/types.ts` を 1:1 にミラーする。サーバー側を変更したら
 * 本ファイルも追随する（drift 検知テストはまだ自動化していない）。
 *
 * Mirrors the backend wire shapes so the React layer can pattern-match
 * without doing structural type guards everywhere. Keep this file
 * dependency-free so it's safe to import from anywhere in the app.
 */

// ── Page snapshot ──────────────────────────────────────────────────────────
export interface PageSnapshot {
  pageId: string;
  title: string;
  body: string;
  hasContent: boolean;
}

// ── Brief phase ────────────────────────────────────────────────────────────
export interface BriefOption {
  id: string;
  label: string;
  hint?: string;
}

export interface BriefQuestion {
  id: string;
  question: string;
  rationale?: string;
  options: BriefOption[];
  required: boolean;
}

export interface BriefAnswer {
  questionId: string;
  selectedOptionIds: string[];
  freeText?: string;
}

export interface BriefResult {
  answers: BriefAnswer[];
  summary: string;
  appendToExisting: boolean;
}

// ── Research sources (subset of backend `Source`) ──────────────────────────
export interface ResearchSource {
  id: string;
  kind: "web" | "wiki" | "fetched";
  title: string;
  url?: string;
  finalUrl?: string;
  snippet?: string;
  excerpt?: string;
  pageId?: string;
  noteId?: string;
}

export interface ResearchBatch {
  id: string;
  iteration: number;
  sources: ResearchSource[];
  // The full evaluation lives in state; the wire event carries only summary
  // fields, but the interrupt payload may include it.
  evaluation?: {
    score: number;
    rationale: string;
    missingAspects: string[];
  } | null;
  createdAt: string;
}

// ── Structure / draft ──────────────────────────────────────────────────────
export interface OutlineSection {
  id: string;
  heading: string;
  depth: number;
  intent: string;
  sourceIds?: string[];
}

export interface DraftedSection {
  sectionId: string;
  heading: string;
  body: string;
  citedSourceIds: string[];
  completedAt: string;
}

// ── Compose session row (REST shape from POST/GET) ─────────────────────────
export type ComposeSessionStatus =
  | "pending"
  | "running"
  | "interrupted"
  | "completed"
  | "cancelled"
  | "failed";

export interface ComposeSession {
  id: string;
  pageId: string;
  userId: string;
  graphId: string;
  backend: string;
  phase: string;
  status: ComposeSessionStatus;
  metadata?: Record<string, unknown> | null;
  lastError?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Checkpoint projection returned by `GET /compose-sessions/:id` for reload (#950).
 * チェックポイントから復元した UI 用スライス。
 */
/**
 * Summary shown at the P5 `conflict_resolution` interrupt (#953).
 * P5 `conflict_resolution` 割り込みで表示する要約。
 */
export interface ResearchConflictSummary {
  approved: Array<{ id: string; title: string }>;
  rejected: Array<{ id: string; title: string }>;
  rationale: string;
}

export interface ComposeSessionUiProjection {
  phase?: "brief" | "research" | "conflict" | "structure" | "draft" | "completed";
  briefQuestions?: BriefQuestion[];
  pageSnapshot?: PageSnapshot;
  pendingSources?: ResearchSource[];
  latestBatch?: ResearchBatch | null;
  approvedSources?: ResearchSource[];
  researchConflictSummary?: ResearchConflictSummary;
  outlineProposal?: OutlineSection[];
  draftedSections?: DraftedSection[];
  completedMarkdown?: string | null;
}

// ── Interrupt payloads (discriminated union) ───────────────────────────────
export type ComposeInterruptPayload =
  | {
      kind: "human_review_brief";
      questions: BriefQuestion[];
      pageSnapshot: PageSnapshot;
    }
  | {
      kind: "human_review_research";
      batch: ResearchBatch | null;
      pendingSources: ResearchSource[];
    }
  | {
      kind: "human_review_outline";
      outline: OutlineSection[];
      approvedSources: ResearchSource[];
    }
  | {
      kind: "conflict_resolution";
      conflicts: ResearchConflictSummary;
    };

// ── SSE event union (mirrors backend `SseEvent`) ───────────────────────────
export type ComposeSseEvent =
  | { type: "started"; sessionId: string; graphId: string; phase?: string }
  | { type: "status"; phase: string; message?: string }
  | { type: "token"; node?: string; content: string }
  | { type: "tool_start"; tool: string; input?: Record<string, unknown> }
  | { type: "tool_end"; tool: string; outputLength?: number; error?: string }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      costUnits: number;
      usagePercent: number;
    }
  | { type: "interrupt"; payload?: ComposeInterruptPayload }
  | { type: "done"; status: "completed" | "interrupted" | "failed" }
  | { type: "error"; message: string; retryable?: boolean }
  | {
      type: "research_iteration";
      iteration: number;
      status: "planned" | "refined";
      queryCount: number;
    }
  | {
      type: "research_evaluation";
      iteration: number;
      score: number;
      rationale: string;
      missingAspectsCount: number;
    }
  | {
      type: "research_batch";
      batchId: string;
      iteration: number;
      sourceCount: number;
      score: number | null;
      exitReason: "score_threshold" | "max_iterations";
    }
  | {
      type: "compose_phase";
      phase: "brief" | "research" | "conflict" | "structure" | "draft" | "completed";
      status: "entered" | "completed";
    }
  | {
      type: "compose_section";
      sectionId: string;
      heading: string;
      status: "started" | "completed";
      index: number;
      total: number;
    };

/** Convenience tag for the orchestrator graph id used by the frontend. */
export const WIKI_COMPOSE_GRAPH_ID = "wiki-compose";
