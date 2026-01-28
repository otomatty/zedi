/**
 * Onboarding state management
 * Tracks user's progress through the onboarding flow
 */

const STORAGE_KEY = "zedi-onboarding";

export interface OnboardingState {
  hasSeenWelcome: boolean;
  hasCompletedTour: boolean;
  completedSteps: string[];
  dismissedHints: string[];
  welcomeSeenAt?: number;
}

const DEFAULT_STATE: OnboardingState = {
  hasSeenWelcome: false,
  hasCompletedTour: false,
  completedSteps: [],
  dismissedHints: [],
};

/**
 * Get the current onboarding state from localStorage
 */
export function getOnboardingState(): OnboardingState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_STATE, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error("Failed to parse onboarding state:", error);
  }
  return DEFAULT_STATE;
}

/**
 * Save the onboarding state to localStorage
 */
export function saveOnboardingState(state: Partial<OnboardingState>): void {
  try {
    const currentState = getOnboardingState();
    const newState = { ...currentState, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  } catch (error) {
    console.error("Failed to save onboarding state:", error);
  }
}

/**
 * Mark the welcome modal as seen
 */
export function markWelcomeSeen(): void {
  saveOnboardingState({
    hasSeenWelcome: true,
    welcomeSeenAt: Date.now(),
  });
}

/**
 * Mark the tour as completed
 */
export function markTourCompleted(): void {
  saveOnboardingState({
    hasCompletedTour: true,
  });
}

/**
 * Mark a specific step as completed
 */
export function markStepCompleted(stepId: string): void {
  const state = getOnboardingState();
  if (!state.completedSteps.includes(stepId)) {
    saveOnboardingState({
      completedSteps: [...state.completedSteps, stepId],
    });
  }
}

/**
 * Dismiss a hint so it won't show again
 */
export function dismissHint(hintId: string): void {
  const state = getOnboardingState();
  if (!state.dismissedHints.includes(hintId)) {
    saveOnboardingState({
      dismissedHints: [...state.dismissedHints, hintId],
    });
  }
}

/**
 * Check if a hint should be shown
 */
export function shouldShowHint(hintId: string): boolean {
  const state = getOnboardingState();
  return !state.dismissedHints.includes(hintId);
}

/**
 * Reset the onboarding state (for testing)
 */
export function resetOnboardingState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
