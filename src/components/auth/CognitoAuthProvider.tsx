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
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getAuthorizeUrl,
  getIdToken,
  getStoredState,
  clearStorage,
  getLogoutUrl,
  parseIdToken,
  isTokenValid,
  needsRefresh,
  hasRefreshToken,
  proactiveRefreshTokens,
  type CognitoIdP,
  type CognitoAuthState,
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

// How often to check token freshness (every 60 seconds)
const REFRESH_CHECK_INTERVAL_MS = 60 * 1000;

export function CognitoAuthProvider({ children }: CognitoAuthProviderProps) {
  const [, setIsLoaded] = useState(false);
  const [state, setState] = useState<ReturnType<typeof getStoredState>>(() =>
    getInitialAuthState(),
  );
  const refreshingRef = useRef(false);

  /**
   * Attempt to refresh tokens and update React state.
   * Returns true if refresh succeeded, false otherwise.
   */
  const tryRefresh = useCallback(async (currentState: CognitoAuthState): Promise<boolean> => {
    if (refreshingRef.current) return false;
    refreshingRef.current = true;
    try {
      const newState = await proactiveRefreshTokens(currentState);
      setState(newState);
      return true;
    } catch (err) {
      console.warn("[CognitoAuth] Token refresh failed, signing out.", err);
      clearStorage();
      setState(null);
      return false;
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  // On mount: load stored state and immediately refresh if tokens are expired/stale
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const stored = getStoredState();
      if (stored && hasRefreshToken(stored) && needsRefresh(stored)) {
        // Tokens expired or about to expire — refresh now
        const ok = await tryRefresh(stored);
        if (!cancelled && !ok) {
          setState(null);
        }
      } else {
        if (!cancelled) setState(stored);
      }
      if (!cancelled) setIsLoaded(true);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [tryRefresh]);

  // Periodic token refresh timer
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const current = getStoredState();
      if (!current || !hasRefreshToken(current)) return;
      if (needsRefresh(current)) {
        tryRefresh(current);
      }
    }, REFRESH_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [tryRefresh]);

  // Also refresh when tab becomes visible again (user returns after idle)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const current = getStoredState();
      if (!current || !hasRefreshToken(current)) return;
      if (needsRefresh(current)) {
        tryRefresh(current);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [tryRefresh]);

  const getToken = useCallback(async (): Promise<string | null> => {
    // getIdToken performs its own refresh-if-needed logic
    const token = await getIdToken();
    // Sync React state after potential refresh
    setState(getStoredState());
    return token;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    clearStorage();
    setState(null);
    window.location.href = getLogoutUrl();
  }, []);

  const value = useMemo<CognitoAuthContextValue>(() => {
    // User is signed in if we have tokens AND either they're still valid
    // OR we have a refresh_token (meaning we can/will refresh them).
    const signedIn = !!state?.tokens?.id_token && (isTokenValid(state) || hasRefreshToken(state));
    const userId = state?.tokens?.id_token
      ? (parseIdToken(state.tokens.id_token)?.sub ?? null)
      : null;
    return {
      isLoaded: true,
      isSignedIn: signedIn,
      userId,
      sessionId: null,
      orgId: null,
      orgRole: null,
      orgSlug: null,
      getToken,
      signOut,
    };
  }, [state, getToken, signOut]);

  return <CognitoAuthContext.Provider value={value}>{children}</CognitoAuthContext.Provider>;
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
export function useCognitoUser(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: CognitoAuthUser | null;
} {
  const { isLoaded, isSignedIn, userId } = useCognitoAuth();
  const state = getStoredState();
  const user = useMemo(() => {
    if (!isSignedIn || !userId || !state?.tokens?.id_token) return null;
    return userFromToken(userId, state.tokens.id_token);
  }, [isSignedIn, userId, state?.tokens?.id_token]);
  return { isLoaded, isSignedIn, user };
}
