/**
 * Hono アプリケーションファクトリ
 *
 * 全ルートとミドルウェアを統合した Hono アプリケーションを構築する。
 * テスト用に export しており、index.ts で Lambda ハンドラーにラップされる。
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/errorHandler';
import { dbMiddleware } from './middleware/db';
import { getEnvConfig } from './env';
import type { AppEnv } from './types';

// ── Route imports ───────────────────────────────────────────────────────────
import healthRoutes from './routes/health';
import userRoutes from './routes/users';
import pageRoutes from './routes/pages';
import syncPageRoutes from './routes/syncPages';
import noteRoutes from './routes/notes';
import searchRoutes from './routes/search';
import mediaRoutes from './routes/media';
import clipRoutes from './routes/clip';
import aiChatRoutes from './routes/ai/chat';
import aiModelsRoutes from './routes/ai/models';
import aiUsageRoutes from './routes/ai/usage';
import aiSubscriptionRoutes from './routes/ai/subscription';
import thumbSearchRoutes from './routes/thumbnail/imageSearch';
import thumbGenerateRoutes from './routes/thumbnail/imageGenerate';
import thumbCommitRoutes from './routes/thumbnail/commit';
import webhookPolarRoutes from './routes/webhooks/polar';
import checkoutRoutes from './routes/checkout';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ── Global middleware ───────────────────────────────────────────────────
  // CORS
  app.use(
    '*',
    cors({
      origin: (origin) => {
        const env = getEnvConfig();
        if (env.CORS_ORIGIN === '*') return origin;
        const allowed = env.CORS_ORIGIN.split(',').map((s) => s.trim());
        return allowed.includes(origin) ? origin : allowed[0] || '*';
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  );

  // DB ミドルウェア (全ルートで DB クライアントを利用可能にする)
  app.use('*', dbMiddleware);

  // エラーハンドラー
  app.onError(errorHandler);

  // ── Routes ──────────────────────────────────────────────────────────────
  // Health check (no auth)
  app.route('/api', healthRoutes);

  // Webhook (no JWT auth — uses Standard Webhooks signature)
  app.route('/api/webhooks/polar', webhookPolarRoutes);

  // Checkout & Customer Portal (auth required)
  app.route('/api', checkoutRoutes);

  // Users
  app.route('/api/users', userRoutes);

  // Pages
  app.route('/api/pages', pageRoutes);

  // Sync
  app.route('/api/sync/pages', syncPageRoutes);

  // Notes
  app.route('/api/notes', noteRoutes);

  // Search
  app.route('/api/search', searchRoutes);

  // Media
  app.route('/api/media', mediaRoutes);

  // Clip
  app.route('/api/clip', clipRoutes);

  // AI
  app.route('/api/ai/chat', aiChatRoutes);
  app.route('/api/ai/models', aiModelsRoutes);
  app.route('/api/ai/usage', aiUsageRoutes);
  app.route('/api/ai/subscription', aiSubscriptionRoutes);

  // Thumbnail
  app.route('/api/thumbnail/image-search', thumbSearchRoutes);
  app.route('/api/thumbnail/image-generate', thumbGenerateRoutes);
  app.route('/api/thumbnail/commit', thumbCommitRoutes);

  // ── 404 fallback ────────────────────────────────────────────────────────
  app.all('*', (c) => c.json({ error: 'Not found' }, 404));

  return app;
}
