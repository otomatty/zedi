import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearLegacyOnboardingCaches,
  clearOnboardingCache,
  getOnboardingCache,
  markSetupWizardCompletedCache,
  setOnboardingCache,
} from "./onboardingState";

const USER_A = "user-a";
const USER_B = "user-b";
const keyFor = (userId: string) => `zedi-onboarding-cache:${userId}`;
const LEGACY_GLOBAL_KEY = "zedi-onboarding-cache";
const PRE_V2_LEGACY_KEY = "zedi-onboarding";

describe("onboardingState", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getOnboardingCache", () => {
    it("returns defaults when nothing is stored for the user", () => {
      expect(getOnboardingCache(USER_A)).toEqual({ hasCompletedSetupWizard: false });
    });

    it("returns defaults (without reading storage) when userId is missing", () => {
      localStorage.setItem(LEGACY_GLOBAL_KEY, JSON.stringify({ hasCompletedSetupWizard: true }));
      expect(getOnboardingCache(null)).toEqual({ hasCompletedSetupWizard: false });
      expect(getOnboardingCache(undefined)).toEqual({ hasCompletedSetupWizard: false });
    });

    it("reads the per-user entry and coerces unknown fields", () => {
      localStorage.setItem(
        keyFor(USER_A),
        JSON.stringify({ hasCompletedSetupWizard: true, legacy: "ignored" }),
      );
      expect(getOnboardingCache(USER_A)).toEqual({ hasCompletedSetupWizard: true });
    });

    it("isolates completion flags between users", () => {
      localStorage.setItem(keyFor(USER_A), JSON.stringify({ hasCompletedSetupWizard: true }));
      expect(getOnboardingCache(USER_A).hasCompletedSetupWizard).toBe(true);
      expect(getOnboardingCache(USER_B).hasCompletedSetupWizard).toBe(false);
    });

    it("returns defaults and warns on invalid JSON", () => {
      localStorage.setItem(keyFor(USER_A), "{not json");
      const warn = vi.spyOn(console, "warn");
      expect(getOnboardingCache(USER_A)).toEqual({ hasCompletedSetupWizard: false });
      expect(warn).toHaveBeenCalled();
    });

    it("treats any non-true value for hasCompletedSetupWizard as false", () => {
      localStorage.setItem(keyFor(USER_A), JSON.stringify({ hasCompletedSetupWizard: "yes" }));
      expect(getOnboardingCache(USER_A)).toEqual({ hasCompletedSetupWizard: false });
    });
  });

  describe("setOnboardingCache", () => {
    it("merges partial updates onto the existing cache for that user", () => {
      setOnboardingCache(USER_A, { hasCompletedSetupWizard: true });
      const stored = JSON.parse(localStorage.getItem(keyFor(USER_A)) ?? "{}");
      expect(stored).toEqual({ hasCompletedSetupWizard: true });
    });

    it("is a no-op when userId is missing", () => {
      setOnboardingCache(null, { hasCompletedSetupWizard: true });
      setOnboardingCache(undefined, { hasCompletedSetupWizard: true });
      expect(localStorage.length).toBe(0);
    });

    it("does not throw when localStorage.setItem fails", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => setOnboardingCache(USER_A, { hasCompletedSetupWizard: true })).not.toThrow();
      setItemSpy.mockRestore();
    });
  });

  describe("markSetupWizardCompletedCache", () => {
    it("sets hasCompletedSetupWizard to true for the given user", () => {
      markSetupWizardCompletedCache(USER_A);
      expect(getOnboardingCache(USER_A)).toEqual({ hasCompletedSetupWizard: true });
      expect(getOnboardingCache(USER_B)).toEqual({ hasCompletedSetupWizard: false });
    });
  });

  describe("clearOnboardingCache", () => {
    it("removes the user's key along with both legacy keys", () => {
      localStorage.setItem(keyFor(USER_A), JSON.stringify({ hasCompletedSetupWizard: true }));
      localStorage.setItem(LEGACY_GLOBAL_KEY, JSON.stringify({ hasCompletedSetupWizard: true }));
      localStorage.setItem(PRE_V2_LEGACY_KEY, JSON.stringify({ hasCompletedTour: true }));
      clearOnboardingCache(USER_A);
      expect(localStorage.getItem(keyFor(USER_A))).toBeNull();
      expect(localStorage.getItem(LEGACY_GLOBAL_KEY)).toBeNull();
      expect(localStorage.getItem(PRE_V2_LEGACY_KEY)).toBeNull();
      expect(getOnboardingCache(USER_A)).toEqual({ hasCompletedSetupWizard: false });
    });

    it("does not touch another user's entry", () => {
      localStorage.setItem(keyFor(USER_A), JSON.stringify({ hasCompletedSetupWizard: true }));
      localStorage.setItem(keyFor(USER_B), JSON.stringify({ hasCompletedSetupWizard: true }));
      clearOnboardingCache(USER_A);
      expect(localStorage.getItem(keyFor(USER_A))).toBeNull();
      expect(getOnboardingCache(USER_B)).toEqual({ hasCompletedSetupWizard: true });
    });
  });

  describe("clearLegacyOnboardingCaches", () => {
    it("only clears legacy keys, leaving per-user entries intact", () => {
      localStorage.setItem(LEGACY_GLOBAL_KEY, JSON.stringify({ hasCompletedSetupWizard: true }));
      localStorage.setItem(PRE_V2_LEGACY_KEY, JSON.stringify({ hasCompletedTour: true }));
      localStorage.setItem(keyFor(USER_A), JSON.stringify({ hasCompletedSetupWizard: true }));
      clearLegacyOnboardingCaches();
      expect(localStorage.getItem(LEGACY_GLOBAL_KEY)).toBeNull();
      expect(localStorage.getItem(PRE_V2_LEGACY_KEY)).toBeNull();
      expect(getOnboardingCache(USER_A)).toEqual({ hasCompletedSetupWizard: true });
    });
  });
});
