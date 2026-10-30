import { describe, expect, it, vi } from "vitest";
import { createTrailingDebounce, isRemoteAwarenessChange } from "./caretScheduling";

describe("isRemoteAwarenessChange", () => {
  it("ignores changes that only touch the local client", () => {
    expect(isRemoteAwarenessChange({ added: [], updated: [7], removed: [] }, 7)).toBe(false);
  });

  it("reports changes from any other client", () => {
    expect(isRemoteAwarenessChange({ added: [8], updated: [], removed: [] }, 7)).toBe(true);
    expect(isRemoteAwarenessChange({ added: [], updated: [7, 9], removed: [] }, 7)).toBe(true);
    expect(isRemoteAwarenessChange({ added: [], updated: [], removed: [3] }, 7)).toBe(true);
  });
});

describe("createTrailingDebounce", () => {
  it("runs once after calls stop for the wait period", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = createTrailingDebounce(fn, 100);
    debounced.schedule();
    vi.advanceTimersByTime(60);
    debounced.schedule();
    vi.advanceTimersByTime(60);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("runs immediately on flush and does nothing after cancel", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = createTrailingDebounce(fn, 100);
    debounced.schedule();
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    debounced.schedule();
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
