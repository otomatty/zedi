import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getOnboardingState,
  markSetupWizardCompleted,
  markTourCompleted,
  type OnboardingState,
} from "@/lib/onboardingState";

/**
 * Hook to manage onboarding state and actions
 */
export function useOnboarding() {
  const { isSignedIn } = useAuth();
  const [state, setState] = useState<OnboardingState>(getOnboardingState);

  /** True when signed-in user has not completed the setup wizard */
  const needsSetupWizard =
    isSignedIn && !state.hasCompletedSetupWizard;

  const completeSetupWizard = useCallback(() => {
    markSetupWizardCompleted();
    setState(getOnboardingState());
  }, []);

  const completeTour = useCallback(() => {
    markTourCompleted();
    setState(getOnboardingState());
  }, []);

  const startTour = useCallback(() => {
    // TODO: Trigger tour start
    setState(getOnboardingState());
  }, []);

  return {
    state,
    needsSetupWizard,
    completeSetupWizard,
    completeTour,
    startTour,
  };
}
