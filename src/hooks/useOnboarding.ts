import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getOnboardingState,
  markWelcomeSeen,
  markTourCompleted,
  type OnboardingState,
} from "@/lib/onboardingState";

/**
 * Hook to manage onboarding state and actions
 */
export function useOnboarding() {
  const { isSignedIn } = useAuth();
  const [state, setState] = useState<OnboardingState>(getOnboardingState);
  const [showWelcome, setShowWelcome] = useState(false);

  // Check if we should show the welcome modal
  useEffect(() => {
    if (isSignedIn && !state.hasSeenWelcome) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        setShowWelcome(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isSignedIn, state.hasSeenWelcome]);

  const dismissWelcome = useCallback(() => {
    markWelcomeSeen();
    setShowWelcome(false);
    setState(getOnboardingState());
  }, []);

  const completeTour = useCallback(() => {
    markTourCompleted();
    setState(getOnboardingState());
  }, []);

  const startTour = useCallback(() => {
    // Close welcome modal and start tour
    markWelcomeSeen();
    setShowWelcome(false);
    setState(getOnboardingState());
    // TODO: Trigger tour start
  }, []);

  return {
    state,
    showWelcome,
    dismissWelcome,
    completeTour,
    startTour,
  };
}
