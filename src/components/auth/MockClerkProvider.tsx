/**
 * Mock ClerkProvider for E2E testing.
 *
 * This provider mimics the Clerk authentication context with fake values,
 * allowing E2E tests to run without actual authentication.
 */
import { createContext, useContext, ReactNode } from "react";

// Mock user data for E2E tests
const MOCK_USER_ID = "e2e_test_user_123";
const MOCK_USER_EMAIL = "e2e-test@example.com";

// Create a mock context that matches Clerk's expected shape
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

interface MockClerkProviderProps {
  children: ReactNode;
}

/**
 * A mock ClerkProvider that provides fake authentication context.
 * Used for E2E testing to bypass real authentication.
 */
export function MockClerkProvider({ children }: MockClerkProviderProps) {
  const mockAuthValue: MockAuthContextValue = {
    isLoaded: true,
    isSignedIn: true,
    userId: MOCK_USER_ID,
    sessionId: "e2e_test_session_123",
    orgId: null,
    orgRole: null,
    orgSlug: null,
    getToken: async () => "mock_e2e_token_for_testing",
    signOut: async () => {
      console.log("[E2E Mock] Sign out called");
    },
  };

  return (
    <MockAuthContext.Provider value={mockAuthValue}>
      {children}
    </MockAuthContext.Provider>
  );
}

/**
 * Hook to access mock auth context.
 * This is used by the mock useAuth hook.
 */
export function useMockAuth(): MockAuthContextValue {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error("useMockAuth must be used within a MockClerkProvider");
  }
  return context;
}

/**
 * Mock SignedIn component for E2E tests.
 * Always renders children in E2E mode.
 */
export function MockSignedIn({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Mock SignedOut component for E2E tests.
 * Never renders children in E2E mode.
 */
export function MockSignedOut({ children }: { children: ReactNode }) {
  // In E2E mode, user is always signed in, so don't show SignedOut content
  void children;
  return null;
}

// Re-export the mock user ID for tests
export { MOCK_USER_ID, MOCK_USER_EMAIL };
