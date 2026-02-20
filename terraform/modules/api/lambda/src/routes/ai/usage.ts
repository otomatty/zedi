/**
 * GET /api/ai/usage — AI 使用量取得
 */
import { Hono } from 'hono';
import { authRequired } from '../../middleware/auth';
import { getUserTier } from '../../services/subscriptionService';
import { checkUsage } from '../../services/usageService';
import type { AppEnv } from '../../types';

const app = new Hono<AppEnv>();

app.get('/', authRequired, async (c) => {
  const userId = c.get('userId');
  const db = c.get('db');

  const tier = await getUserTier(userId, db);
  const usage = await checkUsage(userId, tier, db);

  return c.json({
    tier,
    budget_units: usage.budgetUnits,
    consumed_units: usage.consumedUnits,
    remaining_units: usage.remaining,
    usage_percent: usage.usagePercent,
  });
});

export default app;
