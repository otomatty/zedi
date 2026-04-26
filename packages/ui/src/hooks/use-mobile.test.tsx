/**
 * useIsMobile のテスト。
 * - matchMedia の subscribe / snapshot を介して値が更新されること
 * - breakpoint 定数の妥当性
 *
 * Tests for useIsMobile.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MOBILE_BREAKPOINT, useIsMobile } from "./use-mobile";

interface MockMql {
  matches: boolean;
  listeners: Set<(e: MediaQueryListEvent) => void>;
}

function installMatchMedia(initialMatches: boolean): { mql: MockMql; restore: () => void } {
  const mql: MockMql = { matches: initialMatches, listeners: new Set() };
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return mql.matches;
    },
    media: "",
    onchange: null,
    addEventListener: (_evt: string, listener: (e: MediaQueryListEvent) => void) => {
      mql.listeners.add(listener);
    },
    removeEventListener: (_evt: string, listener: (e: MediaQueryListEvent) => void) => {
      mql.listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return {
    mql,
    restore: () => {
      window.matchMedia = original;
    },
  };
}

describe("MOBILE_BREAKPOINT", () => {
  it("Tailwind の md (768) と一致 / matches Tailwind md breakpoint", () => {
    expect(MOBILE_BREAKPOINT).toBe(768);
  });
});

describe("useIsMobile", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    cleanup = null;
  });

  afterEach(() => {
    cleanup?.();
  });

  it("初回スナップショットが false なら false を返す / returns initial snapshot value", () => {
    const { mql, restore } = installMatchMedia(false);
    cleanup = restore;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    expect(mql.listeners.size).toBeGreaterThan(0);
  });

  it("初回スナップショットが true なら true を返す / returns true when viewport is mobile", () => {
    const { restore } = installMatchMedia(true);
    cleanup = restore;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("media query 変化で値が更新される / updates on media query change", () => {
    const { mql, restore } = installMatchMedia(false);
    cleanup = restore;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      mql.matches = true;
      mql.listeners.forEach((l) => l({ matches: true } as MediaQueryListEvent));
    });
    expect(result.current).toBe(true);
  });

  it("アンマウント時に listener が解除される / unsubscribes on unmount", () => {
    const { mql, restore } = installMatchMedia(false);
    cleanup = restore;
    const { unmount } = renderHook(() => useIsMobile());
    expect(mql.listeners.size).toBe(1);
    unmount();
    expect(mql.listeners.size).toBe(0);
  });
});
