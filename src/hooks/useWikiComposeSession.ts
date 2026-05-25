/**
 * `useWikiComposeSession` — React state machine for one Wiki Compose session
 * (#950).
 *
 * Compose 1 セッションのフロント側 state machine。SSE で来るイベントを
 * pattern match し、Brief 質問 / 調査バッチ / アウトライン / セクション本文
 * といったフェーズ固有の slice を再アセンブルする。`WikiComposePage` は本
 * フックの戻り値を読みつつ、`submitBrief` / `submitResearchApproval` /
 * `submitOutline` を呼ぶことで graph を次フェーズへ進める。
 *
 * Owns the wire-level wiring; UI components stay pure. Critically, the hook
 * does NOT navigate or persist — it only reflects what the SSE stream says.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelSession,
  createSession,
  getSession,
  resumeSession,
  runSession,
} from "@/lib/wikiCompose/composeService";
import type { ComposeExecutionBackend } from "@/lib/wikiCompose/backends";
import type { ComposeNavigationSeed } from "@/lib/wikiCompose/navigation";
import type {
  BriefAnswer,
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

/**
 * UI phase for Wiki Compose session progression.
 * Wiki Compose セッション進行を表す UI フェーズ。
 */
export type ComposePhase = "brief" | "research" | "conflict" | "structure" | "draft" | "completed";

/** Activity log entry surfaced in the right pane's ActivitySection. */
export interface ComposeActivity {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Human-readable label for the activity row. */
  label: string;
  /** Optional secondary line (status, tool name, etc.). */
  detail?: string;
  /** Lifecycle hint so the UI can render spinners / checkmarks. */
  status?: "started" | "completed" | "info" | "error";
}

/** Aggregate state surfaced to the UI. */
export interface WikiComposeSessionState {
  session: ComposeSession | null;
  status: ComposeSessionStatus | "idle";
  phase: ComposePhase;
  /** Brief phase question cards (from interrupt). */
  briefQuestions: BriefQuestion[];
  /** Page snapshot (loaded at session start). */
  pageSnapshot: PageSnapshot | null;
  /** Latest research batch from the human-review interrupt. */
  latestBatch: ResearchBatch | null;
  /** Pending sources at the research interrupt. */
  pendingSources: ResearchSource[];
  /** Approved sources after research resume. */
  approvedSources: ResearchSource[];
  /** P5 conflict-resolution interrupt payload (#953). */
  researchConflictSummary: ResearchConflictSummary | null;
  /** Proposed outline from the structure interrupt. */
  outlineProposal: OutlineSection[];
  /** Drafted section bodies — keyed by sectionId. */
  draftedSections: Record<string, DraftedSection>;
  /** While streaming a section, this id is set; null between sections. */
  streamingSectionId: string | null;
  /** Per-section running token buffer while the section is mid-stream. */
  sectionBuffers: Record<string, string>;
  /** Activity timeline (newest last). */
  activity: ComposeActivity[];
  /** Final markdown if the session completed. */
  completedMarkdown: string | null;
  /** Last error message (set on failure). */
  error: string | null;
  /** True while an SSE stream is open. */
  isStreaming: boolean;
}

