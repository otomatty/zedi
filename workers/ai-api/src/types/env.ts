export interface Env {
  CORS_ORIGIN?: string;
  CLERK_JWKS_URL?: string;
  CLERK_ISSUER?: string;
  CLERK_AUDIENCE?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
}
