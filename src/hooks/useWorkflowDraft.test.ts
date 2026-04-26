/**
 * Tests for {@link useWorkflowDraft}.
 * {@link useWorkflowDraft} のテスト。
 *
 * Issue #743: cover step CRUD, template loading, save validation, JSON
 * import/export, and saved-definition selection lifecycle.
 * Issue #743: ステップ CRUD、テンプレートのロード、保存時のバリデーション、
 * JSON インポート/エクスポート、保存済み定義の選択ライフサイクルを検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockToast = vi.fn();
const mockUpsertDefinition = vi.fn();
const mockRemoveDefinition = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@zedi/ui", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { useWorkflowDefinitionsStore } from "@/stores/workflowDefinitionsStore";
import type { WorkflowDefinition } from "@/lib/workflow/types";
import { useWorkflowDraft } from "./useWorkflowDraft";

function resetStore(initial: WorkflowDefinition[] = []): void {
  useWorkflowDefinitionsStore.setState({
    definitions: initial,
    upsertDefinition: (def: WorkflowDefinition) => {
      mockUpsertDefinition(def);
      useWorkflowDefinitionsStore.setState((s) => ({
        ...s,
        definitions: [...s.definitions.filter((d) => d.id !== def.id), def],
      }));
    },
    removeDefinition: (id: string) => {
      mockRemoveDefinition(id);
      useWorkflowDefinitionsStore.setState((s) => ({
        ...s,
        definitions: s.definitions.filter((d) => d.id !== id),
      }));
    },
  });
}

// テスト失敗時もスパイ（URL.createObjectURL / HTMLAnchorElement.prototype.click 等）が
// 確実に元に戻るよう、ファイル全体で共通の後始末を行う。fake timers を使ったテストは
// 自分で `vi.useRealTimers()` を呼ぶか、ここで restore される前提でクリーンアップする。
// File-wide cleanup so spies on globals (URL.createObjectURL,
// HTMLAnchorElement.prototype.click, ...) are restored even if a test throws.
// Tests that opt into fake timers should restore real timers themselves;
// this hook handles spy restoration as a safety net.
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useWorkflowDraft - initial state and steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("starts with one empty step and an auto-generated id/name", () => {
    const { result } = renderHook(() => useWorkflowDraft());

    expect(result.current.draft.name).toBe("");
    expect(result.current.draft.steps).toHaveLength(1);
    expect(result.current.draft.steps[0]).toMatchObject({ title: "", instruction: "" });
    expect(result.current.draft.steps[0].id).toBeTruthy();
    expect(result.current.selectedSavedId).toBe("");
  });

  it("addStep appends a new empty step", () => {
    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.addStep();
    });

    expect(result.current.draft.steps).toHaveLength(2);
    expect(result.current.draft.steps[1]).toMatchObject({ title: "", instruction: "" });
  });

  it("addStep bumps updatedAt", () => {
    const { result } = renderHook(() => useWorkflowDraft());
    const before = result.current.draft.updatedAt;

    act(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(before + 1000));
      result.current.addStep();
      vi.useRealTimers();
    });

    expect(result.current.draft.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("removeStep removes the step at index", () => {
    const { result } = renderHook(() => useWorkflowDraft());
    act(() => {
      result.current.addStep();
      result.current.addStep();
    });
    expect(result.current.draft.steps).toHaveLength(3);

    act(() => {
      result.current.updateStep(0, { title: "first" });
      result.current.updateStep(1, { title: "second" });
      result.current.updateStep(2, { title: "third" });
    });
    act(() => {
      result.current.removeStep(1);
    });

    expect(result.current.draft.steps).toHaveLength(2);
    expect(result.current.draft.steps.map((s) => s.title)).toEqual(["first", "third"]);
  });

  it("updateStep applies a partial patch", () => {
    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.updateStep(0, { title: "T", instruction: "I" });
    });

    expect(result.current.draft.steps[0]).toMatchObject({ title: "T", instruction: "I" });
  });
});

describe("useWorkflowDraft - templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("loadTemplate populates the draft from a template id and clears selectedSavedId", () => {
    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.loadTemplate("code-investigate-design");
    });

    expect(result.current.draft.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.current.draft.name).toBe("aiChat.workflow.templates.codeInvestigateDesign");
    expect(result.current.selectedSavedId).toBe("");
  });
});

describe("useWorkflowDraft - saveCustom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("rejects save when draft.name is empty and toasts a destructive notice", () => {
    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.saveCustom();
    });

    expect(mockUpsertDefinition).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.workflow.nameRequired",
      variant: "destructive",
    });
  });

  it("upserts draft into the store and toasts success when name is set", () => {
    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.setDraft((d) => ({ ...d, name: "My Flow" }));
    });
    act(() => {
      result.current.saveCustom();
    });

    expect(mockUpsertDefinition).toHaveBeenCalledTimes(1);
    expect(mockUpsertDefinition).toHaveBeenCalledWith(expect.objectContaining({ name: "My Flow" }));
    expect(mockToast).toHaveBeenCalledWith({ title: "aiChat.workflow.saved" });
  });
});

describe("useWorkflowDraft - import / export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("exportJson opens a download link with sanitized filename", () => {
    // 実装は `window.setTimeout(..., 0)` で revokeObjectURL を遅延させるため、
    // fake timers を使ってフラッシュすることでフレーキーな実 setTimeout 待ちを避ける。
    // The hook defers `revokeObjectURL` via `window.setTimeout(..., 0)`; use fake
    // timers to flush deterministically and avoid flaky real-time waits.
    vi.useFakeTimers();
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.setDraft((d) => ({ ...d, name: "Plan A" }));
    });

    act(() => {
      result.current.exportJson();
    });

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Flush the queued setTimeout(..., 0) that triggers revokeObjectURL.
    vi.runAllTimers();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("exportJson uses 'workflow' as the fallback when name is empty", () => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    let downloadName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    const { result } = renderHook(() => useWorkflowDraft());
    act(() => {
      result.current.exportJson();
    });

    expect(downloadName).toBe("workflow.json");
    vi.runAllTimers();
  });

  it("onImportFile populates draft from a valid JSON file", async () => {
    const json = JSON.stringify({
      name: "Imported",
      steps: [{ title: "S1", instruction: "do" }],
    });
    const file = new File([json], "flow.json", { type: "application/json" });

    const { result } = renderHook(() => useWorkflowDraft());

    const fakeInput = document.createElement("input");
    fakeInput.type = "file";
    Object.defineProperty(fakeInput, "files", {
      value: [file],
      configurable: true,
    });
    const event = {
      target: fakeInput,
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.onImportFile(event);
    });

    await waitFor(() => {
      expect(result.current.draft.name).toBe("Imported");
    });
    expect(result.current.draft.steps).toHaveLength(1);
    expect(result.current.draft.steps[0]).toMatchObject({ title: "S1", instruction: "do" });
    expect(mockToast).toHaveBeenCalledWith({ title: "aiChat.workflow.imported" });
  });

  it("onImportFile is a no-op when no file is selected", () => {
    const { result } = renderHook(() => useWorkflowDraft());
    const initialName = result.current.draft.name;

    const event = {
      target: { files: null, value: "" } as unknown as HTMLInputElement,
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.onImportFile(event);
    });

    expect(result.current.draft.name).toBe(initialName);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("onImportFile toasts importFailed when JSON is invalid", async () => {
    const file = new File(["not json"], "bad.json", { type: "application/json" });

    const { result } = renderHook(() => useWorkflowDraft());

    const fakeInput = document.createElement("input");
    fakeInput.type = "file";
    Object.defineProperty(fakeInput, "files", {
      value: [file],
      configurable: true,
    });
    const event = {
      target: fakeInput,
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.onImportFile(event);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: "aiChat.workflow.importFailed",
        variant: "destructive",
      });
    });
  });
});

describe("useWorkflowDraft - saved definitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loadSaved copies the matching definition into the draft", () => {
    const saved: WorkflowDefinition = {
      id: "saved-1",
      name: "Saved",
      steps: [{ id: "s1", title: "T", instruction: "I" }],
      createdAt: 100,
      updatedAt: 200,
    };
    resetStore([saved]);
    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.loadSaved("saved-1");
    });

    expect(result.current.draft.id).toBe("saved-1");
    expect(result.current.draft.name).toBe("Saved");
    expect(result.current.selectedSavedId).toBe("saved-1");
  });

  it("loadSaved is a no-op when the id is unknown", () => {
    resetStore([]);
    const { result } = renderHook(() => useWorkflowDraft());
    const before = result.current.draft;

    act(() => {
      result.current.loadSaved("missing");
    });

    expect(result.current.draft).toBe(before);
    expect(result.current.selectedSavedId).toBe("");
  });

  it("deleteSaved is a no-op when nothing is selected", () => {
    resetStore([]);
    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.deleteSaved();
    });

    expect(mockRemoveDefinition).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("deleteSaved removes the selected definition and toasts deleted", () => {
    const saved: WorkflowDefinition = {
      id: "saved-2",
      name: "Saved Two",
      steps: [{ id: "s1", title: "T", instruction: "I" }],
      createdAt: 100,
      updatedAt: 200,
    };
    resetStore([saved]);
    const { result } = renderHook(() => useWorkflowDraft());

    act(() => {
      result.current.loadSaved("saved-2");
    });
    act(() => {
      result.current.deleteSaved();
    });

    expect(mockRemoveDefinition).toHaveBeenCalledWith("saved-2");
    expect(result.current.selectedSavedId).toBe("");
    expect(mockToast).toHaveBeenCalledWith({ title: "aiChat.workflow.deleted" });
  });
});
