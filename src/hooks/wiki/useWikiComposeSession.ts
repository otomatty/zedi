/**
 * `useWikiComposeSession` — React state machine for one Wiki Compose session (#950).
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
import {
  hydrateComposeFromProjection,
  INITIAL_WIKI_COMPOSE_SESSION_STATE,
  parseComposeSeedFromMetadata,
  reduceComposeResumeOutput,
  reduceComposeSseEvent,
  withContentLocale,
  type ComposeActivity,
  type ComposePhase,
  type WikiComposeSessionState,
} from "@/lib/wikiCompose/wikiComposeSessionReducer";
import { useInitialComposeBackend } from "@/hooks/wiki/useInitialComposeBackend";
import type {
  BriefAnswer,
  ComposeSession,
  DraftedSection,
  OutlineSection,
} from "@/lib/wikiCompose/types";
import type { ComposeSseEvent } from "@/lib/wikiCompose/types";

export type { ComposeActivity, ComposePhase, WikiComposeSessionState };

/**
 * When the hook should call `start()` automatically.
 * `start()` を自動実行するタイミング。
 */
export type ComposeStartPolicy = "never" | "on-mount" | "when-backend-ready";

/** Args accepted by the hook. */
export interface UseWikiComposeSessionArgs {
  pageId: string;
  sessionId: string | null;
  initialInput?: Record<string, unknown>;
  composeSeed?: ComposeNavigationSeed;
  /**
   * @deprecated Prefer {@link startPolicy}. When set without `startPolicy`, `false` → `never`, `true` → `on-mount`.
   */
  autoStart?: boolean;
  /** When to auto-invoke `start()`. Default `on-mount`. */
  startPolicy?: ComposeStartPolicy;
  backend?: ComposeExecutionBackend;
}

/** Hook return shape. */
export interface UseWikiComposeSessionReturn extends WikiComposeSessionState {
  start: () => Promise<void>;
  submitBrief: (input: {
    answers: BriefAnswer[];
    appendToExisting?: boolean;
    researchMaxIterations?: number;
  }) => Promise<void>;
  submitResearchApproval: (input: {
    approvedSourceIds: string[];
    rejectedSourceIds?: string[];
    note?: string;
  }) => Promise<void>;
  submitOutline: (input: { sections: OutlineSection[] }) => Promise<void>;
  submitConflictAck: (input?: { note?: string }) => Promise<void>;
  cancel: () => Promise<void>;
  /** True when a failed fresh-compose auto-start can be retried from the UI. */
  canRetryStart: boolean;
}

function resolveStartPolicy(args: UseWikiComposeSessionArgs): ComposeStartPolicy {
  if (args.startPolicy) return args.startPolicy;
  if (args.autoStart === false) return "never";
  return "on-mount";
}

export function useWikiComposeSession(
  args: UseWikiComposeSessionArgs,
): UseWikiComposeSessionReturn {
  const {
    pageId,
    sessionId: initialSessionId,
    initialInput,
    composeSeed,
    backend: backendOverride = "zedi_managed",
  } = args;

  const startPolicy = resolveStartPolicy(args);
  const loadBackendFromSettings = startPolicy === "when-backend-ready";
  const { backend: settingsBackend, isResolved: isBackendResolved } = useInitialComposeBackend({
    enabled: loadBackendFromSettings,
  });
  const backend = loadBackendFromSettings ? settingsBackend : backendOverride;

  const [state, setState] = useState<WikiComposeSessionState>(INITIAL_WIKI_COMPOSE_SESSION_STATE);
  const sessionRef = useRef<ComposeSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoStartRequestedRef = useRef(false);

  const update = useCallback((partial: Partial<WikiComposeSessionState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const onEvent = useCallback((event: ComposeSseEvent) => {
    setState((prev) => ({ ...prev, ...reduceComposeSseEvent(prev, event) }));
  }, []);

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
        if ((err as { name?: string }).name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        update({ error: message, isStreaming: false });
      } finally {
        update({ isStreaming: false });
        abortRef.current = null;
      }
    },
    [pageId, onEvent, update],
  );

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
        ? hydrateComposeFromProjection(loaded.projection)
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

      if (session.status === "pending" || session.status === "failed") {
        await streamRun(session, withContentLocale(runInput));
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
      const fromResume = reduceComposeResumeOutput(result.output, result.status);
      update({ status: result.status, ...fromResume });
    },
    [pageId, update],
  );

  const submitResearchApproval = useCallback<UseWikiComposeSessionReturn["submitResearchApproval"]>(
    async (input) => {
      const session = sessionRef.current;
      if (!session) throw new Error("Session not initialised");
      const approved = state.pendingSources.filter((s) => input.approvedSourceIds.includes(s.id));
      update({ approvedSources: approved });
      const result = await resumeSession({ pageId, sessionId: session.id, resume: input });
      const fromResume = reduceComposeResumeOutput(result.output, result.status);
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
      const fromResume = reduceComposeResumeOutput(result.output, result.status);
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
      const fromResume = reduceComposeResumeOutput(result.output, result.status);
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

  const canRetryStart =
    !initialSessionId &&
    Boolean(state.error) &&
    !state.session &&
    !state.isStreaming &&
    (state.status === "idle" || state.status === "failed");

  // Abort in-flight SSE only on unmount — not when `start()` sets `session` and
  // re-renders (Codex P1: dependency churn must not cancel a fresh compose run).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (startPolicy === "never") return;
    if (startPolicy === "when-backend-ready") {
      if (!isBackendResolved || initialSessionId) return;
    }
    if (autoStartRequestedRef.current) return;
    autoStartRequestedRef.current = true;

    let cancelled = false;
    void start().catch((err) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      update({ error: message });
    });
    return () => {
      cancelled = true;
    };
  }, [startPolicy, isBackendResolved, initialSessionId, start, update]);

  useEffect(() => {
    if (startPolicy !== "when-backend-ready") return;
    if (initialSessionId || state.session || !state.error) return;
    autoStartRequestedRef.current = false;
  }, [startPolicy, initialSessionId, state.session, state.error]);

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
    cancel,
    canRetryStart,
  };
}
