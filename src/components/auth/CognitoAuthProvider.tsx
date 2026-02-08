/**
 * Cognito OAuth (Google/GitHub) Auth Provider.
 * Provides the same interface as Clerk's useAuth/useUser for drop-in replacement.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAuthorizeUrl,
  getIdToken,
  getStoredState,
  setTokens,
  clearStorage,
  getLogoutUrl,
  parseIdToken,
  type CognitoIdP,
} from "@/lib/auth/cognitoAuth";

// Clerk-compatible user shape for useUser()
export interface CognitoAuthUser {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  profileImageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
  username: string | null;
}

export interface CognitoAuthContextValue {
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

const CognitoAuthContext = createContext<CognitoAuthContextValue | null>(null);

function userFromToken(sub: string, idToken: string): CognitoAuthUser {
  const parsed = parseIdToken(idToken);
  const name = parsed?.name ?? parsed?.["cognito:username"] ?? "";
  const parts = name.split(" ");
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return {
    id: sub,
    fullName: name || null,
    firstName,
    lastName,
    imageUrl: parsed?.picture ?? "",
    profileImageUrl: parsed?.picture ?? "",
    primaryEmailAddress: parsed?.email ? { emailAddress: parsed.email } : null,
    username: parsed?.["cognito:username"] ?? null,
  };
}

interface CognitoAuthProviderProps {
  children: ReactNode;
}

function getInitialAuthState(): ReturnType<typeof getStoredState> {
  if (typeof window === "undefined") return null;
  return getStoredState();
}

export function CognitoAuthProvider({ children }: CognitoAuthProviderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [state, setState] = useState<ReturnType<typeof getStoredState>>(() => getInitialAuthState());

  const refreshState = useCallback(() => {
    const next = getStoredState();
    setState(next);
  }, []);

  useEffect(() => {
    refreshState();
    setIsLoaded(true);
  }, [refreshState]);

  const getToken = useCallback(async (): Promise<string | null> => {
    return getIdToken();
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    clearStorage();
    refreshState();
    window.location.href = getLogoutUrl();
  }, [refreshState]);

  const value = useMemo<CognitoAuthContextValue>(() => {
    const isSignedIn = !!state?.tokens?.id_token && state.expiresAt > Date.now();
    const userId = state?.tokens?.id_token
      ? parseIdToken(state.tokens.id_token)?.sub ?? null
      : null;
    return {
      isLoaded: true,
      isSignedIn,
      userId,
      sessionId: null,
      orgId: null,
      orgRole: null,
      orgSlug: null,
      getToken,
      signOut,
    };
  }, [state, getToken, signOut]);

  return (
    <CognitoAuthContext.Provider value={value}>
      {children}
    </CognitoAuthContext.Provider>
  );
}

export function useCognitoAuth(): CognitoAuthContextValue {
  const ctx = useContext(CognitoAuthContext);
  if (!ctx) {
    throw new Error("useCognitoAuth must be used within CognitoAuthProvider");
  }
  return ctx;
}

// Re-export for SignIn page
export { getAuthorizeUrl, type CognitoIdP };

/**
 * Get current user from stored id_token (Clerk-compatible shape). Call only when isSignedIn.
 */
export function useCognitoUser(): { isLoaded: boolean; isSignedIn: boolean; user: CognitoAuthUser | null } {
  const { isLoaded, isSignedIn, userId } = useCognitoAuth();
  const state = getStoredState();
  const user = useMemo(() => {
    if (!isSignedIn || !userId || !state?.tokens?.id_token) return null;
    return userFromToken(userId, state.tokens.id_token);
  }, [isSignedIn, userId, state?.tokens?.id_token]);
  return { isLoaded, isSignedIn, user };
}
