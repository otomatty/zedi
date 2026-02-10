-- Rename plan values from 'paid' to 'pro' across AI platform tables.
-- Apply after 002_ai_platform.sql (and any 003_* seed/migrations).

-- =============================================================================
-- subscriptions: plan 'paid' -> 'pro'
-- =============================================================================
UPDATE subscriptions SET plan = 'pro' WHERE plan = 'paid';

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('free', 'pro'));

-- =============================================================================
-- ai_tier_budgets: tier 'paid' -> 'pro'
-- =============================================================================
UPDATE ai_tier_budgets SET tier = 'pro' WHERE tier = 'paid';

-- =============================================================================
-- ai_models: tier_required 'paid' -> 'pro'
-- =============================================================================
UPDATE ai_models SET tier_required = 'pro' WHERE tier_required = 'paid';

ALTER TABLE ai_models DROP CONSTRAINT IF EXISTS ai_models_tier_required_check;
ALTER TABLE ai_models ADD CONSTRAINT ai_models_tier_required_check CHECK (tier_required IN ('free', 'pro'));

-- =============================================================================
-- subscriptions: optional billing interval for display (monthly | yearly)
-- =============================================================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT;
