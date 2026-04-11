import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAllowedOrigins, isWildcardCors } from "./lib/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { csrfOriginCheck } from "./middleware/csrfOrigin.js";
import { dbMiddleware } from "./middleware/db.js";
import { redisMiddleware } from "./middleware/redis.js";
import { auth } from "./auth.js";
import type { AppEnv } from "./types/index.js";

import healthRoutes from "./routes/health.js";
import userRoutes from "./routes/users.js";
import pageRoutes from "./routes/pages.js";
import pageSnapshotRoutes from "./routes/pageSnapshots.js";
import syncPageRoutes from "./routes/syncPages.js";
import noteRoutes from "./routes/notes/index.js";
import searchRoutes from "./routes/search.js";
import mediaRoutes from "./routes/media.js";
import clipRoutes from "./routes/clip.js";
import extRoutes from "./routes/ext.js";
import mcpRoutes from "./routes/mcp.js";
import inviteRoutes from "./routes/invite.js";
import aiChatRoutes from "./routes/ai/chat.js";
import aiModelsRoutes from "./routes/ai/models.js";
import aiUsageRoutes from "./routes/ai/usage.js";
import aiSubscriptionRoutes from "./routes/ai/subscription.js";
import aiAdminRoutes from "./routes/ai/admin.js";
import adminRoutes from "./routes/admin/index.js";
import thumbSearchRoutes from "./routes/thumbnail/imageSearch.js";
import thumbGenerateRoutes from "./routes/thumbnail/imageGenerate.js";
import thumbCommitRoutes from "./routes/thumbnail/commit.js";
import thumbServeRoutes from "./routes/thumbnail/serve.js";
import webhookPolarRoutes from "./routes/webhooks/polar.js";
import checkoutRoutes from "./routes/checkout.js";
import subscriptionManageRoutes from "./routes/subscriptionManage.js";

/**
 * Creates and configures the Hono API app (routes, CORS, etc.).
 * Hono APIアプリを作成・設定する（ルート・CORS等）。
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const wildcard = isWildcardCors();
  const allowedOrigins = getAllowedOrigins();

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (wildcard) return "*";
        return origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
      },
      allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: !wildcard,
      maxAge: 86400,
    }),
  );

  app.use("*", csrfOriginCheck);
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

  // Page Snapshots (version history)
  app.route("/api/pages", pageSnapshotRoutes);

  // Sync
  app.route("/api/sync/pages", syncPageRoutes);

  // Notes
  app.route("/api/notes", noteRoutes);

  // Invitation acceptance (public + auth)
  app.route("/api/invite", inviteRoutes);

  // Search
  app.route("/api/search", searchRoutes);

  // Media
  app.route("/api/media", mediaRoutes);

  // Clip
  app.route("/api/clip", clipRoutes);

  // Chrome Extension (OAuth + clip-and-create)
  app.route("/api/ext", extRoutes);

  // MCP (Model Context Protocol) — PKCE auth + clip endpoint for external Claude Code clients.
  // MCP サーバー用ルート: PKCE 認証フローと、MCP JWT 経由の clip エンドポイント。
  app.route("/api/mcp", mcpRoutes);

  // AI
  app.route("/api/ai/chat", aiChatRoutes);
  app.route("/api/ai/models", aiModelsRoutes);
  app.route("/api/ai/usage", aiUsageRoutes);
  app.route("/api/ai/subscription", aiSubscriptionRoutes);
  app.route("/api/ai/admin", aiAdminRoutes);
  app.route("/api/admin", adminRoutes);

  // Subscription management
  app.route("/api/subscription", subscriptionManageRoutes);

  // Thumbnail
  app.route("/api/thumbnail/image-search", thumbSearchRoutes);
  app.route("/api/thumbnail/image-generate", thumbGenerateRoutes);
  app.route("/api/thumbnail/commit", thumbCommitRoutes);
  app.route("/api/thumbnail/serve", thumbServeRoutes);

  // 404 fallback（要求パスを返してデバッグしやすくする）
  app.all("*", (c) => c.json({ error: "Not found", path: c.req.path, method: c.req.method }, 404));

  return app;
}
