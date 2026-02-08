/**
 * Cognito OAuth (Google / GitHub) - authorize URL, token exchange, storage, refresh.
 * No email/password; SPA uses authorization code flow with PKCE optional.
 */

const STORAGE_KEY = "zedi_cognito_auth";

export type CognitoIdP = "Google" | "GitHub";

export interface CognitoConfig {
  domain: string; // e.g. zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com
  clientId: string;
  redirectUri: string; // e.g. https://zedi-note.app/auth/callback or http://localhost:30000/auth/callback
}

export interface CognitoTokens {
  id_token: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface CognitoAuthState {
  tokens: CognitoTokens;
  expiresAt: number;
}

export interface CognitoUserFromToken {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  "cognito:username"?: string;
}

function getConfig(): CognitoConfig {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!domain || !clientId) {
    throw new Error("Missing VITE_COGNITO_DOMAIN or VITE_COGNITO_CLIENT_ID");
  }
  const redirectUri =
    import.meta.env.VITE_COGNITO_REDIRECT_URI ||
    (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "");
  return { domain, clientId, redirectUri };
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "====".slice(0, 4 - pad) : base64;
  try {
    return decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    return "";
  }
}

export function parseIdToken(idToken: string): CognitoUserFromToken | null {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    return {
      sub: String(payload.sub ?? ""),
      email: payload.email != null ? String(payload.email) : undefined,
      name: payload.name != null ? String(payload.name) : undefined,
      picture: payload.picture != null ? String(payload.picture) : undefined,
      "cognito:username": payload["cognito:username"] != null ? String(payload["cognito:username"]) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Build Cognito OAuth2 authorize URL. Redirect the user here to sign in with Google or GitHub.
 */
export function getAuthorizeUrl(identityProvider: CognitoIdP): string {
  const { domain, clientId, redirectUri } = getConfig();
  const scope = "openid email profile";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    identity_provider: identityProvider,
  });
  return `https://${domain}/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens. Call this on /auth/callback with the `code` from the URL.
 */
export async function exchangeCodeForTokens(code: string): Promise<CognitoTokens> {
  const { domain, clientId, redirectUri } = getConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
  });
  const res = await fetch(`https://${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[Cognito] Token exchange failed:", res.status, {
      redirect_uri: redirectUri,
      body: text,
    });
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as CognitoTokens & { expires_in?: number };
  return {
    id_token: data.id_token,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 3600,
  };
}

/**
 * Refresh tokens using refresh_token. Returns new tokens.
 */
export async function refreshTokens(refreshToken: string): Promise<CognitoTokens> {
  const { domain, clientId } = getConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch(`https://${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as CognitoTokens & { expires_in?: number };
  return {
    id_token: data.id_token,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_in: data.expires_in ?? 3600,
  };
}

function loadFromStorage(): CognitoAuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tokens: CognitoTokens; expiresAt: number };
    if (!parsed.tokens?.id_token || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(state: CognitoAuthState | null): void {
  if (typeof window === "undefined") return;
  if (state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/**
 * Get current auth state from storage (no async). Returns null if not signed in or expired.
 */
export function getStoredState(): CognitoAuthState | null {
  const state = loadFromStorage();
  if (!state) return null;
  if (state.expiresAt <= Date.now()) return null;
  return state;
}

/**
 * Persist tokens and compute expiresAt.
 */
export function setTokens(tokens: CognitoTokens): CognitoAuthState {
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  const state: CognitoAuthState = { tokens, expiresAt };
  saveToStorage(state);
  return state;
}

/**
 * Clear stored auth (sign out locally).
 */
export function clearStorage(): void {
  saveToStorage(null);
}

/**
 * Get a valid ID token, refreshing if needed (within buffer). Returns null if not signed in or refresh fails.
 */
export async function getIdToken(): Promise<string | null> {
  let state = loadFromStorage();
  if (!state?.tokens?.refresh_token) return null;

  if (state.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return state.tokens.id_token;
  }

  try {
    const newTokens = await refreshTokens(state.tokens.refresh_token);
    state = setTokens(newTokens);
    return state.tokens.id_token;
  } catch {
    clearStorage();
    return null;
  }
}

/**
 * Cognito logout (global sign-out) and clear local storage.
 * Optionally redirect to Cognito logout endpoint to clear IdP session.
 */
export function getLogoutUrl(): string {
  const { domain, clientId } = getConfig();
  const logoutRedirect =
    import.meta.env.VITE_COGNITO_LOGOUT_REDIRECT_URI ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutRedirect,
  });
  return `https://${domain}/logout?${params.toString()}`;
}
