/**
 * Mock auth provider for E2E testing.
 *
 * Provides a fake authentication context so E2E tests can run without
 * real Better Auth. useAuth() switches to useMockAuth() when VITE_E2E_TEST=true.
 */
import { createContext, useContext, ReactNode } from "react";

/** Same ID as local-first guest storage so E2E creates pages offline (no API). / API 不要で IndexedDB のみ作成するため local-user と一致させる。 */
const MOCK_USER_ID = "local-user";
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

/**
 * E2E 用の認証プロバイダー。子ツリーにモックの認証コンテキストを供給する。
 * Mock auth provider for E2E. Supplies mock auth context to the subtree.
 */
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

/**
 * MockAuthContext からモック認証状態を取得する。MockAuthProvider 内でのみ使用する。
 * Returns mock auth from MockAuthContext. Must be used within MockAuthProvider.
 */
export function useMockAuth(): MockAuthContextValue {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error("useMockAuth must be used within a MockAuthProvider");
  }
  return context;
}

/**
 * E2E 用の SignedIn 代替。子を常に描画する。
 * Mock SignedIn for E2E. Always renders children.
 */
export function MockSignedIn({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * E2E 用の SignedOut 代替。子は描画しない（null を返す）。
 * Mock SignedOut for E2E. Renders nothing (returns null).
 */
export function MockSignedOut({ children }: { children: ReactNode }) {
  void children;
  return null;
}

export { MOCK_USER_ID, MOCK_USER_EMAIL };
