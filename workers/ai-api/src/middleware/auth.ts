import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Env } from "../types/env";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUrl: string) {
  const cached = jwksCache.get(jwksUrl);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  jwksCache.set(jwksUrl, jwks);
  return jwks;
}

function getBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export interface AuthContext {
  userId: string;
  token: string;
  claims: JWTPayload;
}

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: AuthContext }>,
  next: Next
) {
  const token = getBearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Authorization token is required" }, 401);
  }

  if (!c.env.CLERK_JWKS_URL) {
    return c.json({ error: "CLERK_JWKS_URL is not configured" }, 500);
  }

  try {
    const jwks = getJwks(c.env.CLERK_JWKS_URL);
    const verifyOptions: {
      issuer?: string;
      audience?: string;
    } = {};
    if (c.env.CLERK_ISSUER) verifyOptions.issuer = c.env.CLERK_ISSUER;
    if (c.env.CLERK_AUDIENCE) verifyOptions.audience = c.env.CLERK_AUDIENCE;

    const { payload } = await jwtVerify(token, jwks, verifyOptions);
    const userId = payload.sub;

    if (!userId) {
      return c.json({ error: "Invalid token: user ID not found" }, 401);
    }

    c.set("userId", userId);
    c.set("token", token);
    c.set("claims", payload);
    await next();
  } catch (error) {
    console.error("Auth verification failed", error);
    return c.json({ error: "Unauthorized" }, 401);
  }
}
