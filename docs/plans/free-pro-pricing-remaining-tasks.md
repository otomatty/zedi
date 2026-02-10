# Free / Pro 料金プラン — 残タスク一覧

Free / Pro 2プラン統合の実装はコード上は完了している。本ドキュメントは**デプロイと運用に必要な残作業**および**任意の改善タスク**をまとめたもの。

---

## 1. 必須タスク（デプロイ前）

### 1.1 DB マイグレーションの適用

- **ファイル**: `db/aurora/004_plan_rename.sql`
- **内容**:
  - `subscriptions.plan`: `paid` → `pro`、CHECK 制約を `('free','pro')` に変更
  - `ai_tier_budgets.tier`: `paid` → `pro`
  - `ai_models.tier_required`: `paid` → `pro`、CHECK 制約更新
  - `subscriptions.billing_interval` カラム追加
- **手順**: Aurora（本番/ステージング）に対してマイグレーションを実行する。
  - 例: `db/aurora/apply.sh` や RDS Data API 用スクリプトで `004_plan_rename.sql` を適用。

### 1.2 LemonSqueezy 商品・Webhook 設定

| 項目 | 内容 |
|------|------|
| 月額商品 | $10/月 のサブスクリプション商品を作成し、Product ID を取得 |
| 年額商品 | $100/年 のサブスクリプション商品を作成し、Product ID を取得 |
| Webhook URL | `https://<API Gateway ドメイン>/api/webhooks/lemonsqueezy` を登録（既存設定の確認） |
| 署名検証 | Webhook Secret を Secrets Manager（`zedi-<env>-lemonsqueezy`）に設定 |

### 1.3 環境変数の設定

フロントエンド（Vite）で以下を設定する。

- `VITE_LEMONSQUEEZY_STORE_ID` — ストア ID
- `VITE_LEMONSQUEEZY_AI_MONTHLY_PRODUCT_ID` — 月額 $10 の Product ID
- `VITE_LEMONSQUEEZY_AI_YEARLY_PRODUCT_ID` — 年額 $100 の Product ID
- （任意）`VITE_LEMONSQUEEZY_PORTAL_URL` — 顧客がサブスクを管理するポータル URL

`.env.example` に上記の説明を記載済み。

### 1.4 インフラのデプロイ

- **Terraform**: `terraform apply` により以下が反映される。
  - AI API Lambda（`GET /api/ai/subscription` ルート含む）
  - Subscription Webhook Lambda（`plan='pro'`, `billing_interval` 対応）
- **Lambda デプロイ**: AI API モジュールのビルド成果物（`lambda.zip`）が Terraform でデプロイされることを確認。

---

## 2. 推奨タスク（運用・UX）

### 2.1 チェックアウト後のプラン反映

- **現状**: Pricing ページで「Pro を契約」後に `setTimeout(refetch, 2000)` で一度だけ再取得している。
- **推奨**: 同一タブでチェックアウトから戻った場合に、`window.addEventListener('focus')` やポーリングで `useSubscription.refetch()` を実行するなど、確実に最新プランを表示する。

### 2.2 新規ユーザー用の subscriptions 行

- **現状**: `getSubscription` は `subscriptions` に行が無いユーザーを「Free」として扱う。行は LemonSqueezy の Webhook で初回契約時に作成される。
- **任意**: 初回サインアップ時に `plan='free'`, `status='active'` の行を挿入し、全ユーザーが `subscriptions` に存在する形にすると、分析や将来の無料トライアル実装がしやすい。

### 2.3 ページ数制限（100ページ）の強制

- **設計**: Free は「100ページまで」としているが、バックエンドでのページ数チェック実装有無は未確認。
- **推奨**: ページ作成・インポート時に `plan === 'free'` なら現在ページ数を取得し、100 を超える場合は作成を拒否する（またはアップセル案内を表示する）ロジックを追加する。

### 2.4 クラウド同期の「全ユーザー開放」の確認

- **設計**: クラウド同期は Free / Pro 両方で利用可能。
- **推奨**: 同期機能の認可・表示条件に、Pro 限定だった古いフラグが残っていないか確認し、必要なら「全ユーザー」に統一する。

---

## 3. 任意タスク（将来の拡張）

- **Pro レート制限の緩和**: 現状は Free と同様 120 req/h。Pro は 200 や 300 などに引き上げる検討。
- **無料トライアル**: `status='trialing'` は既に DB と判定ロジックで考慮済み。LemonSqueezy でトライアル付き商品にし、Webhook で `trialing` が送られてくるようにする即可。
- **請求履歴・領収書**: LemonSqueezy の顧客ポータル（`VITE_LEMONSQUEEZY_PORTAL_URL`）で完結させるか、自前で「請求履歴」画面を用意するか検討。
- **プラン変更（月額↔年額）**: LemonSqueezy 側でプラン変更を扱い、Webhook で `billing_interval` を更新するか、または顧客ポータルで変更してもらう運用で対応可能。

---

## 4. 参照

- **設計・実装計画**: `.cursor/plans/free_pro_pricing_plan_86d18b36.plan.md`（または同内容のプランファイル）
- **マイグレーション**: `db/aurora/004_plan_rename.sql`
- **フロント**: `src/pages/Pricing.tsx`, `src/hooks/useSubscription.ts`, `src/lib/subscriptionService.ts`
- **バックエンド**: `terraform/modules/ai-api/lambda/src/routes/subscription.ts`, `services/subscriptionService.ts`, `services/usageService.ts`
- **Webhook**: `terraform/modules/subscription/lambda/index.mjs`
