import type { Env } from "./env";

// partyserver / y-partyserver type `this.env` and their routing helpers as Cloudflare.Env.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      PageRoom: DurableObjectNamespace;
      BETTER_AUTH_SECRET: string;
      BETTER_AUTH_URL?: string;
      ENVIRONMENT?: string;
      GOOGLE_CLIENT_ID?: string;
      GOOGLE_CLIENT_SECRET?: string;
      TEST_IDP?: Fetcher;
    }
  }
}

export type { Env };
