import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth } from "../auth.js";
import type { AppEnv } from "../types/index.js";

export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  c.set("userId", session.user.id);
  c.set("userEmail", session.user.email);
  await next();
});

export const authOptional = createMiddleware<AppEnv>(async (c, next) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      c.set("userId", session.user.id);
      c.set("userEmail", session.user.email);
    }
  } catch {
    // No valid session — continue without auth
  }
  await next();
});
