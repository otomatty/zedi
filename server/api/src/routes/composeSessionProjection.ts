/**
 * Project LangGraph checkpoint state into Compose UI slices (#950).
 *
 * `GET /compose-sessions/:id` が interrupted / completed 行を再開するとき、
 * チェックポイントから Brief 質問・アウトライン等を復元する。
 *
 * Maps persisted graph state (including `__interrupt__`) into a JSON shape the
 * frontend hook can merge without replaying `POST /run`.
 */
import { GRAPH_CONTEXT_CONFIG_KEY } from "../agents/core/types/graphContext.js";
import type { GraphContext } from "../agents/core/types/graphContext.js";
import { resolveCheckpointerForRun } from "../agents/core/checkpoint/index.js";
import { getRegisteredGraph } from "../agents/registry/graphRegistry.js";
import type { WikiComposeSessionStatus } from "../schema/wikiComposeSessions.js";

/**
 * `GET /compose-sessions/:id` が返す UI projection。
 * Wire projection returned by `GET /compose-sessions/:id`.
 */
export interface ComposeSessionUiProjection {
  phase?: string;
  briefQuestions?: unknown[];
  pageSnapshot?: unknown;
  pendingSources?: unknown[];
  latestBatch?: unknown;
  approvedSources?: unknown[];
  /** P5 conflict-resolution interrupt summary (#953). / P5 conflict-resolution 割り込み要約。 */
  researchConflictSummary?: unknown;
  outlineProposal?: unknown[];
  draftedSections?: unknown[];
  completedMarkdown?: string | null;
  /** Understanding Layer scaffolds (TL;DR / key terms / questions). */
  comprehensionAids?: unknown;
}

function phaseFromSessionRow(phase: string, status: WikiComposeSessionStatus): string {
  if (status === "completed") return "completed";
  if (phase.startsWith("brief")) return "brief";
  if (phase.startsWith("research")) return "research";
  if (phase.startsWith("conflict")) return "conflict";
  if (phase.startsWith("structure")) return "structure";
  if (phase.startsWith("draft")) return "draft";
  return "brief";
}

/**
 * Build UI projection from a LangGraph state snapshot (values + interrupts).
 */
export function projectComposeStateValues(
  state: Record<string, unknown>,
): ComposeSessionUiProjection {
  const projection: ComposeSessionUiProjection = {};

  if (Array.isArray(state.briefQuestions)) {
    projection.briefQuestions = state.briefQuestions;
  }
  if (state.pageSnapshot && typeof state.pageSnapshot === "object") {
    projection.pageSnapshot = state.pageSnapshot;
  }
  if (Array.isArray(state.pendingSources)) {
    projection.pendingSources = state.pendingSources;
  }
  if (Array.isArray(state.batches) && state.batches.length > 0) {
    projection.latestBatch = state.batches[state.batches.length - 1];
  }
  if (Array.isArray(state.approvedResearch)) {
    projection.approvedSources = state.approvedResearch;
  }
  if (Array.isArray(state.outlineProposal) && state.outlineProposal.length > 0) {
    projection.outlineProposal = state.outlineProposal;
  } else {
    const approved = state.approvedOutline as { sections?: unknown[] } | undefined;
    if (approved?.sections?.length) {
      projection.outlineProposal = approved.sections;
    }
  }

  if (Array.isArray(state.draftedSections) && state.draftedSections.length > 0) {
    projection.draftedSections = state.draftedSections;
  }

  const completion = state.completion;
  if (completion && typeof completion === "object") {
    const c = completion as {
      markdown?: string;
      sections?: unknown[];
      comprehensionAids?: unknown;
    };
    if (typeof c.markdown === "string") {
      projection.completedMarkdown = c.markdown;
    }
    if (Array.isArray(c.sections)) {
      projection.draftedSections = c.sections;
    }
    if (c.comprehensionAids && typeof c.comprehensionAids === "object") {
      projection.comprehensionAids = c.comprehensionAids;
    }
  }
  // Fallback to the standalone state channel when completion isn't built yet.
  if (
    projection.comprehensionAids === undefined &&
    state.comprehensionAids &&
    typeof state.comprehensionAids === "object"
  ) {
    projection.comprehensionAids = state.comprehensionAids;
  }

  const interrupts = state.__interrupt__;
  if (Array.isArray(interrupts) && interrupts.length > 0) {
    const entry = interrupts[0];
    const value =
      entry && typeof entry === "object" ? (entry as { value?: unknown }).value : undefined;
    if (value && typeof value === "object" && "kind" in value) {
      const payload = value as {
        kind: string;
        questions?: unknown[];
        pageSnapshot?: unknown;
        batch?: unknown;
        pendingSources?: unknown[];
        outline?: unknown[];
        approvedSources?: unknown[];
        conflicts?: unknown;
      };
      switch (payload.kind) {
        case "human_review_brief":
          if (payload.questions) projection.briefQuestions = payload.questions;
          if (payload.pageSnapshot) projection.pageSnapshot = payload.pageSnapshot;
          projection.phase = "brief";
          break;
        case "human_review_research":
          if (payload.batch) projection.latestBatch = payload.batch;
          if (payload.pendingSources) projection.pendingSources = payload.pendingSources;
          projection.phase = "research";
          break;
        case "human_review_outline":
          if (payload.outline) projection.outlineProposal = payload.outline;
          if (payload.approvedSources) projection.approvedSources = payload.approvedSources;
          projection.phase = "structure";
          break;
        case "conflict_resolution":
          if (payload.conflicts) projection.researchConflictSummary = payload.conflicts;
          if (Array.isArray(state.approvedResearch)) {
            projection.approvedSources = state.approvedResearch;
          }
          projection.phase = "conflict";
          break;
        default:
          break;
      }
    }
  }

  // Interrupt-derived phase wins; row `phase` is only a fallback.
  // interrupt 由来の phase を優先し、行の phase はフォールバックのみ。
  if (typeof state.phase === "string" && projection.phase === undefined) {
    projection.phase = state.phase.startsWith("completed")
      ? "completed"
      : phaseFromSessionRow(state.phase, "interrupted");
  }

  return projection;
}

/**
 * チェックポイントから UI projection を読み込む。利用不可時は `null`。
 * Load checkpoint projection for a compose session row, or `null` when unavailable.
 */
export async function loadComposeSessionProjection(input: {
  sessionId: string;
  pageId: string;
  graphId: string;
  status: WikiComposeSessionStatus;
  phase: string;
  context: GraphContext;
}): Promise<ComposeSessionUiProjection | null> {
  if (input.status !== "interrupted" && input.status !== "completed" && input.status !== "failed") {
    return null;
  }

  const checkpointer = await resolveCheckpointerForRun();
  if (checkpointer === false) return null;

  const registered = getRegisteredGraph(input.graphId);
  if (!registered) return null;

  const graph = registered.factory({ checkpointer }) as {
    getState?: (config: unknown) => Promise<{ values?: Record<string, unknown> } | undefined>;
  };
  if (typeof graph.getState !== "function") return null;

  const config = {
    configurable: {
      thread_id: input.sessionId,
      [GRAPH_CONTEXT_CONFIG_KEY]: input.context,
    },
  };

  try {
    const snap = await graph.getState(config);
    const values = snap?.values;
    if (!values || typeof values !== "object") return null;
    const projection = projectComposeStateValues(values);
    if (!projection.phase) {
      projection.phase = phaseFromSessionRow(input.phase, input.status);
    }
    return projection;
  } catch {
    return null;
  }
}
