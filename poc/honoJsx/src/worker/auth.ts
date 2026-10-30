import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import { isDevelopment, type Env } from "./env";
import { createDefaultNote } from "./services/notes";

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
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    // Same as today's API: avoid a D1 read on every request by caching the session in a signed cookie.
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
    plugins: [
      magicLink({
        expiresIn: 5 * 60,
        sendMagicLink: async ({ email, url }) => {
          if (!isDevelopment(env)) throw new Error("E-mail delivery is not configured in this PoC");
          await env.DB.prepare(
            "INSERT INTO dev_outbox (email, url, created_at) VALUES (?1, ?2, ?3)",
          )
            .bind(email, url, Date.now())
            .run();
        },
      }),
    ],
    databaseHooks: {
      user: { create: { after: async (user) => createDefaultNote(env.DB, user.id) } },
    },
  });
}

/** The Better Auth instance type used by the app. */
export type Auth = ReturnType<typeof createAuth>;

const cache = new Map<string, Auth>();

/**
 * Returns a Better Auth instance for this isolate (one per origin; in development the
 * origin follows the request so any local port works).
 * この isolate 用の Better Auth インスタンスを返す（オリジンごとに 1 つ）。
 */
export function getAuth(env: Env, requestUrl: string): Auth {
  if (!env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is not set");
  const baseURL = env.BETTER_AUTH_URL ?? new URL(requestUrl).origin;
  let auth = cache.get(baseURL);
  if (!auth) {
    auth = createAuth(env, baseURL);
    cache.set(baseURL, auth);
  }
  return auth;
}
