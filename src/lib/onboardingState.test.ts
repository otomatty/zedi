import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getOnboardingCache,
  setOnboardingCache,
  markSetupWizardCompletedCache,
  clearOnboardingCache,
} from "./onboardingState";

const STORAGE_KEY = "zedi-onboarding-cache";
const LEGACY_KEY = "zedi-onboarding";

describe("onboardingState", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getOnboardingCache", () => {
    it("returns defaults when nothing is stored", () => {
      expect(getOnboardingCache()).toEqual({ hasCompletedSetupWizard: false });
    });

    it("reads stored cache and coerces unknown fields to defaults", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hasCompletedSetupWizard: true, legacy: "ignored" }),
      );
      expect(getOnboardingCache()).toEqual({ hasCompletedSetupWizard: true });
    });

    it("returns defaults on invalid JSON and logs a warning", () => {
      localStorage.setItem(STORAGE_KEY, "{not json");
      const warn = vi.spyOn(console, "warn");
      expect(getOnboardingCache()).toEqual({ hasCompletedSetupWizard: false });
      expect(warn).toHaveBeenCalled();
    });

    it("treats any non-true value for hasCompletedSetupWizard as false", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ hasCompletedSetupWizard: "yes" }));
      expect(getOnboardingCache()).toEqual({ hasCompletedSetupWizard: false });
    });
  });

  describe("setOnboardingCache", () => {
    it("merges partial updates onto the existing cache", () => {
      setOnboardingCache({ hasCompletedSetupWizard: true });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored).toEqual({ hasCompletedSetupWizard: true });
    });

    it("does not throw when localStorage.setItem fails", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => setOnboardingCache({ hasCompletedSetupWizard: true })).not.toThrow();
      setItemSpy.mockRestore();
    });
  });

  describe("markSetupWizardCompletedCache", () => {
    it("sets hasCompletedSetupWizard to true", () => {
      markSetupWizardCompletedCache();
      expect(getOnboardingCache()).toEqual({ hasCompletedSetupWizard: true });
    });
  });

  describe("clearOnboardingCache", () => {
    it("removes the current key and the legacy key", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ hasCompletedSetupWizard: true }));
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ hasCompletedTour: true }));
      clearOnboardingCache();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
      expect(getOnboardingCache()).toEqual({ hasCompletedSetupWizard: false });
    });
  });
});
