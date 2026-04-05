import { describe, it, expect, afterEach } from "vitest";
import { isTauriDesktop } from "./platform";

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

describe("isTauriDesktop", () => {
  afterEach(() => {
    delete (window as TauriWindow).__TAURI_INTERNALS__;
  });

  it("returns false when __TAURI_INTERNALS__ is absent", () => {
    expect(isTauriDesktop()).toBe(false);
  });

  it("returns true when __TAURI_INTERNALS__ is present", () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = {};
    expect(isTauriDesktop()).toBe(true);
  });
});
