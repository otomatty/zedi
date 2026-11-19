import { describe, expect, it, vi } from "vitest";
import { createFrameBatcher } from "./frameBatcher";

function manualScheduler() {
  let pending: (() => void) | null = null;
  return {
    schedule: vi.fn((cb: () => void) => {
      pending = cb;
      return 1;
    }),
    cancel: vi.fn(() => {
      pending = null;
    }),
    runFrame() {
      const cb = pending;
      pending = null;
      cb?.();
    },
  };
}

describe("createFrameBatcher", () => {
  it("coalesces all pushes within a frame into a single flush", () => {
    const s = manualScheduler();
    const flush = vi.fn();
    const batcher = createFrameBatcher(flush, s.schedule, s.cancel);
    batcher.push("a");
    batcher.push("b");
    batcher.push("c");
    expect(s.schedule).toHaveBeenCalledTimes(1);
    s.runFrame();
    expect(flush).toHaveBeenCalledExactlyOnceWith("abc");
  });

  it("schedules a new frame for pushes after a flush", () => {
    const s = manualScheduler();
    const flush = vi.fn();
    const batcher = createFrameBatcher(flush, s.schedule, s.cancel);
    batcher.push("a");
    s.runFrame();
    batcher.push("b");
    s.runFrame();
    expect(flush.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("flushes pending text immediately on flushNow and cancels the frame", () => {
    const s = manualScheduler();
    const flush = vi.fn();
    const batcher = createFrameBatcher(flush, s.schedule, s.cancel);
    batcher.push("x");
    batcher.flushNow();
    expect(flush).toHaveBeenCalledExactlyOnceWith("x");
    expect(s.cancel).toHaveBeenCalledTimes(1);
    batcher.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("drops pending text after dispose", () => {
    const s = manualScheduler();
    const flush = vi.fn();
    const batcher = createFrameBatcher(flush, s.schedule, s.cancel);
    batcher.push("x");
    batcher.dispose();
    s.runFrame();
    batcher.push("y");
    expect(flush).not.toHaveBeenCalled();
  });
});
