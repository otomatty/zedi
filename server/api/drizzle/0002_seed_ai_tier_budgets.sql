-- Seed ai_tier_budgets with default monthly cost unit limits.
-- Run after table exists (e.g. drizzle:migrate or manual CREATE).
-- Safe to re-run: uses ON CONFLICT DO UPDATE.

INSERT INTO ai_tier_budgets (tier, monthly_budget_units, description)
VALUES
  ('free', 1500, 'Free tier: ~60 GPT-5 calls or ~1000 Flash calls per month'),
  ('pro', 15000, 'Pro tier: ~600 GPT-5 calls or ~10000 Flash calls per month')
ON CONFLICT (tier) DO UPDATE
  SET monthly_budget_units = EXCLUDED.monthly_budget_units,
      description = EXCLUDED.description;
