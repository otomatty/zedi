import { describe, it, expect } from "vitest";
import { mergeAbortSignals } from "./mergeAbortSignals";

describe("mergeAbortSignals", () => {
  it("returns internal signal when external is undefined", () => {
    const internal = new AbortController();
    const merged = mergeAbortSignals(undefined, internal);
    expect(merged).toBe(internal.signal);
  });

  it("aborts merged when external aborts", () => {
    const external = new AbortController();
    const internal = new AbortController();
    const merged = mergeAbortSignals(external.signal, internal);
    let aborted = false;
    merged.addEventListener("abort", () => {
      aborted = true;
    });
    external.abort();
    expect(aborted).toBe(true);
    expect(merged.aborted).toBe(true);
  });

  it("aborts merged when internal aborts", () => {
    const external = new AbortController();
    const internal = new AbortController();
    const merged = mergeAbortSignals(external.signal, internal);
    internal.abort();
    expect(merged.aborted).toBe(true);
  });
});
