/**
 * Tests for the insert-position localStorage helpers.
 * 挿入位置を localStorage に保持するヘルパーのテスト。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSlashAgentInsertPosition, writeSlashAgentInsertPosition } from "./insertPosition";

const STORAGE_KEY = "zedi.slashAgent.insertPosition";

describe("readSlashAgentInsertPosition", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'cursor' when no value is stored", () => {
    expect(readSlashAgentInsertPosition()).toBe("cursor");
  });

  it("returns 'end' when 'end' is stored", () => {
    window.localStorage.setItem(STORAGE_KEY, "end");
    expect(readSlashAgentInsertPosition()).toBe("end");
  });

  it("returns 'cursor' when an unknown value is stored", () => {
    // 仕様外の値は cursor にフォールバック（前向きに壊れない）。
    // Unknown values fall back to 'cursor' (forward-compatible).
    window.localStorage.setItem(STORAGE_KEY, "middle");
    expect(readSlashAgentInsertPosition()).toBe("cursor");
  });

  it("returns 'cursor' when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      expect(readSlashAgentInsertPosition()).toBe("cursor");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("writeSlashAgentInsertPosition", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists 'end' under the canonical key", () => {
    writeSlashAgentInsertPosition("end");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("end");
  });

  it("persists 'cursor' under the canonical key", () => {
    writeSlashAgentInsertPosition("cursor");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("cursor");
  });

  it("swallows quota / private-mode errors silently", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      // 例外が外に漏れないことを契約として固定する。
      // Pin the contract that errors do not propagate.
      expect(() => writeSlashAgentInsertPosition("end")).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("readSlashAgentInsertPosition — non-browser environment", () => {
  // jsdom 上で window を一時的に消し、SSR 経路の早期 return を確認する。
  // Temporarily delete window to exercise the SSR early return.
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    originalWindow = globalThis.window;
    // @ts-expect-error -- intentional removal for SSR coverage
    delete (globalThis as { window?: unknown }).window;
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as { window?: typeof globalThis.window }).window = originalWindow;
    }
  });

  it("defaults to 'cursor' when window is undefined", () => {
    expect(readSlashAgentInsertPosition()).toBe("cursor");
  });

  it("writeSlashAgentInsertPosition is a no-op when window is undefined", () => {
    expect(() => writeSlashAgentInsertPosition("end")).not.toThrow();
  });
});
