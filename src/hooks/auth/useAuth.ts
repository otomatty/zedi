import React, { useCallback } from "react";
import { useSession, signOut, getSession } from "@/lib/auth/authClient";
import {
  useMockAuth,
  MOCK_USER_ID,
  MOCK_USER_EMAIL,
  MockSignedIn,
  MockSignedOut,
} from "@/components/auth/MockAuthProvider";

const isE2EMode = import.meta.env.VITE_E2E_TEST === "true";

function useBetterAuth() {
  const { data: session, isPending } = useSession();

  const getTokenStable = useCallback(async () => {
    try {
      const s = await getSession();
      return s.data?.session?.token ?? null;
    } catch {
      return null;
    }
  }, []);

  const signOutStable = useCallback(async () => {
    await signOut();
  }, []);

  return {
    isLoaded: !isPending,
    isSignedIn: !!session,
    userId: session?.user?.id ?? null,
    sessionId: session?.session?.id ?? null,
    orgId: null,
    orgRole: null,
    orgSlug: null,
    getToken: getTokenStable,
    signOut: signOutStable,
  };
}

const useAuthImpl = isE2EMode ? useMockAuth : useBetterAuth;

export function useAuth() {
  return useAuthImpl();
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

function useMockUser() {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: mockUser,
  };
}

function useBetterUser() {
  const { data: session, isPending } = useSession();

  const user = session
    ? {
        id: session.user.id,
        fullName: session.user.name,
        firstName: session.user.name?.split(" ")[0] ?? null,
        lastName: session.user.name?.split(" ").slice(1).join(" ") || null,
        imageUrl: session.user.image ?? "",
        profileImageUrl: session.user.image ?? "",
        primaryEmailAddress: session.user.email ? { emailAddress: session.user.email } : null,
        username: session.user.name ?? null,
      }
    : null;

  return {
    isLoaded: !isPending,
    isSignedIn: !!session,
    user,
  };
}

const useUserImpl = isE2EMode ? useMockUser : useBetterUser;

export function useUser() {
  return useUserImpl();
}

function BetterAuthSignedIn({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return React.createElement(React.Fragment, null, children);
}
function BetterAuthSignedOut({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded || isSignedIn) return null;
  return React.createElement(React.Fragment, null, children);
}

export const SignedIn = isE2EMode ? MockSignedIn : BetterAuthSignedIn;
export const SignedOut = isE2EMode ? MockSignedOut : BetterAuthSignedOut;
