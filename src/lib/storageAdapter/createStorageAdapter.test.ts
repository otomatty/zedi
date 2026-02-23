import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createStorageAdapter } from "./createStorageAdapter";
import { IndexedDBStorageAdapter } from "./IndexedDBStorageAdapter";

describe("createStorageAdapter", () => {
  let originalTauriInternals: unknown;

  beforeEach(() => {
    originalTauriInternals = (window as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    if (originalTauriInternals === undefined) {
      delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    } else {
      (window as Record<string, unknown>).__TAURI_INTERNALS__ = originalTauriInternals;
    }
  });

  it("returns IndexedDBStorageAdapter in browser (non-Tauri) environment", () => {
    const adapter = createStorageAdapter();
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(IndexedDBStorageAdapter);
  });

  it("throws error when in Tauri environment", () => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(() => createStorageAdapter()).toThrow(
      "TauriStorageAdapter is not implemented yet (Phase D).",
    );
  });
});
