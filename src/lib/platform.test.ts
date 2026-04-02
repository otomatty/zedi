import { describe, it, expect, afterEach } from "vitest";
import { isTauriDesktop } from "./platform";

describe("isTauriDesktop", () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("returns false when __TAURI_INTERNALS__ is absent", () => {
    expect(isTauriDesktop()).toBe(false);
  });

  it("returns true when __TAURI_INTERNALS__ is present", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isTauriDesktop()).toBe(true);
  });
});
