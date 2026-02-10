# 使用可能なAIモデル一覧（調査結果）

最終更新: 2026年2月

## 方針

- **Gemini**: 3.0 系のみ（gemini-3-flash-preview, gemini-3-pro-preview）
- **GPT**: 5 系のみ（gpt-5.2, gpt-5-mini, gpt-5-nano）
- **Claude**: 4 以上のみ（claude-sonnet-4, claude-opus-4-6）

## 1. Zedi で現在登録しているモデル

`ai_models` テーブル（Aurora）およびフロントの `AI_PROVIDERS.defaultModels` に定義されているモデルです。

### 1.1 システムプロバイダー用（DB: ai_models）

| id | provider | model_id (API用) | display_name | tier |
|----|----------|------------------|--------------|------|
| google:gemini-3-flash-preview | google | gemini-3-flash-preview | Gemini 3 Flash Preview | free |
| google:gemini-3-pro-preview | google | gemini-3-pro-preview | Gemini 3 Pro Preview | paid |
| openai:gpt-5-nano | openai | gpt-5-nano | GPT-5 nano | free |
| openai:gpt-5-mini | openai | gpt-5-mini | GPT-5 mini | free |
| openai:gpt-5.2 | openai | gpt-5.2 | GPT-5.2 | paid |
| anthropic:claude-sonnet-4 | anthropic | claude-sonnet-4-20250514 | Claude Sonnet 4 | free |
| anthropic:claude-opus-4-6 | anthropic | claude-opus-4-6 | Claude Opus 4.6 | paid |

- **free**: 無料プランで利用可能  
- **paid**: AI Power（有料）プランで利用可能  
- 旧モデル（Gemini 2.5, GPT-4o, Claude 3.5）は `is_active = false` で非表示

### 1.2 ユーザーAPIキー用（フロント: defaultModels）

- **Google**: gemini-3-flash-preview, gemini-3-pro-preview  
- **OpenAI**: gpt-5.2, gpt-5-mini, gpt-5-nano  
- **Anthropic**: claude-opus-4-6, claude-sonnet-4-20250514  

---

## 2. 各プロバイダーの公式「利用可能モデル」（参考）

API ドキュメント・モデル一覧ページに基づく現在の利用可能モデルです。Zedi のシードはこれと照らして追加・非推奨を検討してください。

### 2.1 Google (Gemini API)

| Model code | 種別 | 備考 |
|------------|------|------|
| **gemini-3-pro-preview** | Preview | 最上位・マルチモーダル |
| **gemini-3-flash-preview** | Preview | バランス型 |
| **gemini-3-pro-image-preview** | Preview | 画像生成・理解特化 |
| **gemini-2.5-pro** | Stable | 推論・長文向け |
| **gemini-2.5-flash** | Stable | コスパ・スループット向け |
| **gemini-2.5-flash-lite** | Stable | 最速・低コスト |
| gemini-2.5-flash-preview-09-2025 | Preview | 2.5 Flash のプレビュー |
| gemini-2.5-flash-image | Stable | 画像入出力 |
| gemini-2.5-flash-preview-tts | Preview | TTS |
| gemini-2.0-flash / gemini-2.0-flash-001 | Deprecated | **2026-03-31 終了** |
| gemini-2.0-flash-lite / gemini-2.0-flash-lite-001 | Deprecated | **2026-03-31 終了** |

- Zedi で登録済みの **gemini-2.5-flash**, **gemini-2.5-flash-lite**, **gemini-2.5-pro**, **gemini-3-flash-preview**, **gemini-3-pro-preview** はすべて公式で利用可能です。

### 2.2 OpenAI (Chat Completions API)

