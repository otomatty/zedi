import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db/client.js";
import { getEnv } from "./lib/env.js";
import { users, session, account, verification } from "./schema/index.js";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user: users, session, account, verification },
  }),
  baseURL: getEnv("BETTER_AUTH_URL"),
  secret: getEnv("BETTER_AUTH_SECRET"),

  emailAndPassword: {
    enabled: false,
  },

  socialProviders: {
    google: {
      clientId: getEnv("GOOGLE_CLIENT_ID"),
      clientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
    },
    github: {
      clientId: getEnv("GITHUB_CLIENT_ID"),
      clientSecret: getEnv("GITHUB_CLIENT_SECRET"),
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    defaultCookieAttributes: (() => {
      return new URL(getEnv("BETTER_AUTH_URL")).protocol === "https:"
        ? { sameSite: "none" as const, secure: true }
        : { sameSite: "lax" as const, secure: false };
    })(),
  },

  trustedOrigins: getEnv("CORS_ORIGIN")
    .split(",")
    .map((origin) => origin.trim()),
});
