-- AI Platform Schema Migration
-- Adds subscription management, AI model definitions, usage tracking
-- Apply after 001_schema.sql

-- =============================================================================
-- 1. subscriptions
-- =============================================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'paid')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    external_id TEXT,              -- LemonSqueezy subscription ID
    external_customer_id TEXT,     -- LemonSqueezy customer ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_external_id ON subscriptions(external_id);

-- =============================================================================
-- 2. ai_models (provider/model registry with cost units)
-- =============================================================================
CREATE TABLE ai_models (
    id TEXT PRIMARY KEY,                -- e.g. "openai:gpt-4o-mini"
    provider TEXT NOT NULL,             -- "openai" | "anthropic" | "google"
    model_id TEXT NOT NULL,             -- API model ID e.g. "gpt-4o-mini"
    display_name TEXT NOT NULL,
    tier_required TEXT NOT NULL DEFAULT 'free' CHECK (tier_required IN ('free', 'paid')),
    input_cost_units INTEGER NOT NULL,  -- Cost Units per 1K input tokens
    output_cost_units INTEGER NOT NULL, -- Cost Units per 1K output tokens
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_models_provider ON ai_models(provider);
CREATE INDEX idx_ai_models_active ON ai_models(is_active) WHERE is_active;

-- =============================================================================
-- 3. ai_usage_logs (individual request records)
-- =============================================================================
CREATE TABLE ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL REFERENCES ai_models(id),
    feature TEXT NOT NULL,              -- "wiki_generation" | "mermaid_generation" | "chat" etc.
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_units INTEGER NOT NULL,        -- Computed cost units for this request
    api_mode TEXT NOT NULL DEFAULT 'system' CHECK (api_mode IN ('system', 'user_key')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_logs_user_month
    ON ai_usage_logs(user_id, created_at);
CREATE INDEX idx_ai_usage_logs_model
    ON ai_usage_logs(model_id);

-- =============================================================================
-- 4. ai_monthly_usage (aggregated monthly usage for fast lookups)
-- =============================================================================
CREATE TABLE ai_monthly_usage (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL,           -- "2026-02" format
    total_cost_units BIGINT NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, year_month)
);

-- =============================================================================
-- 5. ai_tier_budgets (budget configuration per tier)
-- =============================================================================
CREATE TABLE ai_tier_budgets (
    tier TEXT PRIMARY KEY,              -- "free" | "paid"
    monthly_budget_units INTEGER NOT NULL,
    description TEXT
);

-- =============================================================================
-- Seed data: tier budgets
-- =============================================================================
INSERT INTO ai_tier_budgets (tier, monthly_budget_units, description) VALUES
    ('free',  1500,  'Free tier: ~$0.15/month equivalent'),
    ('paid',  50000, 'Paid tier: ~$5.00/month equivalent');

-- =============================================================================
-- Seed data: AI models
-- 1 Cost Unit = $0.0001 (1/100 cent)
-- Input/Output costs are per 1K tokens
-- =============================================================================
INSERT INTO ai_models (id, provider, model_id, display_name, tier_required, input_cost_units, output_cost_units, is_active, sort_order) VALUES
    -- Google models (free tier)
    ('google:gemini-2.5-flash',       'google',    'gemini-2.5-flash',       'Gemini 2.5 Flash',        'free', 2,  6,   TRUE, 10),
    ('google:gemini-2.5-flash-lite',  'google',    'gemini-2.5-flash-lite',  'Gemini 2.5 Flash Lite',   'free', 1,  4,   TRUE, 11),
    -- OpenAI models (free tier)
    ('openai:gpt-4o-mini',            'openai',    'gpt-4o-mini',            'GPT-4o Mini',             'free', 2,  6,   TRUE, 20),
    -- Anthropic models (free tier)
    ('anthropic:claude-3-5-haiku',    'anthropic', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku',     'free', 8,  40,  TRUE, 30),
    -- Google models (paid tier)
    ('google:gemini-2.5-pro',         'google',    'gemini-2.5-pro',         'Gemini 2.5 Pro',          'paid', 13, 100, TRUE, 40),
    ('google:gemini-3-flash-preview', 'google',    'gemini-3-flash-preview', 'Gemini 3 Flash Preview',  'paid', 2,  8,   TRUE, 41),
    ('google:gemini-3-pro-preview',   'google',    'gemini-3-pro-preview',   'Gemini 3 Pro Preview',    'paid', 13, 100, TRUE, 42),
    -- OpenAI models (paid tier)
    ('openai:gpt-4o',                 'openai',    'gpt-4o',                 'GPT-4o',                  'paid', 25, 100, TRUE, 50),
    -- Anthropic models (paid tier)
    ('anthropic:claude-sonnet-4',     'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4',       'paid', 30, 150, TRUE, 60),
    ('anthropic:claude-3-5-sonnet',   'anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet',   'paid', 30, 150, TRUE, 61);