| モデル種別 | 代表的な model id | 備考 |
|------------|-------------------|------|
| Frontier | gpt-5.2, gpt-5-mini, gpt-5-nano, gpt-5.2-pro, gpt-4.1 | 推奨 |
| ChatGPT 用 | chatgpt-4o-latest, gpt-5-chat-latest | API 利用は非推奨の記載あり |
| 従来系 | gpt-4o, gpt-4o-mini | 引き続き API で利用可能な場合あり |
| Reasoning | o3, o4-mini, o3-pro 等 | 推論特化 |
| 画像・音声・動画等 | 各種専用モデル | テキストチャット以外 |

- 公式の「Frontier」としては **gpt-5.2 / gpt-5-mini / gpt-5-nano / gpt-4.1** 等が挙がっています。  
- **gpt-4o** / **gpt-4o-mini** は Zedi で登録済みで、現時点でも API で利用可能とされる情報があります（変更は公式ドキュメントで要確認）。

### 2.3 Anthropic (Claude API)

| モデル | API id 例 | 備考 |
|--------|-----------|------|
| Claude Opus 4.6 | claude-opus-4-6 | 最上位 |
| Claude Sonnet 4 | claude-sonnet-4（日付サフィックスありの可能性） | 汎用 |
| Claude 3.5 Sonnet | claude-3-5-sonnet-20241022 | 従来系 |
| Claude 3.5 Haiku | claude-3-5-haiku-20241022 | 軽量 |

- 利用可能な **id** の一覧は `GET https://api.anthropic.com/v1/models` で取得できます。  
- Zedi で登録済みの **claude-sonnet-4-20250514**, **claude-3-5-sonnet-20241022**, **claude-3-5-haiku-20241022** は、Anthropic のモデル一覧と整合しています（日付サフィックスは API の返す id に合わせてある想定）。

---

## 3. まとめ・推奨

### 現在 Zedi で「使用可能」なモデル

- **無料ティア**: Gemini 2.5 Flash / Flash Lite, GPT-4o Mini, Claude 3.5 Haiku（いずれも DB 登録済み・公式で利用可能）。  
- **有料ティア**: Gemini 2.5 Pro / 3 Flash Preview / 3 Pro Preview, GPT-4o, Claude Sonnet 4 / 3.5 Sonnet（同上）。

### 追加を検討できるモデル（任意）

- **OpenAI**: gpt-4.1, gpt-4.1-mini, gpt-5-mini 等（公式の Frontier に合わせてシードと Cost Unit を定義）。  
- **Anthropic**: claude-opus-4-6 等（List Models の返却 id を確認してから id / model_id を追加）。  
- **Google**: 現状の登録で不足はなく、必要なら gemini-2.5-flash-image 等の用途特化を検討可能。

### 非推奨・終了予定

- **Google**: gemini-2.0-flash, gemini-2.0-flash-lite は 2026-03-31 終了予定。Zedi には未登録のため対応不要。  
- **OpenAI**: gpt-4.5-preview は Deprecated の記載あり。Zedi には未登録。

### モデル追加のやり方

1. **DB**: `db/aurora/002_seed_ai_models.sql` と同様に、`INSERT INTO ai_models (...) VALUES (...) ON CONFLICT (id) DO NOTHING` で追加。  
2. **Cost Unit**: `input_cost_units` / `output_cost_units` を各プロバイダーの料金表に合わせて設定。  
3. **フロント（ユーザーAPIキー用）**: `src/types/ai.ts` の `AI_PROVIDERS[].defaultModels` に model_id を追加すると、ユーザーが「自分のAPIキー」でそのモデルを選べます。

---

## 4. 参照リンク

- [OpenAI Models](https://platform.openai.com/docs/models)  
- [Anthropic List Models](https://docs.anthropic.com/en/api/models/list)  
- [Google Gemini models](https://ai.google.dev/gemini-api/docs/models)  
- Zedi シード: `db/aurora/002_ai_platform.sql`, `db/aurora/002_seed_ai_models.sql`  
- フロント定義: `src/types/ai.ts`（AI_PROVIDERS, DEFAULT_AI_SETTINGS）
