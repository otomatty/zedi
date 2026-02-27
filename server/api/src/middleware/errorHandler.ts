import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/index.js";

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status;
    console.error(`[api] ${c.req.method} ${c.req.path} → ${status}`, err.message);
    return c.json({ error: err.message }, status);
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  const statusMap: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    RATE_LIMIT_EXCEEDED: 429,
    STORAGE_QUOTA_EXCEEDED: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    CONFLICT: 409,
  };
  const status = statusMap[message] ?? 500;

  console.error(`[api] ${c.req.method} ${c.req.path} → ${status}`, err);
  return c.json({ error: message }, status as ContentfulStatusCode);
};
