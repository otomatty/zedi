# Free/Pro プランの残りタスク

## 概要

Issue #143（Polar Pro プラン構築）を起点とした一連の実装のうち、バックエンドのモデル別 Cost Units 自動取得・ティアバジェット設定は完了した。
このドキュメントでは、フロントエンド UI とサブスクリプション管理に関する残りタスクをまとめる。

関連 Issue: [#143](https://github.com/otomatty/zedi/issues/143) / [#148](https://github.com/otomatty/zedi/issues/148) / [#149](https://github.com/otomatty/zedi/issues/149)

---

## 完了済みタスク

| タスク                                                             | ファイル                                                      | 状態      |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | --------- |
| Polar Pro プラン価格設定・i18n・API レスポンス統一                 | 複数ファイル                                                  | ✅ (#143) |
| 契約済みユーザーの Pricing ページ更新                              | `Pricing.tsx`, `subscriptionService.ts`, `useSubscription.ts` | ✅        |
| CurrentPlanStatus コンポーネント実装                               | `Pricing.tsx`                                                 | ✅        |
| OpenRouter API によるモデル別 Cost Units 自動取得                  | `syncAiModels.ts`                                             | ✅        |
| `usageService.ts` フォールバック値更新 (Free: 1,500 / Pro: 15,000) | `usageService.ts`                                             | ✅        |
| `ai_tier_budgets` 初期データ投入 (Free: 1,500 / Pro: 15,000)       | DB 適用済み                                                   | ✅        |
| `OPENROUTER_API_KEY` Railway 環境変数設定                          | Railway development                                           | ✅        |
| 全モデルの Cost Units 設定確認                                     | Railway sync 実行済み                                         | ✅        |

---

## 残りタスク

### 1. フロントエンド: モデル選択 UI にコスト表示を追加

**目的:** ユーザーがモデルを選ぶときに、相対的なコストを把握できるようにする。

**対象ファイル:**

- `src/components/settings/AISettingsForm.tsx` — モデル選択ドロップダウン
- `server/api/src/routes/ai/models.ts` — API レスポンスに `inputCostUnits` / `outputCostUnits` を追加

**仕様:**

- モデル一覧 API (`GET /api/ai/models`) のレスポンスに `inputCostUnits` と `outputCostUnits` を含める。
- フロントエンドのモデル選択 UI で、最安モデルを基準にした倍率ラベル（例: `1x`, `5x`, `25x`）を表示する。
- 最安モデル（CU が最小）を `1x` とし、他のモデルは `inputCostUnits / 最小値` で計算する。
- コスト表示は i18n 対応する。

**参考: 現在の Cost Units（2026-03 同期結果）**

| モデル            | Input CU | 倍率目安 |
| ----------------- | -------- | -------- |
| gpt-5-nano        | 5        | 1x       |
| gemini-2.0-flash  | 7        | 1x       |
| gpt-5-mini        | 25       | 5x       |
| gemini-2.5-flash  | 30       | 6x       |
| gpt-5             | 125      | 25x      |
| claude-sonnet-4-6 | 300      | 60x      |
| claude-opus-4-6   | 500      | 100x     |
| gpt-5-pro         | 1,500    | 300x     |

---

### 2. フロントエンド: チャット送信時のコスト見積もり表示

**目的:** チャット送信前後に消費される Cost Units をユーザーに示す。

**対象ファイル:**

- `src/components/ai-chat/` 配下のチャット入力コンポーネント

**仕様:**

- 送信ボタン付近に「このリクエストで消費されるおおよその CU」を表示する。
  - 入力テキストの文字数から推定 input tokens を計算（`文字数 / 4`）。
  - 選択中モデルの `inputCostUnits` を使って `(推定tokens / 1000) * inputCostUnits` で見積もり。
- 送信後は、API レスポンスに含まれる `usage.costUnits` を表示する（既にレスポンスに含まれている）。

---

### 3. Cost Units の仕組みをユーザー向けヘルプに記載

**目的:** ユーザーが Cost Units の意味を理解できるようにする。

**対象:**

- Pricing ページ内のヘルプテキスト or FAQ セクション
- `pricing.json` (ja/en) に追加

**内容案:**

- Cost Units はモデルの API 料金に比例した相対的な単位
- 安いモデル（Flash 系）は少ない CU で利用でき、高性能モデル（Opus, GPT-5 Pro）は多くの CU を消費する
- 月間上限に達した場合の挙動（リクエストが拒否される）

---

### 4. 独自サブスクリプション管理 UI（Issue #148）

**目的:** Polar ポータルに遷移せず、アプリ内でサブスク管理を完結させる。

#### 4-1. バックエンド: Customer Portal API プロキシルート

**対象ファイル（新規）:**

- `server/api/src/routes/subscription/details.ts` — `GET /api/subscription/details`
- `server/api/src/routes/subscription/cancel.ts` — `POST /api/subscription/cancel`
- `server/api/src/routes/subscription/reactivate.ts` — `POST /api/subscription/reactivate`
- `server/api/src/routes/subscription/change-plan.ts` — `POST /api/subscription/change-plan`

**仕様:**

- Polar の Customer Portal API（REST）を呼び出すプロキシ。
- 認証済みユーザーの Polar customer ID を使ってリクエストを転送する。
- レスポンスはフロントエンドで扱いやすい形にマッピングする。

#### 4-2. フロントエンド: サブスク管理ページ

**対象ファイル（新規）:**

- `src/pages/SubscriptionManagement.tsx`
- `src/lib/subscriptionService.ts` — 新しい API エンドポイントの呼び出し関数追加

**仕様:**

- 現在のプラン情報（プラン名、ステータス、次回請求日、請求額）を表示。
- プラン変更（月額 ↔ 年額）ボタン。
- サブスクリプション解約・再開ボタン。
- 「お支払い情報の変更」リンクは引き続き Polar ポータルへ（ExternalLink アイコン付き）。

#### 4-3. Pricing ページの「サブスク管理」ボタンを独自ページへのリンクに変更

**対象ファイル:**

- `src/pages/Pricing.tsx`

**仕様:**

- 現在 Polar ポータルへ遷移するボタンを、独自の `/subscription` ページへのリンクに変更。
- ExternalLink アイコンを削除し、通常のページ遷移にする。

---

## 優先度の提案

| 優先度 | タスク                            | 理由                          |
| ------ | --------------------------------- | ----------------------------- |
| **高** | 1. モデル選択 UI にコスト表示     | ユーザーのコスト意識に直結    |
| **中** | 3. ヘルプに CU の説明追加         | UX 向上                       |
| **中** | 2. チャット送信時のコスト見積もり | UX 向上だが必須ではない       |
| **低** | 4. 独自サブスク管理 UI            | 現状 Polar ポータルで代替可能 |

---

## 現在の DB 状態（development 環境）

### ai_tier_budgets

| tier | monthly_budget_units | description                                                |
| ---- | -------------------- | ---------------------------------------------------------- |
| free | 1,500                | Free tier: ~60 GPT-5 calls or ~1000 Flash calls per month  |
| pro  | 15,000               | Pro tier: ~600 GPT-5 calls or ~10000 Flash calls per month |

### ai_models（Cost Units 設定済み、pricingSource: openrouter）

全 23 モデルがアクティブ。モデル別 Cost Units は OpenRouter API 料金に基づいて自動計算済み。
`npm run sync:ai-models` または管理エンドポイントで再同期すると最新料金に追従する。