const INITIAL_STATE: WikiComposeSessionState = {
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

/** Args accepted by the hook. */
export interface UseWikiComposeSessionArgs {
  pageId: string;
  /** Existing session to resume; pass `null` to create a fresh session on start. */
  sessionId: string | null;
  /**
   * 初回 `POST /run` に渡す graph input（例: `chatSeed`）。
   * Initial graph input for the first `POST /run` (e.g. `{ chatSeed }`).
   */
  initialInput?: Record<string, unknown>;
  /**
   * チャット由来 seed。セッション行 `metadata` にも保存する。
   * Chat-origin seed; also persisted on the session row metadata.
   */
  composeSeed?: ComposeNavigationSeed;
  /** Auto-start the first `run` when the session is created. Default `true`. */
  autoStart?: boolean;
  /**
   * 実行 backend（セッション作成時に固定）。省略時は `zedi_managed`。
   * Execution backend fixed at session create; defaults to `zedi_managed`.
   */
  backend?: ComposeExecutionBackend;
}

/** Hook return shape. */
export interface UseWikiComposeSessionReturn extends WikiComposeSessionState {
  /** Start a new session (or resume the existing one) and begin streaming. */
  start: () => Promise<void>;
  /** Submit Brief answers and continue streaming. */
  submitBrief: (input: {
    answers: BriefAnswer[];
    appendToExisting?: boolean;
    researchMaxIterations?: number;
  }) => Promise<void>;
  /** Submit research source approval (Approve/Reject) and continue streaming. */
  submitResearchApproval: (input: {
    approvedSourceIds: string[];
    rejectedSourceIds?: string[];
    note?: string;
  }) => Promise<void>;
  /** Submit outline approval and continue streaming. */
  submitOutline: (input: { sections: OutlineSection[] }) => Promise<void>;
  /**
   * Acknowledge research conflicts and continue to Structure (#953).
   * 調査の矛盾を確認し Structure へ進む（#953）。
   */
  submitConflictAck: (input?: { note?: string }) => Promise<void>;
  /** Cancel the session (DELETE). */
  cancel: () => Promise<void>;
}

/** First interrupt kind on a LangGraph checkpoint output, if any. */
function interruptKindFromOutput(output: unknown): string | undefined {
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
 * Returns a unique id for an activity row. Uses crypto.randomUUID when
 * available (modern browsers); falls back to a coarse fallback for old
 * environments and SSR.
 */
/**
 * `session.metadata.composeSeed` を型検証して graph input 用 seed にする。
 * Validate persisted `metadata.composeSeed` before sending `/run` input.
 */
function parseComposeSeedFromMetadata(metadata: Record<string, unknown> | null | undefined):
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

function activityId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Map an SSE event into a state update. Returns a partial state to merge.
 */
function reduceEvent(
  prev: WikiComposeSessionState,
  event: ComposeSseEvent,
): Partial<WikiComposeSessionState> {
  switch (event.type) {
    case "started":
      return {
        activity: appendActivity(prev.activity, {
          label: "Run started",
          detail: event.graphId,
          status: "info",
        }),
      };
    case "compose_phase":
      return {
        phase: event.phase,
        activity: appendActivity(prev.activity, {
          label: `Phase: ${event.phase}`,
          detail: event.status,
          status: event.status === "entered" ? "started" : "completed",
        }),
      };
    case "status":
      // Server-side `status` events use a colon-namespaced phase string
      // (e.g. "brief:await_user"); we don't surface those as the top-level
      // phase, only as activity log entries for debug.
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
          label: `Tool: ${event.tool}`,
          detail: event.input ? "running" : undefined,
          status: "started",
        }),
      };
    case "tool_end":
      return {
        activity: appendActivity(prev.activity, {
          label: `Tool: ${event.tool}`,
          detail: event.error ?? (event.outputLength ? `${event.outputLength} chars` : "ok"),
          status: event.error ? "error" : "completed",
        }),
      };
    case "research_iteration":
      return {
        activity: appendActivity(prev.activity, {
          label: `Research iteration ${event.iteration + 1}`,
          detail: `${event.status} · ${event.queryCount} queries`,
          status: "info",
        }),
      };
    case "research_evaluation":
      return {
        activity: appendActivity(prev.activity, {
          label: `Sufficiency: ${event.score.toFixed(2)}`,
          detail: event.rationale,
          status: "info",
        }),
      };
    case "research_batch":
      return {
        activity: appendActivity(prev.activity, {
          label: `Research batch (#${event.iteration})`,
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
            label: `Drafting: ${event.heading}`,
            detail: `${event.index} / ${event.total}`,
            status: "started",
          }),
        };
      }
      return {
        streamingSectionId:
          prev.streamingSectionId === event.sectionId ? null : prev.streamingSectionId,
        activity: appendActivity(prev.activity, {
          label: `Drafted: ${event.heading}`,
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
          label: `Run ${event.status}`,
          status: event.status === "completed" ? "completed" : "info",
        }),
      };
    case "error":
      return {
        error: event.message,
        activity: appendActivity(prev.activity, {
          label: "Error",
          detail: event.message,
          status: "error",
        }),
      };
    case "usage":
      // Usage doesn't change UI state directly, but log it for debug.
      return {
        activity: appendActivity(prev.activity, {
          label: "Usage",
          detail: `in=${event.inputTokens} out=${event.outputTokens} cu=${event.costUnits}`,
          status: "info",
        }),
      };
    default:
      return {};
  }
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
  // Cap the activity log so a long-running session does not grow unbounded.
  // 直近 200 件のみ保持する（DOM 描画コスト対策）。
  const merged = [...prev, entry];
  return merged.length > 200 ? merged.slice(merged.length - 200) : merged;
}

