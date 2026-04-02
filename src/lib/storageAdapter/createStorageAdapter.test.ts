import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createStorageAdapter } from "./createStorageAdapter";
import { IndexedDBStorageAdapter } from "./IndexedDBStorageAdapter";

describe("createStorageAdapter", () => {
  let originalTauriInternals: unknown;

  beforeEach(() => {
    originalTauriInternals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    if (originalTauriInternals === undefined) {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    } else {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = originalTauriInternals;
    }
  });

  it("returns IndexedDBStorageAdapter in browser (non-Tauri) environment", () => {
    const adapter = createStorageAdapter();
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(IndexedDBStorageAdapter);
  });

  it("falls back to IndexedDB in Tauri environment until TauriStorageAdapter exists (#50)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const adapter = createStorageAdapter();
    expect(adapter).toBeInstanceOf(IndexedDBStorageAdapter);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Tauri detected but TauriStorageAdapter not yet available"),
    );
    warnSpy.mockRestore();
  });
});
