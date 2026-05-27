/**
 * Pure state reduction for {@link useWikiComposeSession} (#950).
 * SSE / resume / projection → UI state。React 非依存。
 */
import i18n from "@/i18n";
import { resolveComposeContentLocale } from "@/lib/wikiCompose/resolveComposeContentLocale";
import type {
  BriefQuestion,
  ComposeInterruptPayload,
  ComposeSession,
  ComposeSessionStatus,
  ComposeSessionUiProjection,
  ComposeSseEvent,
  DraftedSection,
  OutlineSection,
  PageSnapshot,
  ResearchBatch,
  ResearchConflictSummary,
  ResearchSource,
} from "@/lib/wikiCompose/types";

/** UI phase for Wiki Compose session progression. */
export type ComposePhase = "brief" | "research" | "conflict" | "structure" | "draft" | "completed";

/** Activity log entry surfaced in the right pane's ActivitySection. */
export interface ComposeActivity {
  id: string;
  at: string;
  label: string;
  detail?: string;
  status?: "started" | "completed" | "info" | "error";
}

/** Aggregate state surfaced to the UI. */
export interface WikiComposeSessionState {
  session: ComposeSession | null;
  status: ComposeSessionStatus | "idle";
  phase: ComposePhase;
  briefQuestions: BriefQuestion[];
  pageSnapshot: PageSnapshot | null;
  latestBatch: ResearchBatch | null;
  pendingSources: ResearchSource[];
  approvedSources: ResearchSource[];
  researchConflictSummary: ResearchConflictSummary | null;
  outlineProposal: OutlineSection[];
  draftedSections: Record<string, DraftedSection>;
  streamingSectionId: string | null;
  sectionBuffers: Record<string, string>;
  activity: ComposeActivity[];
  completedMarkdown: string | null;
  error: string | null;
  isStreaming: boolean;
}

export const INITIAL_WIKI_COMPOSE_SESSION_STATE: WikiComposeSessionState = {
  session: null,
  status: "idle",
  phase: "brief",
  briefQuestions: [],
  pageSnapshot: null,
  latestBatch: null,
  pendingSources: [],
  approvedSources: [],
  researchConflictSummary: null,
  outlineProposal: [],
  draftedSections: {},
  streamingSectionId: null,
  sectionBuffers: {},
  activity: [],
  completedMarkdown: null,
  error: null,
  isStreaming: false,
};

/** First interrupt kind on a LangGraph checkpoint output, if any. */
export function interruptKindFromOutput(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const interrupts = (output as { __interrupt__?: unknown }).__interrupt__;
  if (!Array.isArray(interrupts) || interrupts.length === 0) return undefined;
  const entry = interrupts[0];
  const value =
    entry && typeof entry === "object" ? (entry as { value?: unknown }).value : undefined;
  if (value && typeof value === "object" && "kind" in value) {
    const kind = (value as { kind?: unknown }).kind;
    return typeof kind === "string" ? kind : undefined;
  }
  return undefined;
}

/**
 * Validate persisted `metadata.composeSeed` before sending `/run` input.
 */
export function parseComposeSeedFromMetadata(metadata: Record<string, unknown> | null | undefined):
  | {
      outline: string;
      conversationText: string;
      userSchema?: string;
      conversationId?: string;
    }
  | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const raw = metadata.composeSeed;
  if (!raw || typeof raw !== "object") return undefined;
  const seed = raw as Record<string, unknown>;
  if (typeof seed.outline !== "string" || typeof seed.conversationText !== "string") {
    return undefined;
  }
  const out: {
    outline: string;
    conversationText: string;
    userSchema?: string;
    conversationId?: string;
  } = {
    outline: seed.outline,
    conversationText: seed.conversationText,
  };
  if (typeof seed.userSchema === "string" && seed.userSchema.trim()) {
    out.userSchema = seed.userSchema;
  }
  if (typeof seed.conversationId === "string" && seed.conversationId.trim()) {
    out.conversationId = seed.conversationId;
  }
  return out;
}

/** Merge graph run input with the active UI content locale. */
export function withContentLocale(input?: Record<string, unknown>): Record<string, unknown> {
  return { ...(input ?? {}), contentLocale: resolveComposeContentLocale() };
}

function activityId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function phaseDisplayLabel(phase: string): string {
  const key = `wikiCompose.phaseDisplay.${phase}` as const;
  const translated = i18n.t(key);
  return translated === key ? phase : translated;
}

