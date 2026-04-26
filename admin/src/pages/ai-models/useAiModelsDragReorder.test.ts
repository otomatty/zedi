/**
 * useAiModelsDragReorder のテスト。
 * - 並び替えと永続化の楽観的更新 / optimistic reorder + persist
 * - エラー時の load() による recovery / load() recovery on failure
 *
 * Tests for useAiModelsDragReorder.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAiModelsDragReorder } from "./useAiModelsDragReorder";
import type { AiModelAdmin } from "@/api/admin";

vi.mock("@/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/admin")>();
  return {
    ...actual,
    patchAiModelsBulk: vi.fn(),
  };
});

const { patchAiModelsBulk } = await import("@/api/admin");

const makeModel = (id: string, sortOrder: number): AiModelAdmin => ({
  id,
  provider: "openai",
  modelId: id,
  displayName: id.toUpperCase(),
  tierRequired: "pro",
  inputCostUnits: 100,
  outputCostUnits: 100,
  isActive: true,
  sortOrder,
  createdAt: "2026-01-01T00:00:00Z",
});

type LoadFn = (showLoading?: boolean) => Promise<void>;

interface Args {
  models: AiModelAdmin[];
  setModels: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  isMountedRef: { current: boolean };
  load: LoadFn & ReturnType<typeof vi.fn>;
}

function createArgs(models: AiModelAdmin[]): Args {
  // `load` の型は (showLoading?: boolean) => Promise<void> なので、
  // Mock の汎用シグネチャを LoadFn にキャストして型エラーを回避する。
  // Cast vi.fn() to LoadFn so the hook's `load` prop type is satisfied.
  const load = vi.fn().mockResolvedValue(undefined) as ReturnType<typeof vi.fn> & LoadFn;
  return {
    models,
    setModels: vi.fn(),
    setError: vi.fn(),
    isMountedRef: { current: true },
    load,
  };
}

function makeDragEvent(payload: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(payload));
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      effectAllowed: "",
      dropEffect: "",
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? "",
    },
  } as unknown as React.DragEvent;
}

describe("useAiModelsDragReorder.handleReorder", () => {
  beforeEach(() => {
    vi.mocked(patchAiModelsBulk).mockReset();
  });

  it("配列を並び替えて sortOrder を採番し直し、API を呼ぶ / reorders and persists with re-numbered sortOrder", async () => {
    vi.mocked(patchAiModelsBulk).mockResolvedValueOnce({ updated: 3, models: [] });
    const models = [makeModel("a", 0), makeModel("b", 1), makeModel("c", 2)];
    const args = createArgs(models);

    const { result } = renderHook(() =>
      useAiModelsDragReorder({
        models: args.models,
        setModels: args.setModels as never,
        setError: args.setError as never,
        isMountedRef: args.isMountedRef as never,
        load: args.load,
      }),
    );

    // handleReorder は内部関数なので handleDrop 経由で 0 → 2 の移動を発火する
    // (a を末尾に動かす)。
    // Trigger handleReorder via handleDrop (drop "a" onto "c" => move to end).
    await act(async () => {
      result.current.handleDrop(makeDragEvent({ "text/plain": "a" }), "c");
      await Promise.resolve();
    });

    // 楽観的に setModels が呼ばれている
    expect(args.setModels).toHaveBeenCalledTimes(1);
    const updater = args.setModels.mock.calls[0]?.[0] as AiModelAdmin[];
    expect(updater.map((m) => m.id)).toEqual(["b", "c", "a"]);
    expect(updater.map((m) => m.sortOrder)).toEqual([0, 1, 2]);
    expect(patchAiModelsBulk).toHaveBeenCalledWith([
      { id: "b", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "a", sortOrder: 2 },
    ]);
  });

  it("API が失敗したら load(false) で再取得し、setError にメッセージを渡す / falls back to load() and surfaces error", async () => {
    vi.mocked(patchAiModelsBulk).mockRejectedValueOnce(new Error("server-down"));
    const args = createArgs([makeModel("a", 0), makeModel("b", 1)]);

    const { result } = renderHook(() =>
      useAiModelsDragReorder({
        models: args.models,
        setModels: args.setModels as never,
        setError: args.setError as never,
        isMountedRef: args.isMountedRef as never,
        load: args.load,
      }),
    );

    await act(async () => {
      result.current.handleDrop(makeDragEvent({ "text/plain": "a" }), "b");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(args.load).toHaveBeenCalledWith(false);
    expect(args.setError).toHaveBeenLastCalledWith("server-down");
  });

  it("失敗時に既にアンマウントなら load も setError も呼ばない / skip recovery when unmounted", async () => {
    let rejectFn: (() => void) | null = null;
    vi.mocked(patchAiModelsBulk).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectFn = () => reject(new Error("late"));
      }) as never,
    );
    const args = createArgs([makeModel("a", 0), makeModel("b", 1)]);

    const { result } = renderHook(() =>
      useAiModelsDragReorder({
        models: args.models,
        setModels: args.setModels as never,
        setError: args.setError as never,
        isMountedRef: args.isMountedRef as never,
        load: args.load,
      }),
    );

    await act(async () => {
      result.current.handleDrop(makeDragEvent({ "text/plain": "a" }), "b");
      await Promise.resolve();
    });

    args.isMountedRef.current = false;
    await act(async () => {
      rejectFn?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(args.load).not.toHaveBeenCalled();
    expect(args.setError).toHaveBeenCalledTimes(1); // 楽観的更新時の null reset のみ
    expect(args.setError).toHaveBeenCalledWith(null);
  });

  it("fromIndex === toIndex の場合は何もしない / no-op when index is the same", async () => {
    const args = createArgs([makeModel("a", 0)]);
    const { result } = renderHook(() =>
      useAiModelsDragReorder({
        models: args.models,
        setModels: args.setModels as never,
        setError: args.setError as never,
        isMountedRef: args.isMountedRef as never,
        load: args.load,
      }),
    );

    await act(async () => {
      result.current.handleDrop(makeDragEvent({ "text/plain": "a" }), "a");
      await Promise.resolve();
    });

    expect(args.setModels).not.toHaveBeenCalled();
    expect(patchAiModelsBulk).not.toHaveBeenCalled();
  });
});

describe("useAiModelsDragReorder drag state", () => {
  it("handleDragStart で draggedId を設定し、dataTransfer に id を入れる / sets draggedId and writes id to dataTransfer", () => {
    const args = createArgs([makeModel("a", 0)]);
    const { result } = renderHook(() =>
      useAiModelsDragReorder({
        models: args.models,
        setModels: args.setModels as never,
        setError: args.setError as never,
        isMountedRef: args.isMountedRef as never,
        load: args.load,
      }),
    );

    const ev = makeDragEvent();
    act(() => {
      result.current.handleDragStart(ev, "a");
    });

    expect(result.current.draggedId).toBe("a");
    expect(ev.dataTransfer.effectAllowed).toBe("move");
    expect(ev.dataTransfer.getData("text/plain")).toBe("a");
    expect(JSON.parse(ev.dataTransfer.getData("application/json"))).toEqual({ id: "a" });
  });

  it("handleDragOver で dragOverId を設定し preventDefault を呼ぶ / sets dragOverId and calls preventDefault", () => {
    const args = createArgs([makeModel("a", 0)]);
    const { result } = renderHook(() =>
      useAiModelsDragReorder({
        models: args.models,
        setModels: args.setModels as never,
        setError: args.setError as never,
        isMountedRef: args.isMountedRef as never,
        load: args.load,
      }),
    );

    const ev = makeDragEvent();
    act(() => {
      result.current.handleDragOver(ev, "a");
    });

    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ev.dataTransfer.dropEffect).toBe("move");
    expect(result.current.dragOverId).toBe("a");
  });

  it("handleDragEnd / handleDragLeave で id 状態がクリアされる / clears drag id state on drag end/leave", () => {
    const args = createArgs([makeModel("a", 0)]);
    const { result } = renderHook(() =>
      useAiModelsDragReorder({
        models: args.models,
        setModels: args.setModels as never,
        setError: args.setError as never,
        isMountedRef: args.isMountedRef as never,
        load: args.load,
      }),
    );

    act(() => {
      result.current.handleDragStart(makeDragEvent(), "a");
      result.current.handleDragOver(makeDragEvent(), "a");
    });
    expect(result.current.draggedId).toBe("a");

    act(() => {
      result.current.handleDragEnd();
    });
    expect(result.current.draggedId).toBeNull();
    expect(result.current.dragOverId).toBeNull();

    act(() => {
      result.current.handleDragOver(makeDragEvent(), "a");
      result.current.handleDragLeave();
    });
    expect(result.current.dragOverId).toBeNull();
  });
});
