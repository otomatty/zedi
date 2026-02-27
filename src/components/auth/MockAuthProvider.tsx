/**
 * Mock auth provider for E2E testing.
 *
 * Provides a fake authentication context so E2E tests can run without
 * real Better Auth. useAuth() switches to useMockAuth() when VITE_E2E_TEST=true.
 */
import { createContext, useContext, ReactNode } from "react";

const MOCK_USER_ID = "e2e_test_user_123";
const MOCK_USER_EMAIL = "e2e-test@example.com";

interface MockAuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  sessionId: string | null;
  orgId: string | null;
  orgRole: string | null;
  orgSlug: string | null;
  getToken: (options?: { template?: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const MockAuthContext = createContext<MockAuthContextValue | null>(null);

interface MockAuthProviderProps {
  children: ReactNode;
}

export function MockAuthProvider({ children }: MockAuthProviderProps) {
  const mockAuthValue: MockAuthContextValue = {
    isLoaded: true,
    isSignedIn: true,
    userId: MOCK_USER_ID,
    sessionId: "e2e_test_session_123",
    orgId: null,
    orgRole: null,
    orgSlug: null,
    getToken: async () => "mock_e2e_token_for_testing",
    signOut: async () => {},
  };

  return <MockAuthContext.Provider value={mockAuthValue}>{children}</MockAuthContext.Provider>;
}

export function useMockAuth(): MockAuthContextValue {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error("useMockAuth must be used within a MockAuthProvider");
  }
  return context;
}

export function MockSignedIn({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function MockSignedOut({ children }: { children: ReactNode }) {
  void children;
  return null;
}

export { MOCK_USER_ID, MOCK_USER_EMAIL };
