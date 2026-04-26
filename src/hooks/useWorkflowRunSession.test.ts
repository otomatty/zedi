/**
 * Tests for {@link useWorkflowRunSession}.
 * {@link useWorkflowRunSession} のテスト。
 *
 * Issue #743: cover the orchestration entry points (validation guards, mode
 * dispatch, completed/paused/stopped/error outcomes), abort cleanup on unmount,
 * and pause / stop signal forwarding.
 * Issue #743: 実行入口（バリデーション、モード分岐、completed/paused/stopped/error の
 * 結果反映）、unmount 時の abort クリーンアップ、pause/stop の信号伝搬を検証する。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import type { WorkflowDefinition } from "@/lib/workflow/types";
import type { WorkflowExecutionOutcome } from "@/lib/workflow/runWorkflowExecution";

const mockToast = vi.fn();
const mockIsTauriDesktop = vi.fn();
const mockRunWorkflowExecution = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@zedi/ui", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: () => mockIsTauriDesktop(),
}));

vi.mock("@/lib/workflow/runWorkflowExecution", () => ({
  runWorkflowExecution: (...args: unknown[]) => mockRunWorkflowExecution(...args),
}));

import { AIChatProvider, useAIChatContext } from "@/contexts/AIChatContext";
import type { PageContext } from "@/types/aiChat";
import { useWorkflowRunSession } from "./useWorkflowRunSession";

function makeDraft(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  const now = Date.now();
  return {
    id: "wf-1",
    name: "Test Flow",
    steps: [
      { id: "s1", title: "Step One", instruction: "do" },
      { id: "s2", title: "Step Two", instruction: "next" },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function ContextSetter({ pageContext }: { pageContext: PageContext | null }) {
  const { setPageContext } = useAIChatContext();
  React.useEffect(() => {
    setPageContext(pageContext);
  }, [pageContext, setPageContext]);
  return null;
}

function createWrapper(pageContext: PageContext | null) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      AIChatProvider,
      null,
      React.createElement(
        React.Fragment,
        null,
        React.createElement(ContextSetter, { pageContext }),
        children,
      ),
    );
  };
}

const editorContext: PageContext = {
  type: "editor",
  pageId: "p1",
  pageTitle: "Note",
  pageFullContent: "",
  claudeWorkspaceRoot: "/tmp/wsroot",
};

describe("useWorkflowRunSession - validation guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriDesktop.mockReturnValue(true);
  });

  it("aborts with desktopOnly toast outside of Tauri", async () => {
    mockIsTauriDesktop.mockReturnValue(false);
    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    await act(async () => {
      await result.current.runExecution("fresh");
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.workflow.desktopOnly",
      variant: "destructive",
    });
    expect(mockRunWorkflowExecution).not.toHaveBeenCalled();
  });

  it("aborts with editorRequired toast when pageContext is not editor", async () => {
    // 実装では type !== "editor" のときに editorRequired を出す。
    // PageContext.type の有効値（"editor" | "home" | "search" | "other"）から
    // editor 以外を選ぶことで unsafe な cast を避ける。
    // The hook gates execution on `type === "editor"`. Use the valid "home"
    // discriminant so we exercise the "not editor" branch without an as-cast.
    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper({
        type: "home",
        pageId: "w1",
        pageTitle: "Home",
        pageContent: "",
      }),
    });

    await act(async () => {
      await result.current.runExecution("fresh");
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.workflow.editorRequired",
      variant: "destructive",
    });
    expect(mockRunWorkflowExecution).not.toHaveBeenCalled();
  });

  it("aborts with nameRequired when draft.name is empty", async () => {
    const { result } = renderHook(() => useWorkflowRunSession(makeDraft({ name: "  " })), {
      wrapper: createWrapper(editorContext),
    });

    await act(async () => {
      await result.current.runExecution("fresh");
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.workflow.nameRequired",
      variant: "destructive",
    });
    expect(mockRunWorkflowExecution).not.toHaveBeenCalled();
  });

  it("aborts with stepsRequired when no step has both title and instruction", async () => {
    const { result } = renderHook(
      () => useWorkflowRunSession(makeDraft({ steps: [{ id: "s1", title: "", instruction: "" }] })),
      { wrapper: createWrapper(editorContext) },
    );

    await act(async () => {
      await result.current.runExecution("fresh");
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.workflow.stepsRequired",
      variant: "destructive",
    });
    expect(mockRunWorkflowExecution).not.toHaveBeenCalled();
  });

  it("aborts resume mode with nothingToResume when no paused state exists", async () => {
    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    await act(async () => {
      await result.current.runExecution("resume");
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.workflow.nothingToResume",
      variant: "destructive",
    });
    expect(mockRunWorkflowExecution).not.toHaveBeenCalled();
  });
});

describe("useWorkflowRunSession - run outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriDesktop.mockReturnValue(true);
  });

  it("fresh run dispatches to runWorkflowExecution with valid steps and reports completed", async () => {
    mockRunWorkflowExecution.mockResolvedValue({
      outcome: "completed",
    } satisfies WorkflowExecutionOutcome);

    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    await act(async () => {
      await result.current.runExecution("fresh");
    });

    expect(mockRunWorkflowExecution).toHaveBeenCalledTimes(1);
    const callArg = mockRunWorkflowExecution.mock.calls[0][0] as {
      definition: WorkflowDefinition;
      cwd: string | undefined;
      startStepIndex: number;
    };
    expect(callArg.definition.steps).toHaveLength(2);
    expect(callArg.cwd).toBe("/tmp/wsroot");
    expect(callArg.startStepIndex).toBe(0);

    await waitFor(() => {
      expect(result.current.progress?.phase).toBe("completed");
    });
    expect(mockToast).toHaveBeenCalledWith({ title: "aiChat.workflow.completed" });
    expect(result.current.pausedState).toBeNull();
  });

  it("paused outcome stores resumable snapshot and toasts paused", async () => {
    mockRunWorkflowExecution.mockResolvedValue({
      outcome: "paused",
      pausedAtStepIndex: 1,
      pausedStepId: "s2",
      stepOutputsById: { s1: "first done" },
      stepOutputs: ["first done", ""],
      partialForStep: "in-progress text",
    } satisfies WorkflowExecutionOutcome);

    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    await act(async () => {
      await result.current.runExecution("fresh");
    });

    await waitFor(() => {
      expect(result.current.pausedState).not.toBeNull();
    });
    expect(result.current.pausedState).toMatchObject({
      pausedStepId: "s2",
      stepOutputsById: { s1: "first done" },
      partialForStep: "in-progress text",
    });
    expect(result.current.progress?.phase).toBe("paused");
    expect(mockToast).toHaveBeenCalledWith({ title: "aiChat.workflow.paused" });
  });

  it("error outcome records lastError and toasts a destructive notice", async () => {
    mockRunWorkflowExecution.mockResolvedValue({
      outcome: "error",
      error: "boom",
    } satisfies WorkflowExecutionOutcome);

    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    await act(async () => {
      await result.current.runExecution("fresh");
    });

    await waitFor(() => {
      expect(result.current.progress?.phase).toBe("aborted");
    });
    expect(result.current.progress?.lastError).toBe("boom");
    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.workflow.error",
      variant: "destructive",
    });
  });
});

describe("useWorkflowRunSession - resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriDesktop.mockReturnValue(true);
  });

  it("resume passes startStepIndex/stepOutputs/resumePartial back to runWorkflowExecution", async () => {
    // First, drive a paused outcome so the hook captures pausedState.
    mockRunWorkflowExecution.mockResolvedValueOnce({
      outcome: "paused",
      pausedAtStepIndex: 1,
      pausedStepId: "s2",
      stepOutputsById: { s1: "first" },
      stepOutputs: ["first", ""],
      partialForStep: "partial",
    } satisfies WorkflowExecutionOutcome);

    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    await act(async () => {
      await result.current.runExecution("fresh");
    });
    await waitFor(() => expect(result.current.pausedState).not.toBeNull());

    mockRunWorkflowExecution.mockResolvedValueOnce({
      outcome: "completed",
    } satisfies WorkflowExecutionOutcome);

    await act(async () => {
      await result.current.runExecution("resume");
    });

    const secondCall = mockRunWorkflowExecution.mock.calls[1][0] as {
      startStepIndex: number;
      stepOutputs: string[];
      resumePartialForCurrentStep: string | undefined;
    };
    expect(secondCall.startStepIndex).toBe(1);
    expect(secondCall.stepOutputs).toEqual(["first", ""]);
    expect(secondCall.resumePartialForCurrentStep).toBe("partial");
  });

  it("resume aborts when paused step id is no longer in valid steps", async () => {
    mockRunWorkflowExecution.mockResolvedValueOnce({
      outcome: "paused",
      pausedAtStepIndex: 1,
      pausedStepId: "s2",
      stepOutputsById: { s1: "first" },
      stepOutputs: ["first", ""],
      partialForStep: "partial",
    } satisfies WorkflowExecutionOutcome);

    const draft = makeDraft();
    const { rerender, result } = renderHook(
      ({ d }: { d: WorkflowDefinition }) => useWorkflowRunSession(d),
      {
        wrapper: createWrapper(editorContext),
        initialProps: { d: draft },
      },
    );

    await act(async () => {
      await result.current.runExecution("fresh");
    });
    await waitFor(() => expect(result.current.pausedState).not.toBeNull());

    // User edited the draft and removed `s2`.
    const editedDraft = makeDraft({
      steps: [{ id: "s1", title: "Step One", instruction: "do" }],
    });
    rerender({ d: editedDraft });

    await act(async () => {
      await result.current.runExecution("resume");
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.workflow.pausedStepNotFound",
      variant: "destructive",
    });
    // After aborting, pausedState is reset to null.
    expect(result.current.pausedState).toBeNull();
  });
});

describe("useWorkflowRunSession - cleanup and signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriDesktop.mockReturnValue(true);
  });

  it("handlePause aborts the current step controller", async () => {
    let capturedStepAbort: AbortController | null = null;
    let resolveExecution: ((value: WorkflowExecutionOutcome) => void) | null = null;

    mockRunWorkflowExecution.mockImplementation(
      async (params: {
        createStepAbort: () => AbortController;
      }): Promise<WorkflowExecutionOutcome> => {
        capturedStepAbort = params.createStepAbort();
        return new Promise<WorkflowExecutionOutcome>((resolve) => {
          resolveExecution = resolve;
        });
      },
    );

    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.runExecution("fresh");
    });
    await waitFor(() => expect(capturedStepAbort).not.toBeNull());

    act(() => {
      result.current.handlePause();
    });

    expect(capturedStepAbort?.signal.aborted).toBe(true);

    // Drain the promise so the test does not leak.
    await act(async () => {
      resolveExecution?.({ outcome: "completed" });
      await pending;
    });
  });

  it("handleStop aborts both workflow and current-step controllers", async () => {
    let capturedStepAbort: AbortController | null = null;
    let capturedWorkflowSignal: AbortSignal | null = null;
    let resolveExecution: ((value: WorkflowExecutionOutcome) => void) | null = null;

    mockRunWorkflowExecution.mockImplementation(
      async (params: {
        workflowSignal: AbortSignal;
        createStepAbort: () => AbortController;
      }): Promise<WorkflowExecutionOutcome> => {
        capturedWorkflowSignal = params.workflowSignal;
        capturedStepAbort = params.createStepAbort();
        return new Promise<WorkflowExecutionOutcome>((resolve) => {
          resolveExecution = resolve;
        });
      },
    );

    const { result } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.runExecution("fresh");
    });
    await waitFor(() => expect(capturedWorkflowSignal).not.toBeNull());

    act(() => {
      result.current.handleStop();
    });

    expect(capturedWorkflowSignal?.aborted).toBe(true);
    expect(capturedStepAbort?.signal.aborted).toBe(true);

    await act(async () => {
      resolveExecution?.({ outcome: "stopped" });
      await pending;
    });
  });

  it("aborts in-flight controllers on unmount", async () => {
    let capturedStepAbort: AbortController | null = null;
    let capturedWorkflowSignal: AbortSignal | null = null;
    let resolveExecution: ((value: WorkflowExecutionOutcome) => void) | null = null;

    mockRunWorkflowExecution.mockImplementation(
      async (params: {
        workflowSignal: AbortSignal;
        createStepAbort: () => AbortController;
      }): Promise<WorkflowExecutionOutcome> => {
        capturedWorkflowSignal = params.workflowSignal;
        capturedStepAbort = params.createStepAbort();
        return new Promise<WorkflowExecutionOutcome>((resolve) => {
          resolveExecution = resolve;
        });
      },
    );

    const { result, unmount } = renderHook(() => useWorkflowRunSession(makeDraft()), {
      wrapper: createWrapper(editorContext),
    });

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.runExecution("fresh");
    });
    await waitFor(() => expect(capturedWorkflowSignal).not.toBeNull());

    unmount();

    expect(capturedWorkflowSignal?.aborted).toBe(true);
    expect(capturedStepAbort?.signal.aborted).toBe(true);

    // Resolve to avoid leaking the pending promise into the next test.
    resolveExecution?.({ outcome: "stopped" });
    await pending;
  });
});
