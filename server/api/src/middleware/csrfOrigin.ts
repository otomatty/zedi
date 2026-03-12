/**
 * CSRF protection: validate Origin or Referer for state-changing requests.
 * Cookie-based auth is vulnerable to CSRF; requiring a trusted origin reduces risk.
 * When CORS_ORIGIN is set (not wildcard), mutation requests must include Origin or Referer from that list.
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getAllowedOrigins } from "../lib/cors.js";
import type { AppEnv } from "../types/index.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Parse and cache allowed origins once at module load time to avoid repeated
// string splitting and allocation on every mutation request.
const ALLOWED_ORIGINS = new Set(getAllowedOrigins());

function originFromReferer(referer: string): string | null {
  try {
    const u = new URL(referer);
    return u.origin;
  } catch {
    return null;
  }
}

export const csrfOriginCheck = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method;
  if (!MUTATION_METHODS.has(method)) {
    return next();
  }

  const path = c.req.path;
  const excludedPrefixes = ["/api/webhooks/"];
  if (excludedPrefixes.some((prefix) => path.startsWith(prefix))) {
    return next();
  }

  if (ALLOWED_ORIGINS.size === 0) {
    return next();
  }

  const origin = c.req.header("Origin");
  const referer = c.req.header("Referer");
  const candidate = origin ?? (referer ? originFromReferer(referer) : null);

  if (!candidate || !ALLOWED_ORIGINS.has(candidate)) {
    throw new HTTPException(403, {
      message: "Forbidden: Origin or Referer must match trusted origins",
    });
  }

  return next();
});
