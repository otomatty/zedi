import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { getDb } from "./db/client.js";
import { getEnv } from "./lib/env.js";
import { users, session, account, verification } from "./schema/index.js";
import {
  renderInviteMagicLinkEmail,
  getInviteMagicLinkSubject,
} from "./emails/invite-magic-link.js";
import { sendEmail } from "./services/emailService.js";
import { resolveLocaleFromAcceptLanguage } from "./services/invitationService.js";
import type { Locale } from "./emails/locales/index.js";

/** マジックリンクの有効期限（秒） / Magic-link TTL in seconds (5 minutes). */
const MAGIC_LINK_EXPIRES_IN_SEC = 60 * 5;

export /**
 *
 */
const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user: users, session, account, verification },
  }),
  baseURL: getEnv("BETTER_AUTH_URL"),
  secret: getEnv("BETTER_AUTH_SECRET"),

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        input: false, // only set via DB / backend
      },
    },
  },

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

  plugins: [
    // Better Auth の magicLink プラグイン。招待メール mismatch 時の救済フロー
    // (POST /api/invite/:token/email-link) から内部的に呼び出す。
    // Better Auth's magic-link plugin. Used by the invite-mismatch rescue flow
    // (POST /api/invite/:token/email-link) to deliver one-time sign-in links.
    magicLink({
      expiresIn: MAGIC_LINK_EXPIRES_IN_SEC,
      sendMagicLink: async ({ email, url }, ctx) => {
        // ctx は better-call の EndpointContext。ヘッダは `ctx.headers` もしくは
        // `ctx.request.headers` 経由でアクセスできる。Accept-Language でロケールを解決する。
        // Resolve the locale from Accept-Language on the endpoint context so the
        // invite rescue flow can deliver `ja` / `en` templates appropriately.
        /**
         *
         */
        const headers =
          (ctx as { headers?: Headers } | undefined)?.headers ??
          (ctx as { request?: Request } | undefined)?.request?.headers ??
          null;
        /**
         *
         */
        const acceptLanguage =
          headers && typeof headers.get === "function" ? headers.get("accept-language") : null;
        /**
         *
         */
        const locale: Locale = resolveLocaleFromAcceptLanguage(acceptLanguage) ?? "ja";
        /**
         *
         */
        const html = await renderInviteMagicLinkEmail({
          memberEmail: email,
          magicLinkUrl: url,
          locale,
        });
        /**
         *
         */
        const subject = getInviteMagicLinkSubject({ locale });
        /**
         *
         */
        const result = await sendEmail({ to: email, subject, html });
        if (!result.success) {
          // sendEmail 側でログ出力済み。ここでは例外を投げて Better Auth に失敗を伝える。
          // `sendEmail` already logs; rethrow so Better Auth surfaces the failure.
          throw new Error(result.error ?? "Failed to send magic-link email");
        }
      },
    }),
  ],
});
