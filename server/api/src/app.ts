import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errorHandler.js";
import { dbMiddleware } from "./middleware/db.js";
import { redisMiddleware } from "./middleware/redis.js";
import { auth } from "./auth.js";
import type { AppEnv } from "./types/index.js";

import healthRoutes from "./routes/health.js";
import userRoutes from "./routes/users.js";
import pageRoutes from "./routes/pages.js";
import syncPageRoutes from "./routes/syncPages.js";
import noteRoutes from "./routes/notes.js";
import searchRoutes from "./routes/search.js";
import mediaRoutes from "./routes/media.js";
import clipRoutes from "./routes/clip.js";
import aiChatRoutes from "./routes/ai/chat.js";
import aiModelsRoutes from "./routes/ai/models.js";
import aiUsageRoutes from "./routes/ai/usage.js";
import aiSubscriptionRoutes from "./routes/ai/subscription.js";
import thumbSearchRoutes from "./routes/thumbnail/imageSearch.js";
import thumbGenerateRoutes from "./routes/thumbnail/imageGenerate.js";
import thumbCommitRoutes from "./routes/thumbnail/commit.js";
import webhookPolarRoutes from "./routes/webhooks/polar.js";
import checkoutRoutes from "./routes/checkout.js";

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const rawCorsOrigin = process.env.CORS_ORIGIN?.trim() || "";
  const isWildcard = !rawCorsOrigin || rawCorsOrigin === "*";

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (isWildcard) return "*";
        const allowed = rawCorsOrigin
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return origin && allowed.includes(origin) ? origin : allowed[0];
      },
      allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: !isWildcard,
      maxAge: 86400,
    }),
  );

  app.use("*", dbMiddleware);
  app.use("*", redisMiddleware);
  app.onError(errorHandler);

  // Better Auth handler — use :path{.+} to match multi-segment paths (e.g. /api/auth/sign-in/social).
  // Hono's * only matches a single segment, so ** would not match sign-in/social.
  app.on(["POST", "GET"], "/api/auth/:path{.+}", (c) => {
    return auth.handler(c.req.raw);
  });
  app.on(["POST", "GET"], "/api/auth", (c) => {
    return auth.handler(c.req.raw);
  });

  // Health check (no auth)
  app.route("/api", healthRoutes);

  // Webhook (no JWT auth — uses Standard Webhooks signature)
  app.route("/api/webhooks/polar", webhookPolarRoutes);

  // Checkout & Customer Portal
  app.route("/api", checkoutRoutes);

  // Users
  app.route("/api/users", userRoutes);

  // Pages
  app.route("/api/pages", pageRoutes);

  // Sync
  app.route("/api/sync/pages", syncPageRoutes);

  // Notes
  app.route("/api/notes", noteRoutes);

  // Search
  app.route("/api/search", searchRoutes);

  // Media
  app.route("/api/media", mediaRoutes);

  // Clip
  app.route("/api/clip", clipRoutes);

  // AI
  app.route("/api/ai/chat", aiChatRoutes);
  app.route("/api/ai/models", aiModelsRoutes);
  app.route("/api/ai/usage", aiUsageRoutes);
  app.route("/api/ai/subscription", aiSubscriptionRoutes);

  // Thumbnail
  app.route("/api/thumbnail/image-search", thumbSearchRoutes);
  app.route("/api/thumbnail/image-generate", thumbGenerateRoutes);
  app.route("/api/thumbnail/commit", thumbCommitRoutes);

  // 404 fallback
  app.all("*", (c) => c.json({ error: "Not found" }, 404));

  return app;
}
