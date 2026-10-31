import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import type { Env } from "./env";
import { createDefaultNote } from "./services/notes";

/** Provider id of the test IdP; its callback is `/api/auth/callback/test-idp`. */
export const TEST_IDP_PROVIDER = "test-idp";

/** Host used for calls over the TEST_IDP service binding (the binding ignores it). */
const TEST_IDP_INTERNAL = "https://test-idp.internal";

/**
 * The test IdP (`src/testIdp`) as a Better Auth provider. The browser goes to its sign-in page
 * through the app's `/test-idp/authorize` proxy; code exchange and user info go over the service
 * binding, so the IdP needs no public route. Only registered when the binding exists, which it
 * never does in production.
 * テスト用 IdP を Better Auth のプロバイダーにする。TEST_IDP バインディングがあるときだけ登録する（本番にはない）。
 */
function testIdpProvider(idp: Fetcher, baseURL: string) {
  return genericOAuth({
    config: [
      {
        providerId: TEST_IDP_PROVIDER,
        clientId: "zedi-app",
        authorizationUrl: `${baseURL}/test-idp/authorize`,
        scopes: ["openid", "email", "profile"],
        pkce: true,
        getToken: async ({ code, redirectURI, codeVerifier }) => {
          const res = await idp.fetch(`${TEST_IDP_INTERNAL}/test-idp/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectURI,
              client_id: "zedi-app",
              code_verifier: codeVerifier ?? "",
            }).toString(),
          });
          if (!res.ok) throw new Error(`test IdP token exchange failed: ${res.status}`);
          const token = (await res.json()) as { access_token: string; expires_in: number };
          return {
            tokenType: "Bearer",
            accessToken: token.access_token,
            accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
          };
        },
        getUserInfo: async (tokens) => {
          const res = await idp.fetch(`${TEST_IDP_INTERNAL}/test-idp/userinfo`, {
            headers: { authorization: `Bearer ${tokens.accessToken ?? ""}` },
          });
          if (!res.ok) return null;
          const info = (await res.json()) as {
            sub: string;
            email: string;
            email_verified: boolean;
            name: string;
          };
          return {
            id: info.sub,
            email: info.email,
            emailVerified: info.email_verified,
            name: info.name,
          };
        },
      },
    ],
  });
}

function createAuth(env: Env, baseURL: string) {
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    // Google is the production IdP; it is enabled only when credentials are configured.
    socialProviders: googleConfigured(env)
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
          },
        }
      : {},
    // Same as today's API: avoid a D1 read on every request by caching the session in a signed cookie.
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
    plugins: env.TEST_IDP ? [testIdpProvider(env.TEST_IDP, baseURL)] : [],
    databaseHooks: {
      user: { create: { after: async (user) => createDefaultNote(env.DB, user.id) } },
    },
  });
}

/** Whether Google sign-in has credentials. */
export const googleConfigured = (env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">) =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** The Better Auth instance type used by the app. */
export type Auth = ReturnType<typeof createAuth>;

const cache = new Map<string, Auth>();

/**
 * Returns a Better Auth instance for this isolate (one per origin and provider set; in development
 * the origin follows the request so any local port works).
 * この isolate 用の Better Auth インスタンスを返す（オリジンとプロバイダーの組ごとに 1 つ）。
 */
export function getAuth(env: Env, requestUrl: string): Auth {
  if (!env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is not set");
  const baseURL = env.BETTER_AUTH_URL ?? new URL(requestUrl).origin;
  const key = `${baseURL}|${env.TEST_IDP ? "test-idp" : ""}|${googleConfigured(env) ? "google" : ""}`;
  let auth = cache.get(key);
  if (!auth) {
    auth = createAuth(env, baseURL);
    cache.set(key, auth);
  }
  return auth;
}
