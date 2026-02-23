import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseIdToken,
  getAuthorizeUrl,
  exchangeCodeForTokens,
  refreshTokens,
  setTokens,
  getStoredState,
  clearStorage,
  isTokenValid,
  needsRefresh,
  hasRefreshToken,
  type CognitoTokens,
  type CognitoAuthState,
} from "./cognitoAuth";

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function makeFakeTokens(overrides?: Partial<CognitoTokens>): CognitoTokens {
  return {
    id_token: "id-tok",
    access_token: "access-tok",
    refresh_token: "refresh-tok",
    expires_in: 3600,
    ...overrides,
  };
}

describe("cognitoAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    import.meta.env.VITE_COGNITO_DOMAIN = "test.auth.example.com";
    import.meta.env.VITE_COGNITO_CLIENT_ID = "test-client-id";
    import.meta.env.VITE_COGNITO_REDIRECT_URI = "http://localhost:3000/auth/callback";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete import.meta.env.VITE_COGNITO_DOMAIN;
    delete import.meta.env.VITE_COGNITO_CLIENT_ID;
    delete import.meta.env.VITE_COGNITO_REDIRECT_URI;
  });

  describe("parseIdToken", () => {
    it("parses valid JWT payload", () => {
      const jwt = makeJwt({
        sub: "user-123",
        email: "alice@example.com",
        name: "Alice",
        picture: "https://img.example.com/a.png",
        "cognito:username": "alice",
      });
      const result = parseIdToken(jwt);
      expect(result).toEqual({
        sub: "user-123",
        email: "alice@example.com",
        name: "Alice",
        picture: "https://img.example.com/a.png",
        "cognito:username": "alice",
      });
    });

    it("returns null for invalid token (bad JSON)", () => {
      const result = parseIdToken("header.!!!not-base64!!!.sig");
      expect(result).toBeNull();
    });

    it("returns null for non-3-part token", () => {
      expect(parseIdToken("only-one-part")).toBeNull();
      expect(parseIdToken("two.parts")).toBeNull();
    });
  });

  describe("setTokens", () => {
    it("saves to localStorage and returns state with correct expiresAt", () => {
      const before = Date.now();
      const tokens = makeFakeTokens({ expires_in: 7200 });
      const state = setTokens(tokens);

      expect(state.tokens).toEqual(tokens);
      expect(state.expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000);
      expect(state.expiresAt).toBeLessThanOrEqual(Date.now() + 7200 * 1000);

      const stored = JSON.parse(localStorage.getItem("zedi_cognito_auth")!);
      expect(stored.tokens.id_token).toBe("id-tok");
    });
  });

  describe("getStoredState", () => {
    it("returns null when no data in localStorage", () => {
      expect(getStoredState()).toBeNull();
    });

    it("returns stored state", () => {
      const state: CognitoAuthState = {
        tokens: makeFakeTokens(),
        expiresAt: Date.now() + 3600_000,
      };
      localStorage.setItem("zedi_cognito_auth", JSON.stringify(state));
      const result = getStoredState();
      expect(result).toEqual(state);
    });
  });

  describe("clearStorage", () => {
    it("removes auth data from localStorage", () => {
      localStorage.setItem("zedi_cognito_auth", "data");
      clearStorage();
      expect(localStorage.getItem("zedi_cognito_auth")).toBeNull();
    });
  });

  describe("isTokenValid", () => {
    it("returns true when not expired", () => {
      const state: CognitoAuthState = {
        tokens: makeFakeTokens(),
        expiresAt: Date.now() + 60_000,
      };
      expect(isTokenValid(state)).toBe(true);
    });

    it("returns false when expired", () => {
      const state: CognitoAuthState = {
        tokens: makeFakeTokens(),
        expiresAt: Date.now() - 1000,
      };
      expect(isTokenValid(state)).toBe(false);
    });
  });

  describe("needsRefresh", () => {
    it("returns true within 5 min buffer", () => {
      const state: CognitoAuthState = {
        tokens: makeFakeTokens(),
        expiresAt: Date.now() + 2 * 60 * 1000,
      };
      expect(needsRefresh(state)).toBe(true);
    });

    it("returns false when well outside buffer", () => {
      const state: CognitoAuthState = {
        tokens: makeFakeTokens(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      };
      expect(needsRefresh(state)).toBe(false);
    });
  });

  describe("hasRefreshToken", () => {
    it("returns true when refresh_token exists", () => {
      const state: CognitoAuthState = {
        tokens: makeFakeTokens(),
        expiresAt: Date.now() + 3600_000,
      };
      expect(hasRefreshToken(state)).toBe(true);
    });

    it("returns false when refresh_token is empty", () => {
      const state: CognitoAuthState = {
        tokens: makeFakeTokens({ refresh_token: "" }),
        expiresAt: Date.now() + 3600_000,
      };
      expect(hasRefreshToken(state)).toBe(false);
    });
  });

  describe("getAuthorizeUrl", () => {
    it("builds correct OAuth2 authorize URL", () => {
      const url = getAuthorizeUrl("Google");
      expect(url).toContain("https://test.auth.example.com/oauth2/authorize");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/callback");
      expect(parsed.searchParams.get("identity_provider")).toBe("Google");
      expect(parsed.searchParams.get("scope")).toBe("openid email profile");
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("calls fetch with correct params and returns tokens", async () => {
      const responseTokens: CognitoTokens = {
        id_token: "new-id",
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(responseTokens), { status: 200 })
      );

      const result = await exchangeCodeForTokens("auth-code-123");

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://test.auth.example.com/oauth2/token");
      expect(init?.method).toBe("POST");
      const body = init?.body as string;
      const params = new URLSearchParams(body);
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("code")).toBe("auth-code-123");
      expect(params.get("client_id")).toBe("test-client-id");

      expect(result).toEqual(responseTokens);
    });

    it("throws on non-OK response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Bad Request", { status: 400 })
      );

      await expect(exchangeCodeForTokens("bad-code")).rejects.toThrow(
        "Token exchange failed"
      );
    });
  });

  describe("refreshTokens", () => {
    it("calls fetch and returns new tokens, keeps original refresh_token if not in response", async () => {
      const responseData = {
        id_token: "refreshed-id",
        access_token: "refreshed-access",
        expires_in: 3600,
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(responseData), { status: 200 })
      );

      const result = await refreshTokens("original-refresh");

      expect(result.id_token).toBe("refreshed-id");
      expect(result.access_token).toBe("refreshed-access");
      expect(result.refresh_token).toBe("original-refresh");
      expect(result.expires_in).toBe(3600);
    });

    it("uses new refresh_token when present in response", async () => {
      const responseData = {
        id_token: "refreshed-id",
        access_token: "refreshed-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(responseData), { status: 200 })
      );

      const result = await refreshTokens("original-refresh");
      expect(result.refresh_token).toBe("new-refresh");
    });
  });
});
