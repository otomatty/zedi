/**
 * Wrapper for Clerk's useAuth and useUser hooks that support E2E test mode.
 *
 * When VITE_E2E_TEST is set, these hooks return mock authentication values.
 * Otherwise, they delegate to the real Clerk hooks.
 */
import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  SignedIn as ClerkSignedIn,
  SignedOut as ClerkSignedOut,
} from "@clerk/clerk-react";
import {
  useMockAuth,
  MOCK_USER_ID,
  MOCK_USER_EMAIL,
  MockSignedIn,
  MockSignedOut,
} from "@/components/auth/MockClerkProvider";

// Check if we're in E2E test mode at module load time
const isE2EMode = import.meta.env.VITE_E2E_TEST === "true";

/**
 * Custom useAuth hook that works in both real and E2E test modes.
 */
export function useAuth() {
  // In E2E test mode, use the mock auth context
  if (isE2EMode) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMockAuth();
  }

  // Otherwise, use the real Clerk auth
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkAuth();
}

/**
 * Mock user object for E2E tests.
 */
const mockUser = {
  id: MOCK_USER_ID,
  primaryEmailAddress: {
    emailAddress: MOCK_USER_EMAIL,
  },
  firstName: "E2E",
  lastName: "Test",
  fullName: "E2E Test User",
  imageUrl: "",
  profileImageUrl: "",
  username: "e2e_test_user",
};

/**
 * Custom useUser hook that works in both real and E2E test modes.
 */
export function useUser() {
  // In E2E test mode, return mock user data
  if (isE2EMode) {
    return {
      isLoaded: true,
      isSignedIn: true,
      user: mockUser,
    };
  }

  // Otherwise, use the real Clerk user
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkUser();
}

/**
 * SignedIn component that works in both real and E2E test modes.
 */
export const SignedIn = isE2EMode ? MockSignedIn : ClerkSignedIn;

/**
 * SignedOut component that works in both real and E2E test modes.
 */
export const SignedOut = isE2EMode ? MockSignedOut : ClerkSignedOut;
