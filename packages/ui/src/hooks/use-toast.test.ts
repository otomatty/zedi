/**
 * use-toast のテスト。
 * - reducer の state 遷移（ADD / UPDATE / DISMISS / REMOVE）
 * - useToast フックの subscription / dispatch 経路
 *
 * Tests for the use-toast module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { reducer, toast, useToast } from "./use-toast";

type State = ReturnType<typeof reducer>;
type Toast = State["toasts"][number];

const makeToast = (id: string, overrides: Partial<Toast> = {}): Toast =>
  ({
    id,
    open: true,
    title: id,
    ...overrides,
  }) as Toast;

describe("use-toast reducer", () => {
  it("ADD_TOAST は配列の先頭に追加し、TOAST_LIMIT(=1) で切り詰める", () => {
    const after = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: makeToast("a") });
    expect(after.toasts).toHaveLength(1);
    expect(after.toasts[0]?.id).toBe("a");

    const second = reducer(after, { type: "ADD_TOAST", toast: makeToast("b") });
    // 上限 1 件で切り詰められる
    expect(second.toasts).toHaveLength(1);
    expect(second.toasts[0]?.id).toBe("b");
  });

  it("UPDATE_TOAST は同じ id の toast をマージする / merges fields by id", () => {
    const initial: State = { toasts: [makeToast("a", { title: "old" })] };
    const after = reducer(initial, {
      type: "UPDATE_TOAST",
      toast: { id: "a", title: "new" } as Partial<Toast>,
    });
    expect(after.toasts[0]?.title).toBe("new");
  });

  it("DISMISS_TOAST(id) は対象を open:false にする / closes only the targeted toast", () => {
    const initial: State = {
      toasts: [makeToast("a"), makeToast("b")],
    };
    const after = reducer(initial, { type: "DISMISS_TOAST", toastId: "a" });
    const a = after.toasts.find((t) => t.id === "a");
    const b = after.toasts.find((t) => t.id === "b");
    expect(a?.open).toBe(false);
    expect(b?.open).toBe(true);
  });

  it("DISMISS_TOAST(undefined) は全 toast を open:false にする / closes all toasts", () => {
    const initial: State = {
      toasts: [makeToast("a"), makeToast("b")],
    };
    const after = reducer(initial, { type: "DISMISS_TOAST" });
    expect(after.toasts.every((t) => t.open === false)).toBe(true);
  });

  it("REMOVE_TOAST(id) は配列から該当 toast を消す / removes toast by id", () => {
    const initial: State = { toasts: [makeToast("a"), makeToast("b")] };
    const after = reducer(initial, { type: "REMOVE_TOAST", toastId: "a" });
    expect(after.toasts).toHaveLength(1);
    expect(after.toasts[0]?.id).toBe("b");
  });

  it("REMOVE_TOAST(undefined) は配列を空にする / clears all toasts", () => {
    const initial: State = { toasts: [makeToast("a"), makeToast("b")] };
    const after = reducer(initial, { type: "REMOVE_TOAST" });
    expect(after.toasts).toHaveLength(0);
  });
});

describe("toast() / useToast()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // 永続している memoryState を空にするために dismiss + REMOVE 動作を待つ
    // Reset memoryState by dispatching dismiss/remove via the public API.
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.dismiss();
    });
  });

  it("toast() を呼ぶと subscriber に新しい toast が伝播される / emits new toast to subscribers", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toHaveLength(0);

    act(() => {
      toast({ title: "Hello" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.title).toBe("Hello");
    expect(result.current.toasts[0]?.open).toBe(true);
  });

  it("dismiss() で open: false に変わる / dismiss flips open to false", () => {
    const { result } = renderHook(() => useToast());

    let id = "";
    act(() => {
      id = toast({ title: "Hello" }).id;
    });

    act(() => {
      result.current.dismiss(id);
    });

    expect(result.current.toasts[0]?.open).toBe(false);
  });

  it("toast().update() が subscriber に伝播 / update propagates to subscribers", () => {
    const { result } = renderHook(() => useToast());

    let api: ReturnType<typeof toast> | null = null;
    act(() => {
      api = toast({ title: "old" });
    });

    act(() => {
      api?.update({
        ...(result.current.toasts[0] as Toast),
        title: "new",
      });
    });

    expect(result.current.toasts[0]?.title).toBe("new");
  });

  it("onOpenChange(false) で dismiss されたかのように open:false になる / onOpenChange(false) triggers dismiss", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      toast({ title: "x" });
    });
    const created = result.current.toasts[0];
    expect(created?.open).toBe(true);

    act(() => {
      created?.onOpenChange?.(false);
    });
    expect(result.current.toasts[0]?.open).toBe(false);
  });
});
