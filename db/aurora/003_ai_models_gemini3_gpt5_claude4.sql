-- AI models: Gemini 3.x only, GPT-5 only, Claude 4+ only
-- 1. 旧モデルを無効化
-- 2. 新モデルを追加（GPT-5, Claude Opus 4）
-- 3. Gemini 3 のティアを調整（flash=free, pro=paid）

-- 無効化: Gemini 2.5, GPT-4o系, Claude 3.5
UPDATE ai_models SET is_active = FALSE WHERE id IN (
  'google:gemini-2.5-flash',
  'google:gemini-2.5-flash-lite',
  'google:gemini-2.5-pro',
  'openai:gpt-4o-mini',
  'openai:gpt-4o',
  'anthropic:claude-3-5-haiku',
  'anthropic:claude-3-5-sonnet'
);

-- Gemini 3: flash=free, pro=paid（既存を更新）
UPDATE ai_models SET tier_required = 'free', sort_order = 10 WHERE id = 'google:gemini-3-flash-preview';
UPDATE ai_models SET tier_required = 'paid', sort_order = 20 WHERE id = 'google:gemini-3-pro-preview';

-- Claude Sonnet 4 を free ティアに（4以上なので維持）
UPDATE ai_models SET tier_required = 'free', sort_order = 30 WHERE id = 'anthropic:claude-sonnet-4';

-- Claude Opus 4.6 を追加（paid）
INSERT INTO ai_models (id, provider, model_id, display_name, tier_required, input_cost_units, output_cost_units, is_active, sort_order) VALUES
  ('anthropic:claude-opus-4-6', 'anthropic', 'claude-opus-4-6', 'Claude Opus 4.6', 'paid', 50, 200, TRUE, 31)
ON CONFLICT (id) DO UPDATE SET
  model_id = EXCLUDED.model_id,
  display_name = EXCLUDED.display_name,
  tier_required = EXCLUDED.tier_required,
  input_cost_units = EXCLUDED.input_cost_units,
  output_cost_units = EXCLUDED.output_cost_units,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- GPT-5 系を追加（nano=free, mini=free, 5.2=paid）
INSERT INTO ai_models (id, provider, model_id, display_name, tier_required, input_cost_units, output_cost_units, is_active, sort_order) VALUES
  ('openai:gpt-5-nano',   'openai', 'gpt-5-nano',   'GPT-5 nano',   'free', 2,  8,   TRUE, 40),
  ('openai:gpt-5-mini',   'openai', 'gpt-5-mini',   'GPT-5 mini',   'free', 5,  20,  TRUE, 41),
  ('openai:gpt-5.2',      'openai', 'gpt-5.2',      'GPT-5.2',     'paid', 30, 120, TRUE, 50)
ON CONFLICT (id) DO UPDATE SET
  model_id = EXCLUDED.model_id,
  display_name = EXCLUDED.display_name,
  tier_required = EXCLUDED.tier_required,
  input_cost_units = EXCLUDED.input_cost_units,
  output_cost_units = EXCLUDED.output_cost_units,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
