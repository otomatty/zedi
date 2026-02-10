-- Seed ai_models (idempotent: ON CONFLICT DO NOTHING)
INSERT INTO ai_models (id, provider, model_id, display_name, tier_required, input_cost_units, output_cost_units, is_active, sort_order) VALUES
    ('google:gemini-2.5-flash',       'google',    'gemini-2.5-flash',       'Gemini 2.5 Flash',        'free', 2,  6,   TRUE, 10),
    ('google:gemini-2.5-flash-lite',  'google',    'gemini-2.5-flash-lite',  'Gemini 2.5 Flash Lite',   'free', 1,  4,   TRUE, 11),
    ('openai:gpt-4o-mini',            'openai',    'gpt-4o-mini',            'GPT-4o Mini',             'free', 2,  6,   TRUE, 20),
    ('anthropic:claude-3-5-haiku',    'anthropic', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku',     'free', 8,  40,  TRUE, 30),
    ('google:gemini-2.5-pro',         'google',    'gemini-2.5-pro',         'Gemini 2.5 Pro',          'paid', 13, 100, TRUE, 40),
    ('google:gemini-3-flash-preview', 'google',    'gemini-3-flash-preview', 'Gemini 3 Flash Preview',  'paid', 2,  8,   TRUE, 41),
    ('google:gemini-3-pro-preview',   'google',    'gemini-3-pro-preview',   'Gemini 3 Pro Preview',    'paid', 13, 100, TRUE, 42),
    ('openai:gpt-4o',                 'openai',    'gpt-4o',                 'GPT-4o',                  'paid', 25, 100, TRUE, 50),
    ('anthropic:claude-sonnet-4',     'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4',       'paid', 30, 150, TRUE, 60),
    ('anthropic:claude-3-5-sonnet',   'anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet',   'paid', 30, 150, TRUE, 61)
ON CONFLICT (id) DO NOTHING;
