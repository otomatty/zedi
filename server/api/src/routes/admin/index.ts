import { Hono } from "hono";
import { authRequired } from "../../middleware/auth.js";
import { adminRequired } from "../../middleware/adminAuth.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.use("*", authRequired);
app.use("*", adminRequired);

/** GET /api/admin/me — current admin user (for admin UI). */
app.get("/me", (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  return c.json({
    id: userId,
    email: userEmail ?? null,
    role: "admin" as const,
  });
});

export default app;
