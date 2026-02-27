import React from "react";
import { useSession, signOut, getSession } from "@/lib/auth/authClient";
import {
  useMockAuth,
  MOCK_USER_ID,
  MOCK_USER_EMAIL,
  MockSignedIn,
  MockSignedOut,
} from "@/components/auth/MockAuthProvider";

const isE2EMode = import.meta.env.VITE_E2E_TEST === "true";

export function useAuth() {
  if (isE2EMode) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMockAuth();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: session, isPending } = useSession();

  return {
    isLoaded: !isPending,
    isSignedIn: !!session,
    userId: session?.user?.id ?? null,
    sessionId: session?.session?.id ?? null,
    orgId: null,
    orgRole: null,
    orgSlug: null,
    getToken: async () => {
      try {
        const s = await getSession();
        return s.data?.session?.token ?? null;
      } catch {
        return null;
      }
    },
    signOut: async () => {
      await signOut();
    },
  };
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