function appendActivity(
  prev: ComposeActivity[],
  next: Omit<ComposeActivity, "id" | "at">,
): ComposeActivity[] {
  const entry: ComposeActivity = {
    id: activityId(),
    at: new Date().toISOString(),
    ...next,
  };
  const merged = [...prev, entry];
  return merged.length > 200 ? merged.slice(merged.length - 200) : merged;
}

function reduceInterrupt(
  prev: WikiComposeSessionState,
  payload: ComposeInterruptPayload | undefined,
): Partial<WikiComposeSessionState> {
  if (!payload) return {};
  switch (payload.kind) {
    case "human_review_brief":
      return {
        briefQuestions: payload.questions,
        pageSnapshot: payload.pageSnapshot,
        phase: "brief",
      };
    case "human_review_research":
      return {
        latestBatch: payload.batch,
        pendingSources: payload.pendingSources,
        phase: "research",
      };
    case "human_review_outline":
      return {
        outlineProposal: payload.outline,
        approvedSources: payload.approvedSources,
        researchConflictSummary: null,
        phase: "structure",
      };
    case "conflict_resolution":
      return {
        researchConflictSummary: payload.conflicts,
        phase: "conflict",
        ...(prev.approvedSources.length > 0 ? { approvedSources: prev.approvedSources } : {}),
      };
    default:
      return {};
  }
}

/** Map an SSE event into a state update. */
export function reduceComposeSseEvent(
  prev: WikiComposeSessionState,
  event: ComposeSseEvent,
): Partial<WikiComposeSessionState> {
  switch (event.type) {
    case "started":
      return {
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.runStarted"),
          detail: event.graphId,
          status: "info",
        }),
      };
    case "compose_phase":
      return {
        phase: event.phase,
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.phase", { phase: phaseDisplayLabel(event.phase) }),
          detail: event.status,
          status: event.status === "entered" ? "started" : "completed",
        }),
      };
    case "status":
      return {
        activity: appendActivity(prev.activity, {
          label: event.phase,
          detail: event.message,
          status: "info",
        }),
      };
    case "tool_start":
      return {
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.toolStarted", { tool: event.tool }),
          detail: event.input ? "running" : undefined,
          status: "started",
        }),
      };
    case "tool_end":
      return {
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.toolDone", { tool: event.tool }),
          detail: event.error ?? (event.outputLength ? `${event.outputLength} chars` : "ok"),
          status: event.error ? "error" : "completed",
        }),
      };
    case "research_iteration":
      return {
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.researchIteration", {
            count: event.iteration + 1,
          }),
          detail: `${event.status} · ${event.queryCount} queries`,
          status: "info",
        }),
      };
    case "research_evaluation":
      return {
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.sufficiency", {
            score: event.score.toFixed(2),
          }),
          detail: event.rationale,
          status: "info",
        }),
      };
    case "research_batch":
      return {
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.researchBatch", {
            iteration: event.iteration,
          }),
          detail: `${event.sourceCount} sources · ${event.exitReason}`,
          status: "completed",
        }),
      };
    case "compose_section":
      if (event.status === "started") {
        return {
          streamingSectionId: event.sectionId,
          sectionBuffers: { ...prev.sectionBuffers, [event.sectionId]: "" },
          activity: appendActivity(prev.activity, {
            label: i18n.t("wikiCompose.activity.drafting", { heading: event.heading }),
            detail: `${event.index} / ${event.total}`,
            status: "started",
          }),
        };
      }
      return {
        streamingSectionId:
          prev.streamingSectionId === event.sectionId ? null : prev.streamingSectionId,
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.drafted", { heading: event.heading }),
          detail: `${event.index} / ${event.total}`,
          status: "completed",
        }),
      };
    case "token": {
      const id = prev.streamingSectionId;
      if (!id) return {};
      const prior = prev.sectionBuffers[id] ?? "";
      return {
        sectionBuffers: { ...prev.sectionBuffers, [id]: prior + event.content },
      };
    }
    case "interrupt":
      return reduceInterrupt(prev, event.payload);
    case "done":
      return {
        isStreaming: false,
        status: event.status,
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.runStatus", { status: event.status }),
          status: event.status === "completed" ? "completed" : "info",
        }),
      };
    case "error":
      return {
        error: event.message,
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.error"),
          detail: event.message,
          status: "error",
        }),
      };
    case "usage":
      return {
        activity: appendActivity(prev.activity, {
          label: i18n.t("wikiCompose.activity.usage"),
          detail: `in=${event.inputTokens} out=${event.outputTokens} cu=${event.costUnits}`,
          status: "info",
        }),
      };
    default:
      return {};
  }
}