/**
 * Extract UI state from a non-streaming `PATCH /resume` response body.
 *
 * Resume runs the graph via `invoke`, so tokens and interrupts are returned in
 * `output` rather than over SSE. The hook must hydrate phase slices from that
 * payload; relying on a follow-up `POST /run` would pass fresh `input` to an
 * interrupted checkpoint (invalid for LangGraph) and drop `completion` on the
 * final outline approve path.
 */
/**
 * Merge `GET /compose-sessions/:id` checkpoint projection into hook state (#950).
 * `GET` の projection をフック state にマージする（リロード再開用）。
 */
function hydrateFromProjection(
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

/**
 * Build hook state context for resume-time interrupt projection.
 * resume 時の interrupt 投影用に、チェックポイント上の approvedResearch を引き継ぐ。
 */
function interruptContextFromCheckpoint(state: Record<string, unknown>): WikiComposeSessionState {
  const approved = Array.isArray(state.approvedResearch)
    ? (state.approvedResearch as ResearchSource[])
    : [];
  return { ...INITIAL_STATE, approvedSources: approved };
}

function reduceResumeOutput(
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
        partial.outlineProposal = c.sections.map((s) => ({
          id: s.sectionId,
          heading: s.heading,
          depth: 1,
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
        // Keep approvals from `prev` (SSE) or checkpoint context (resume); do not
        // overwrite with an empty array when `reduceResumeOutput` seeds context.
        ...(prev.approvedSources.length > 0 ? { approvedSources: prev.approvedSources } : {}),
      };
    default:
      return {};
  }
}

/**
 * `useWikiComposeSession` — owns SSE wiring and state reduction for one
 * compose session. The page component reads the returned state and calls the
 * submit functions to advance phases.
 */
export function useWikiComposeSession(
  args: UseWikiComposeSessionArgs,
): UseWikiComposeSessionReturn {
  const {
    pageId,
    sessionId: initialSessionId,
    initialInput,
    composeSeed,
    autoStart = true,
    backend = "zedi_managed",
  } = args;
  const [state, setState] = useState<WikiComposeSessionState>(INITIAL_STATE);
  const sessionRef = useRef<ComposeSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Merge a partial update into state. */
  const update = useCallback((partial: Partial<WikiComposeSessionState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  /** Consume an SSE event by reducing it into state. */
  const onEvent = useCallback((event: ComposeSseEvent) => {
    setState((prev) => ({ ...prev, ...reduceEvent(prev, event) }));
  }, []);

  /** Stream a `runSession` call and update state from events. */
  const streamRun = useCallback(
    async (session: ComposeSession, body?: Record<string, unknown>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      update({ isStreaming: true, error: null });
      try {
        await runSession({
          pageId,
          sessionId: session.id,
          body,
          onEvent,
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          // Caller aborted; do not surface as an error.
          // ユーザー操作による abort は error として扱わない。
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        update({ error: message, isStreaming: false });
      } finally {
        update({ isStreaming: false });
        abortRef.current = null;
      }
    },
    [pageId, onEvent, update],
  );

  /** Create or resume the session, then begin streaming. */
  const start = useCallback(async () => {
    try {
      const loaded = initialSessionId ? await getSession(pageId, initialSessionId) : null;
      const session =
        loaded?.session ??
        (await createSession({
          pageId,
          backend,
          metadata: composeSeed
            ? {
                composeSeed: {
                  outline: composeSeed.outline,
                  conversationText: composeSeed.conversationText,
                  userSchema: composeSeed.userSchema,
                  conversationId: composeSeed.conversationId,
                },
              }
            : undefined,
        }));
      const projectionHydration = loaded?.projection
        ? hydrateFromProjection(loaded.projection)
        : {};

      sessionRef.current = session;
      update({ session, status: session.status, error: null, ...projectionHydration });

      const metadataSeed = parseComposeSeedFromMetadata(session.metadata);
      const runInput =
        initialInput ??
        (metadataSeed
          ? {
              chatSeed: metadataSeed,
            }
          : undefined);

      // Only fresh / retriable rows may call `POST /run` with graph input.
      // Interrupted checkpoints require `Command({ resume })`; replaying input
      // would restart or error, and resume payloads are not stored on the row.
      if (session.status === "pending" || session.status === "failed") {
        await streamRun(session, runInput);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      update({ error: message });
    }
  }, [pageId, initialSessionId, initialInput, composeSeed, backend, streamRun, update]);

  const submitBrief = useCallback<UseWikiComposeSessionReturn["submitBrief"]>(
    async (input) => {
      const session = sessionRef.current;
      if (!session) throw new Error("Session not initialised");
      const result = await resumeSession({ pageId, sessionId: session.id, resume: input });
      const fromResume = reduceResumeOutput(result.output, result.status);
      update({ status: result.status, ...fromResume });
    },
    [pageId, update],
  );

  const submitResearchApproval = useCallback<UseWikiComposeSessionReturn["submitResearchApproval"]>(
    async (input) => {
      const session = sessionRef.current;
      if (!session) throw new Error("Session not initialised");
      // Mirror the approved sources into state immediately so the UI can show
      // the user's choice without waiting for the server's projection.
      // resume 直後に approvedSources を仮反映してフロントの追随を早める。
      const approved = state.pendingSources.filter((s) => input.approvedSourceIds.includes(s.id));
      update({ approvedSources: approved });
      const result = await resumeSession({ pageId, sessionId: session.id, resume: input });
      if (interruptKindFromOutput(result.output) === "conflict_resolution") {
        const fromResume = reduceResumeOutput(result.output, result.status);
        update({ status: result.status, ...fromResume });
        return;
      }
      const fromResume = reduceResumeOutput(result.output, result.status);
      update({ status: result.status, ...fromResume });
    },
    [pageId, state.pendingSources, update],
  );

  const submitConflictAck = useCallback<UseWikiComposeSessionReturn["submitConflictAck"]>(
    async (input) => {
      const session = sessionRef.current;
      if (!session) throw new Error("Session not initialised");
      const result = await resumeSession({
        pageId,
        sessionId: session.id,
        resume: { acknowledged: true as const, ...(input?.note ? { note: input.note } : {}) },
      });
      const fromResume = reduceResumeOutput(result.output, result.status);
      update({
        status: result.status,
        researchConflictSummary: null,
        ...fromResume,
      });
    },
    [pageId, update],
  );

  const submitOutline = useCallback<UseWikiComposeSessionReturn["submitOutline"]>(
    async (input) => {
      const session = sessionRef.current;
      if (!session) throw new Error("Session not initialised");
      const result = await resumeSession({ pageId, sessionId: session.id, resume: input });
      const fromResume = reduceResumeOutput(result.output, result.status);
      update({ status: result.status, ...fromResume });
    },
    [pageId, update],
  );

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    const session = sessionRef.current;
    if (!session) return;
    await cancelSession(pageId, session.id);
    update({ status: "cancelled" });
  }, [pageId, update]);

  // Auto-start on mount when requested. The dependency list is intentionally
  // narrow so we don't double-start on prop changes.
  // 自動開始は mount 時のみ。引数変更で再起動しないよう依存を意図的に絞る。
  useEffect(() => {
    if (!autoStart) return;
    let cancelled = false;
    void start().catch((err) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      update({ error: message });
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive completion markdown from drafted sections when status flips.
  // 完了時に Markdown を組み立てるロジックは backend `completed` ノードと別系統
  // でも UI 側で再構築できるよう、フックでも軽量に持つ。
  const completedMarkdown = useMemo(() => {
    if (state.status !== "completed") return state.completedMarkdown;
    if (state.completedMarkdown) return state.completedMarkdown;
    const sections = state.outlineProposal
      .map((s) => state.draftedSections[s.id])
      .filter((s): s is DraftedSection => Boolean(s));
    if (sections.length === 0) return null;
    return sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  }, [state.status, state.outlineProposal, state.draftedSections, state.completedMarkdown]);

  return {
    ...state,
    completedMarkdown,
    start,
    submitBrief,
    submitResearchApproval,
    submitConflictAck,
    submitOutline,
    submitConflictAck,
    cancel,
  };
}
