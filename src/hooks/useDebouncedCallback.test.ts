/** Debounced callback behavior. / デバウンスの公開動作を検証する。 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

describe("useDebouncedCallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the full delay and forwards the scheduled arguments once", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => {
      result.current("note-a", 42);
      vi.advanceTimersByTime(99);
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(callback).toHaveBeenCalledExactlyOnceWith("note-a", 42);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("uses the latest callback at the original deadline and keeps its returned function", () => {
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useDebouncedCallback(callback, 100), {
      initialProps: { callback: firstCallback },
    });
    const scheduledCallback = result.current;

    act(() => {
      scheduledCallback("pending");
      vi.advanceTimersByTime(60);
    });
    rerender({ callback: latestCallback });

    expect(result.current).toBe(scheduledCallback);
    act(() => {
      vi.advanceTimersByTime(39);
    });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledExactlyOnceWith("pending");
  });

  it("restarts the delay and uses only the latest arguments when called again", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => {
      result.current("first");
      vi.advanceTimersByTime(60);
      result.current("second", 2);
      vi.advanceTimersByTime(40);
    });

    expect(callback).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(59);
    });
    expect(callback).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledExactlyOnceWith("second", 2);
  });

  it("cancels a pending invocation on unmount", () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => {
      result.current("discarded");
      vi.advanceTimersByTime(50);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(callback).not.toHaveBeenCalled();
  });
});
