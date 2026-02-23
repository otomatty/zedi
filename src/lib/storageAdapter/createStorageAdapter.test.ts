import { describe, it, expect, afterEach } from "vitest";
import { createStorageAdapter } from "./createStorageAdapter";

describe("createStorageAdapter", () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("returns IndexedDBStorageAdapter in browser (non-Tauri) environment", () => {
    const adapter = createStorageAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.constructor.name).toBe("IndexedDBStorageAdapter");
  });

  it("throws error when in Tauri environment", () => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(() => createStorageAdapter()).toThrow(
      "TauriStorageAdapter is not implemented yet (Phase D)."
    );
  });
});
