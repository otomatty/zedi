/**
 * Auth hooks: Cognito (Google/GitHub OAuth) in production, Mock in E2E.
 * Same interface as former Clerk useAuth/useUser for drop-in replacement.
 */
import React from "react";
import {
  useCognitoAuth,
  useCognitoUser,
} from "@/components/auth/CognitoAuthProvider";
import {
  useMockAuth,
  MOCK_USER_ID,
  MOCK_USER_EMAIL,
  MockSignedIn,
  MockSignedOut,
} from "@/components/auth/MockClerkProvider";

const isE2EMode = import.meta.env.VITE_E2E_TEST === "true";

export function useAuth() {
  if (isE2EMode) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMockAuth();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCognitoAuth();
}

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

export function useUser() {
  if (isE2EMode) {
    return {
      isLoaded: true,
      isSignedIn: true,
      user: mockUser,
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCognitoUser();
}

function CognitoSignedIn({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useCognitoAuth();
  if (!isLoaded || !isSignedIn) return null;
  return React.createElement(React.Fragment, null, children);
}
function CognitoSignedOut({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useCognitoAuth();
  if (!isLoaded || isSignedIn) return null;
  return React.createElement(React.Fragment, null, children);
}

export const SignedIn = isE2EMode ? MockSignedIn : CognitoSignedIn;
export const SignedOut = isE2EMode ? MockSignedOut : CognitoSignedOut;