/** Merge `GET` checkpoint projection into hook state. */
export function hydrateComposeFromProjection(
  projection: ComposeSessionUiProjection,
): Partial<WikiComposeSessionState> {
  const partial: Partial<WikiComposeSessionState> = {};
  if (projection.phase) partial.phase = projection.phase;
  if (projection.briefQuestions?.length) partial.briefQuestions = projection.briefQuestions;
  if (projection.pageSnapshot) partial.pageSnapshot = projection.pageSnapshot;
  if (projection.latestBatch !== undefined) partial.latestBatch = projection.latestBatch;
  if (projection.pendingSources?.length) partial.pendingSources = projection.pendingSources;
  if (projection.approvedSources?.length) partial.approvedSources = projection.approvedSources;
  if (projection.researchConflictSummary) {
    partial.researchConflictSummary = projection.researchConflictSummary;
  }
  if (projection.outlineProposal?.length) partial.outlineProposal = projection.outlineProposal;
  if (projection.completedMarkdown) partial.completedMarkdown = projection.completedMarkdown;
  if (projection.draftedSections?.length) {
    const draftedSections: Record<string, DraftedSection> = {};
    for (const section of projection.draftedSections) {
      if (section?.sectionId) draftedSections[section.sectionId] = section;
    }
    partial.draftedSections = draftedSections;
  }
  return partial;
}

function interruptContextFromCheckpoint(state: Record<string, unknown>): WikiComposeSessionState {
  const approved = Array.isArray(state.approvedResearch)
    ? (state.approvedResearch as ResearchSource[])
    : [];
  return { ...INITIAL_WIKI_COMPOSE_SESSION_STATE, approvedSources: approved };
}

/** Extract UI state from a non-streaming `PATCH /resume` response body. */
export function reduceComposeResumeOutput(
  output: unknown,
  status: ComposeSessionStatus,
): Partial<WikiComposeSessionState> {
  if (!output || typeof output !== "object") {
    return status === "completed" ? { phase: "completed" } : {};
  }
  const state = output as Record<string, unknown>;
  const partial: Partial<WikiComposeSessionState> = {};

  const interrupts = state.__interrupt__;
  if (Array.isArray(interrupts) && interrupts.length > 0) {
    const entry = interrupts[0];
    const value =
      entry && typeof entry === "object" ? (entry as { value?: unknown }).value : undefined;
    if (value && typeof value === "object" && "kind" in value) {
      Object.assign(
        partial,
        reduceInterrupt(interruptContextFromCheckpoint(state), value as ComposeInterruptPayload),
      );
    }
  }

  const completion = state.completion;
  if (completion && typeof completion === "object") {
    const c = completion as {
      markdown?: string;
      sections?: DraftedSection[];
    };
    if (typeof c.markdown === "string" && c.markdown.length > 0) {
      partial.completedMarkdown = c.markdown;
    }
    if (Array.isArray(c.sections)) {
      const draftedSections: Record<string, DraftedSection> = {};
      for (const section of c.sections) {
        if (!section || typeof section !== "object") continue;
        const s = section as DraftedSection;
        if (typeof s.sectionId === "string") draftedSections[s.sectionId] = s;
      }
      partial.draftedSections = draftedSections;
      partial.phase = "completed";
      const approvedOutline = state.approvedOutline as { sections?: OutlineSection[] } | undefined;
      if (approvedOutline?.sections?.length) {
        partial.outlineProposal = approvedOutline.sections;
      } else if (c.sections.length > 0) {
        partial.outlineProposal = c.sections
          .filter((s): s is DraftedSection =>
            Boolean(
              s && typeof s === "object" && typeof (s as DraftedSection).sectionId === "string",
            ),
          )
          .map((s) => ({
            id: s.sectionId,
            heading: s.heading ?? "",
            depth: 1 as const,
            intent: "",
          }));
      }
    }
  }

  if (status === "completed" && partial.phase !== "completed") {
    partial.phase = "completed";
  }

  return partial;
}
