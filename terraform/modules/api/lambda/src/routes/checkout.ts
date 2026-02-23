/**
 * POST /api/checkout — Polar Checkout Session 作成
 * POST /api/customer-portal — Polar Customer Portal URL 取得
 *
 * 認証済みユーザーのみ利用可能 (authRequired)
 *
 * @see https://polar.sh/docs/features/checkout/session
 */
import { Hono } from 'hono';
import { Polar } from '@polar-sh/sdk';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';
import { getPolarSecrets } from '../lib/secrets';
import { getEnvConfig } from '../env';

const app = new Hono<AppEnv>();

/**
 * POST /api/checkout
 * Body: { productId: string }
 * Returns: { url: string }
 */
app.post('/checkout', authRequired, async (c) => {
  const userId = c.get('userId');
  const { productId } = await c.req.json<{ productId: string }>();

  if (!productId) {
    return c.json({ error: 'productId is required' }, 400);
  }

  const env = getEnvConfig();
  const secrets = await getPolarSecrets(env.POLAR_SECRET_ARN);

  const polar = new Polar({
    accessToken: secrets.POLAR_ACCESS_TOKEN,
    server: env.ENVIRONMENT === 'prod' ? 'production' : 'sandbox',
  });

  const successUrl = env.CORS_ORIGIN !== '*'
    ? `${env.CORS_ORIGIN}/pricing?checkout=success`
    : undefined;

  const checkout = await polar.checkouts.create({
    products: [productId],
    externalCustomerId: userId,
    ...(successUrl ? { successUrl } : {}),
  });

  return c.json({ url: checkout.url });
});

/**
 * POST /api/customer-portal
 * Returns: { url: string }
 */
app.post('/customer-portal', authRequired, async (c) => {
  const userId = c.get('userId');

  const env = getEnvConfig();
  const secrets = await getPolarSecrets(env.POLAR_SECRET_ARN);

  const polar = new Polar({
    accessToken: secrets.POLAR_ACCESS_TOKEN,
    server: env.ENVIRONMENT === 'prod' ? 'production' : 'sandbox',
  });

  // externalCustomerId で直接 Customer Session を作成
  const portal = await polar.customerSessions.create({
    externalCustomerId: userId,
  });

  return c.json({ url: portal.customerPortalUrl });
});

export default app;
