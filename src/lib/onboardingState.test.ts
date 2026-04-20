import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getOnboardingState,
  saveOnboardingState,
  markSetupWizardCompleted,
  markTourCompleted,
  markStepCompleted,
  dismissHint,
  shouldShowHint,
  resetOnboardingState,
} from "./onboardingState";

const STORAGE_KEY = "zedi-onboarding";

describe("onboardingState", () => {
  beforeEach(() => {
    localStorage.clear();
    // Avoid noisy error logs in tests that intentionally trigger error paths.
    // エラー経路を意図的に通すテスト用に console.error を抑制する。
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getOnboardingState", () => {
    it("localStorage に保存が無いときはデフォルト状態を返す", () => {
      expect(getOnboardingState()).toEqual({
        hasCompletedSetupWizard: false,
        hasCompletedTour: false,
        completedSteps: [],
        dismissedHints: [],
      });
    });

    it("保存済みの有効な JSON をデフォルトにマージして返す", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hasCompletedSetupWizard: true, completedSteps: ["step-1"] }),
      );
      expect(getOnboardingState()).toEqual({
        hasCompletedSetupWizard: true,
        hasCompletedTour: false,
        completedSteps: ["step-1"],
        dismissedHints: [],
      });
    });

    it("保存された JSON のフィールドがデフォルト値を上書きする", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          hasCompletedSetupWizard: true,
          hasCompletedTour: true,
          completedSteps: ["a", "b"],
          dismissedHints: ["hint-1"],
        }),
      );
      expect(getOnboardingState()).toEqual({
        hasCompletedSetupWizard: true,
        hasCompletedTour: true,
        completedSteps: ["a", "b"],
        dismissedHints: ["hint-1"],
      });
    });

    it("不正な JSON が保存されていた場合はデフォルト状態を返し、エラーをログに残す", () => {
      localStorage.setItem(STORAGE_KEY, "{not json");
      const errorSpy = vi.spyOn(console, "error");
      expect(getOnboardingState()).toEqual({
        hasCompletedSetupWizard: false,
        hasCompletedTour: false,
        completedSteps: [],
        dismissedHints: [],
      });
      expect(errorSpy).toHaveBeenCalledWith("Failed to parse onboarding state:", expect.any(Error));
    });

    it("空文字列が保存されていた場合は JSON.parse を呼ばずにデフォルトを返す（エラーログも出ない）", () => {
      // 明示的に空文字列をセットして、`if (stored)` の false 分岐を通すことを担保する。
      // Sets an empty string to exercise the falsy branch of `if (stored)`; JSON.parse must not be invoked.
      localStorage.setItem(STORAGE_KEY, "");
      const errorSpy = vi.spyOn(console, "error");
      expect(getOnboardingState()).toEqual({
        hasCompletedSetupWizard: false,
        hasCompletedTour: false,
        completedSteps: [],
        dismissedHints: [],
      });
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("saveOnboardingState", () => {
    it("既存の状態に部分更新をマージして保存する", () => {
      saveOnboardingState({ hasCompletedTour: true });
      saveOnboardingState({ completedSteps: ["s1"] });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored).toEqual({
        hasCompletedSetupWizard: false,
        hasCompletedTour: true,
        completedSteps: ["s1"],
        dismissedHints: [],
      });
    });

    it("localStorage.setItem が例外を投げる場合はエラーをログに残し、呼び出しは例外を伝播しない", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
      const errorSpy = vi.spyOn(console, "error");

      expect(() => saveOnboardingState({ hasCompletedTour: true })).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith("Failed to save onboarding state:", expect.any(Error));
      setItemSpy.mockRestore();
    });
  });

  describe("markSetupWizardCompleted / markTourCompleted", () => {
    it("markSetupWizardCompleted で hasCompletedSetupWizard=true になる", () => {
      markSetupWizardCompleted();
      expect(getOnboardingState().hasCompletedSetupWizard).toBe(true);
      expect(getOnboardingState().hasCompletedTour).toBe(false);
    });

    it("markTourCompleted で hasCompletedTour=true になる", () => {
      markTourCompleted();
      expect(getOnboardingState().hasCompletedTour).toBe(true);
      expect(getOnboardingState().hasCompletedSetupWizard).toBe(false);
    });
  });

  describe("markStepCompleted", () => {
    it("未完了のステップを追加できる", () => {
      markStepCompleted("step-1");
      expect(getOnboardingState().completedSteps).toEqual(["step-1"]);
    });

    it("連続で異なるステップを追加すると順番が維持される", () => {
      markStepCompleted("step-1");
      markStepCompleted("step-2");
      expect(getOnboardingState().completedSteps).toEqual(["step-1", "step-2"]);
    });

    it("既に完了済みのステップを再度追加しても重複しない", () => {
      markStepCompleted("step-1");
      markStepCompleted("step-1");
      expect(getOnboardingState().completedSteps).toEqual(["step-1"]);
    });
  });

  describe("dismissHint / shouldShowHint", () => {
    it("初期状態では全てのヒントが表示対象（shouldShowHint=true）", () => {
      expect(shouldShowHint("hint-a")).toBe(true);
    });

    it("dismissHint すると shouldShowHint は false を返す", () => {
      dismissHint("hint-a");
      expect(shouldShowHint("hint-a")).toBe(false);
      expect(getOnboardingState().dismissedHints).toEqual(["hint-a"]);
    });

    it("既に dismiss 済みのヒントを再度 dismiss しても重複追加しない", () => {
      dismissHint("hint-a");
      dismissHint("hint-a");
      expect(getOnboardingState().dismissedHints).toEqual(["hint-a"]);
    });

    it("dismiss していない他のヒントは影響を受けない", () => {
      dismissHint("hint-a");
      expect(shouldShowHint("hint-b")).toBe(true);
    });
  });

  describe("resetOnboardingState", () => {
    it("localStorage から zedi-onboarding を削除する", () => {
      saveOnboardingState({ hasCompletedTour: true });
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      resetOnboardingState();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(getOnboardingState()).toEqual({
        hasCompletedSetupWizard: false,
        hasCompletedTour: false,
        completedSteps: [],
        dismissedHints: [],
      });
    });
  });
});
