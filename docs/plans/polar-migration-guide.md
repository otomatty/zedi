# LemonSqueezy → Polar 移行ガイド

> **前提**: Step 1（Polar アカウント・組織作成）と Step 2（商品作成: Pro Monthly $10/月, Pro Yearly $100/年）は完了済み。
> 本ドキュメントでは Step 3 以降の実装作業を解説する。

---

## 目次

1. [Step 3: SDK インストール](#step-3-sdk-インストール)
2. [Step 4: 環境変数・Secrets の更新](#step-4-環境変数secrets-の更新)
3. [Step 5: Webhook ハンドラの書き換え](#step-5-webhook-ハンドラの書き換え)
4. [Step 6: フロントエンド チェックアウトの書き換え](#step-6-フロントエンド-チェックアウトの書き換え)
5. [Step 7: Terraform インフラ変更](#step-7-terraform-インフラ変更)
6. [Step 8: テスト（Sandbox 環境）](#step-8-テストsandbox-環境)
7. [Step 9: 本番デプロイ](#step-9-本番デプロイ)
8. [付録: 変更対象ファイル一覧](#付録-変更対象ファイル一覧)

---

## Step 3: SDK インストール

### 3.1 バックエンド（Lambda / Hono）

Lambda の `package.json` は `terraform/modules/api/lambda/package.json` にある。

```bash
cd terraform/modules/api/lambda
npm install @polar-sh/sdk
```

> **`@polar-sh/hono` を使うかどうか**
>
> `@polar-sh/hono` は Polar 公式の Hono アダプターで、Checkout / Webhook / CustomerPortal を数行で実装できる。
> ただし現在の Lambda 構成では Webhook の署名検証後に DB 操作（Drizzle ORM）を行う必要があるため、
> `@polar-sh/sdk` の `validateEvent` を直接使う方が柔軟性が高い。
>
> 以下の方針を推奨:
> - **Webhook 署名検証**: `@polar-sh/sdk/webhooks` の `validateEvent` を使用
> - **Checkout Session 作成**: `@polar-sh/sdk` の `Polar` クラスを使用（バックエンド API エンドポイント経由）
>
> もし `@polar-sh/hono` も使いたい場合:
> ```bash
> npm install @polar-sh/hono
> ```

### 3.2 フロントエンド（Vite / React）

Embedded Checkout を使う場合のみ:

```bash
# プロジェクトルートで
npm install @polar-sh/checkout
```

Checkout Link（Polar ホスト画面へリダイレクト）方式なら追加パッケージ不要。

---

## Step 4: 環境変数・Secrets の更新

### 4.1 フロントエンド環境変数（`.env`）

**削除する変数:**
```dotenv
# ↓ すべて削除
VITE_LEMONSQUEEZY_STORE_ID=...
VITE_LEMONSQUEEZY_AI_MONTHLY_PRODUCT_ID=...
VITE_LEMONSQUEEZY_AI_YEARLY_PRODUCT_ID=...
VITE_LEMONSQUEEZY_AI_PRODUCT_ID=...
VITE_LEMONSQUEEZY_PORTAL_URL=...
```

**追加する変数:**
```dotenv
# Polar (Pro plan billing)
# Product IDs: Polar ダッシュボード > Products > "..." > Copy Product ID
VITE_POLAR_PRO_MONTHLY_PRODUCT_ID=YOUR_MONTHLY_PRODUCT_ID
VITE_POLAR_PRO_YEARLY_PRODUCT_ID=YOUR_YEARLY_PRODUCT_ID
# Checkout Session を使う場合: バックエンドで作成するため不要
# Checkout Link を使う場合: Polar ダッシュボードで作成した URL
# VITE_POLAR_CHECKOUT_LINK_MONTHLY=https://polar.sh/checkout/...
# VITE_POLAR_CHECKOUT_LINK_YEARLY=https://polar.sh/checkout/...
```

**`.env.example` の更新:**

`src/.env.example` の LemonSqueezy セクションを Polar に差し替える。

### 4.2 バックエンド Secrets Manager

**現在の構成** (`terraform/modules/subscription/main.tf`):

```terraform
resource "aws_secretsmanager_secret" "lemonsqueezy" {
  name = "zedi-${var.environment}-lemonsqueezy"
  ...
}
# 格納値:
# {
#   "LEMONSQUEEZY_API_KEY": "...",
#   "LEMONSQUEEZY_WEBHOOK_SECRET": "...",
#   "LEMONSQUEEZY_STORE_ID": "..."
# }
```

**移行後**: 新しい Secret を作成する（or 既存を rename）。

```terraform
resource "aws_secretsmanager_secret" "polar" {
  name = "zedi-${var.environment}-polar"
  ...
}
# 格納値:
# {
#   "POLAR_ACCESS_TOKEN": "polat_...",
#   "POLAR_WEBHOOK_SECRET": "whsec_..."
# }
```

> **POLAR_ACCESS_TOKEN**: Polar ダッシュボード > Settings > Access Tokens で発行。
> **POLAR_WEBHOOK_SECRET**: Polar ダッシュボード > Settings > Webhooks でエンドポイント作成時に設定/生成。

### 4.3 Secrets 取得ロジックの更新

**ファイル**: `terraform/modules/api/lambda/src/lib/secrets.ts`

現在の `getWebhookSecret()` は Secret JSON から `WEBHOOK_SECRET` キーを取得する。
Polar 移行後は `POLAR_WEBHOOK_SECRET` キーに変更する。

```typescript
// 変更前
_webhookCache = parsed.WEBHOOK_SECRET || res.SecretString;

// 変更後
_webhookCache = parsed.POLAR_WEBHOOK_SECRET || res.SecretString;
```

また、Checkout Session API を使う場合は `POLAR_ACCESS_TOKEN` を取得する関数も追加:

```typescript
interface PolarSecrets {
  POLAR_ACCESS_TOKEN: string;
  POLAR_WEBHOOK_SECRET: string;
}

let _polarCache: PolarSecrets | null = null;
let _polarCacheAt = 0;

export async function getPolarSecrets(secretArn: string): Promise<PolarSecrets> {
  const now = Date.now();
  if (_polarCache && now - _polarCacheAt < CACHE_TTL) return _polarCache;
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!res.SecretString) throw new Error('Polar secret not found');
  _polarCache = JSON.parse(res.SecretString) as PolarSecrets;
  _polarCacheAt = now;
  return _polarCache;
}
```

---

## Step 5: Webhook ハンドラの書き換え

これが移行作業の**最も重要な部分**。

### 5.1 現在の実装（LemonSqueezy）

**ファイル**: `terraform/modules/api/lambda/src/routes/webhooks/lemonsqueezy.ts`

- HMAC-SHA256 による手動署名検証
- `X-Signature` ヘッダーを使用
- イベント: `subscription_created`, `subscription_updated`, `subscription_resumed`, `subscription_cancelled`, `subscription_expired`, `subscription_payment_failed`, `subscription_payment_success`
- `meta.custom_data.user_id` で Cognito ユーザーと紐付け
- `meta.custom_data.billing_interval` で月額/年額を判定

### 5.2 Polar の Webhook 仕様

- **署名方式**: Standard Webhooks 準拠（`@polar-sh/sdk/webhooks` の `validateEvent` で自動検証）
- **ヘッダー**: `webhook-id`, `webhook-timestamp`, `webhook-signature`（Standard Webhooks 標準）
- **ユーザー紐付け**: Checkout Session 作成時に `customerExternalId` に Cognito `userId` を渡す → Webhook ペイロードの `customer.external_id` から取得
- **イベント名の対応表**:

| LemonSqueezy イベント | Polar イベント | 備考 |
|---|---|---|
| `subscription_created` | `subscription.created` | |
| `subscription_updated` | `subscription.updated` | catch-all. active/canceled 等すべてを含む |
| `subscription_resumed` | `subscription.uncanceled` | キャンセル取り消し |
| `subscription_cancelled` | `subscription.canceled` | 期間終了時キャンセル予約 |
| `subscription_expired` | `subscription.revoked` | 最終的に無効化（billing 停止 + 特典剥奪） |
| `subscription_payment_failed` | `subscription.past_due` | 支払い失敗 |
| `subscription_payment_success` | `order.paid` | 支払い成功 |

### 5.3 新しい Webhook ハンドラの実装

**新規ファイル**: `terraform/modules/api/lambda/src/routes/webhooks/polar.ts`

```typescript
/**
 * POST /api/webhooks/polar — Polar Webhook
 *
 * Standard Webhooks 署名検証 + サブスクリプション状態更新
 * 認証: API GW JWT ではなく Webhook 署名
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { subscriptions, users } from '../../schema';
import type { AppEnv } from '../../types';
import { getWebhookSecret } from '../../lib/secrets';
import { getEnvConfig } from '../../env';

const app = new Hono<AppEnv>();

app.post('/', async (c) => {
  const env = getEnvConfig();

  // Secrets Manager から Webhook シークレットを取得
  const secretArn = env.POLAR_SECRET_ARN || env.WEBHOOK_SECRET;
  if (!secretArn) {
    throw new HTTPException(500, { message: 'Webhook secret not configured' });
  }
  const webhookSecret = await getWebhookSecret(secretArn);

  // Standard Webhooks 署名検証
  const rawBody = await c.req.text();
  let event: Record<string, unknown>;
  try {
    event = validateEvent(rawBody, Object.fromEntries(c.req.raw.headers), webhookSecret);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      throw new HTTPException(403, { message: 'Invalid webhook signature' });
    }
    throw error;
  }

  const eventType = event.type as string;
  const data = event.data as Record<string, unknown>;
  const db = c.get('db');

  // ── userId を解決 ──
  // Polar の customer.external_id に Cognito userId を格納している前提
  let userId: string | null = null;

  // subscription イベントの場合
  const customer = (data as { customer?: { externalId?: string } }).customer;
  if (customer?.externalId) {
    const userRow = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, customer.externalId))
      .limit(1);
    userId = userRow[0]?.id ?? null;
  }

  if (!userId) {
    console.error(`[polar-webhook] Cannot resolve userId for event ${eventType}`);
    return c.json({ received: true, warning: 'userId not resolved' });
  }

  // Polar の subscription ID
  const externalId = data.id ? String(data.id) : null;
  const externalCustomerId = customer?.externalId ?? null;

  // billing_interval を判定
  const recurringInterval = (data as { recurringInterval?: string }).recurringInterval;
  const billingInterval = recurringInterval === 'month' ? 'monthly'
    : recurringInterval === 'year' ? 'yearly'
    : null;

  // 期間情報
  const currentPeriodStart = (data as { currentPeriodStart?: string }).currentPeriodStart;
  const currentPeriodEnd = (data as { currentPeriodEnd?: string }).currentPeriodEnd;

  switch (eventType) {
    case 'subscription.created':
    case 'subscription.active':
    case 'subscription.uncanceled': {
      await db
        .insert(subscriptions)
        .values({
          userId,
          plan: 'pro',
          status: 'active',
          externalId,
          externalCustomerId,
          billingInterval,
          currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : null,
          currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            plan: 'pro',
            status: 'active',
            externalId,
            externalCustomerId,
            billingInterval,
            currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : undefined,
            currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
            updatedAt: new Date(),
          },
        });
      console.log(`[polar-webhook] ${eventType}: userId=${userId} → pro/active`);
      break;
    }

    case 'subscription.canceled': {
      await db
        .update(subscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
      console.log(`[polar-webhook] ${eventType}: userId=${userId} → canceled`);
      break;
    }

    case 'subscription.revoked': {
      await db
        .update(subscriptions)
        .set({ plan: 'free', status: 'canceled', updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
      console.log(`[polar-webhook] ${eventType}: userId=${userId} → free/canceled`);
      break;
    }

    case 'subscription.past_due': {
      // Polar 側では subscription.past_due イベントが発火
      // なお subscription.updated でも status が past_due になるケースあり
    }
    case 'subscription.updated': {
      // updated は catch-all — status フィールドで判定
      const status = (data as { status?: string }).status;
      if (status === 'past_due') {
        await db
          .update(subscriptions)
          .set({ status: 'past_due', updatedAt: new Date() })
          .where(eq(subscriptions.userId, userId));
        console.log(`[polar-webhook] ${eventType}: userId=${userId} → past_due`);
      }
      // active や canceled 等は個別イベントで処理済み
      break;
    }

    case 'order.paid': {
      // 更新の支払い成功 → 期間を更新
      // order.paid は billing_reason で判定可能
      // subscription_cycle の場合: サブスク更新
      console.log(`[polar-webhook] ${eventType}: order paid for userId=${userId}`);
      break;
    }

    default:
      console.log(`[polar-webhook] Unhandled event: ${eventType}`);
  }

  return c.json({ received: true });
});

export default app;
```

### 5.4 app.ts のルーティング変更

**ファイル**: `terraform/modules/api/lambda/src/app.ts`

```typescript
// 変更前
import webhookLemonRoutes from './routes/webhooks/lemonsqueezy';
// ...
app.route('/api/webhooks/lemonsqueezy', webhookLemonRoutes);

// 変更後
import webhookPolarRoutes from './routes/webhooks/polar';
// ...
app.route('/api/webhooks/polar', webhookPolarRoutes);
```

> **互換性のために旧ルートも残す**場合（移行期間中）:
> ```typescript
> app.route('/api/webhooks/polar', webhookPolarRoutes);
> app.route('/api/webhooks/lemonsqueezy', webhookLemonRoutes); // 旧: 移行完了後に削除
> ```

### 5.5 env.ts / types の更新

**`types/index.ts`** の `EnvConfig` インターフェースに追加:

```typescript
export interface EnvConfig {
  // ...既存...

  // Subscription webhook (Polar)
  WEBHOOK_SECRET: string;    // 互換性のため残す or POLAR_WEBHOOK_SECRET に rename
  POLAR_SECRET_ARN: string;  // 新規追加
}
```

**`env.ts`** にも対応する optional 変数を追加:

```typescript
POLAR_SECRET_ARN: optional('POLAR_SECRET_ARN'),
```

---

## Step 6: フロントエンド チェックアウトの書き換え

### 6.1 subscriptionService.ts の書き換え

**ファイル**: `src/lib/subscriptionService.ts`

**方式 A: Checkout Link（シンプル、推奨）**

Polar ダッシュボードで作成した Checkout Link に `customerExternalId` を付与してリダイレクト。

```typescript
/**
 * Subscription service — handles Polar checkout and subscription state
 */

export interface SubscriptionState {
  plan: "free" | "pro";
  status: string;
  billingInterval: "monthly" | "yearly" | null;
  currentPeriodEnd: string | null;
  usage: {
    consumedUnits: number;
    budgetUnits: number;
    usagePercent: number;
  };
}

const getAIAPIBaseUrl = () =>
  (import.meta.env.VITE_ZEDI_API_BASE_URL as string) ?? "";

export async function fetchSubscription(): Promise<SubscriptionState> {
  // ... 既存のまま変更なし ...
}

export type BillingInterval = "monthly" | "yearly";

/**
 * Open Polar checkout for the Pro plan.
 *
 * 方式A: バックエンド API で Checkout Session を作成し、返された URL にリダイレクト
 */
export async function openProCheckout(
  userId: string,
  billingInterval: BillingInterval
): Promise<void> {
  const apiBaseUrl = getAIAPIBaseUrl();

  const { getIdToken } = await import("@/lib/auth");
  const token = await getIdToken();

  const productId =
    billingInterval === "yearly"
      ? import.meta.env.VITE_POLAR_PRO_YEARLY_PRODUCT_ID
      : import.meta.env.VITE_POLAR_PRO_MONTHLY_PRODUCT_ID;

  if (!productId) {
    console.error("Polar product ID not configured");
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ productId, billingInterval }),
  });

  if (!response.ok) {
    console.error("Failed to create checkout session");
    return;
  }

  const { url } = (await response.json()) as { url: string };
  window.open(url, "_blank");
}

/**
 * Open the Polar customer portal for managing subscriptions.
 * バックエンド API 経由で Customer Portal URL を取得。
 */
export async function openCustomerPortal(): Promise<void> {
  const apiBaseUrl = getAIAPIBaseUrl();

  const { getIdToken } = await import("@/lib/auth");
  const token = await getIdToken();

  const response = await fetch(`${apiBaseUrl}/api/customer-portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    console.error("Failed to get customer portal URL");
    return;
  }

  const { url } = (await response.json()) as { url: string };
  window.open(url, "_blank");
}
```

**方式 B: Embedded Checkout（リッチ UX）**

```tsx
import { PolarEmbedCheckout } from '@polar-sh/checkout/embed';

export async function openProCheckoutEmbed(checkoutUrl: string): Promise<void> {
  const checkout = await PolarEmbedCheckout.create(checkoutUrl, {
    theme: 'light',
  });

  checkout.addEventListener('success', () => {
    // サブスクリプション状態を再取得
    window.location.reload();
  });
}
```

### 6.2 バックエンド: Checkout Session API

**新規ファイル**: `terraform/modules/api/lambda/src/routes/checkout.ts`

```typescript
/**
 * POST /api/checkout — Polar Checkout Session 作成
 */
import { Hono } from 'hono';
import { Polar } from '@polar-sh/sdk';
import type { AppEnv } from '../types';
import { getPolarSecrets } from '../lib/secrets';
import { getEnvConfig } from '../env';

const app = new Hono<AppEnv>();

app.post('/', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const { productId } = await c.req.json<{ productId: string }>();
  if (!productId) return c.json({ error: 'productId is required' }, 400);

  const env = getEnvConfig();
  const secrets = await getPolarSecrets(env.POLAR_SECRET_ARN);

  const polar = new Polar({
    accessToken: secrets.POLAR_ACCESS_TOKEN,
    server: env.ENVIRONMENT === 'prod' ? 'production' : 'sandbox',
  });

  const checkout = await polar.checkouts.create({
    products: [productId],
    customerExternalId: userId,    // Cognito userId で紐付け
    successUrl: `${env.CORS_ORIGIN}/pricing?checkout=success`,
  });

  return c.json({ url: checkout.url });
});

export default app;
```

### 6.3 Pricing.tsx の変更点

`src/pages/Pricing.tsx` は大きな変更不要。
`openProCheckout` の呼び出しが `async` になるため `await` を追加:

```typescript
// 変更前
const handleSelectPro = () => {
  if (!userId) return;
  openProCheckout(userId, billingInterval);
  setTimeout(() => refetch(), 2000);
};

// 変更後
const handleSelectPro = async () => {
  if (!userId) return;
  await openProCheckout(userId, billingInterval);
  setTimeout(() => refetch(), 5000);
};
```

---

## Step 7: Terraform インフラ変更

### 7.1 Subscription モジュール

**ファイル**: `terraform/modules/subscription/main.tf`

```terraform
# 変更前
resource "aws_secretsmanager_secret" "lemonsqueezy" {
  name = "zedi-${var.environment}-lemonsqueezy"
  description = "LemonSqueezy API key and webhook secret"
  ...
}

# 変更後 (新しい Secret を追加)
resource "aws_secretsmanager_secret" "polar" {
  name                    = "zedi-${var.environment}-polar"
  description             = "Polar access token and webhook secret"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "polar" {
  secret_id = aws_secretsmanager_secret.polar.id
  secret_string = jsonencode({
    POLAR_ACCESS_TOKEN     = ""
    POLAR_WEBHOOK_SECRET   = ""
  })
  lifecycle { ignore_changes = [secret_string] }
}
```

**ファイル**: `terraform/modules/subscription/outputs.tf`

```terraform
# 変更前
output "lemonsqueezy_secret_arn" {
  description = "ARN of the LemonSqueezy secrets"
  value       = aws_secretsmanager_secret.lemonsqueezy.arn
}

# 追加
output "polar_secret_arn" {
  description = "ARN of the Polar secrets"
  value       = aws_secretsmanager_secret.polar.arn
}
```

### 7.2 API モジュール

**`terraform/modules/api/variables.tf`** に変数追加:

```terraform
variable "polar_secret_arn" {
  description = "ARN of Polar secret (from subscription module)"
  type        = string
  default     = ""
}
```

**`terraform/modules/api/main.tf`** の Lambda 環境変数・IAM を更新:

```terraform
# IAM Resource に追加
Resource = compact([
  var.db_credentials_secret_arn,
  var.ai_secrets_arn,
  var.thumbnail_secrets_arn,
  var.polar_secret_arn,          # ← lemonsqueezy_secret_arn から差し替え
])

# Lambda 環境変数
environment {
  variables = {
    # ...既存...
    POLAR_SECRET_ARN = var.polar_secret_arn   # ← LEMONSQUEEZY_SECRET_ARN から差し替え
  }
}
```

**API Gateway ルート追加**:

```terraform
# 変更前
resource "aws_apigatewayv2_route" "webhook_lemonsqueezy" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /api/webhooks/lemonsqueezy"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# 変更後
resource "aws_apigatewayv2_route" "webhook_polar" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /api/webhooks/polar"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Checkout API（認証あり: JWT authorizer 経由 or Lambda 内認証）
resource "aws_apigatewayv2_route" "checkout" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /api/checkout"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}
```

### 7.3 main.tf（ルート Terraform）

**ファイル**: `terraform/main.tf`

```terraform
# 変更前
lemonsqueezy_secret_arn = module.subscription.lemonsqueezy_secret_arn

# 変更後
polar_secret_arn = module.subscription.polar_secret_arn
```

---

## Step 8: テスト（Sandbox 環境）

### 8.1 Polar Sandbox 環境

Polar には本番とは別の **Sandbox 環境** があり、実際の課金なしでテスト可能。

1. [sandbox.polar.sh](https://sandbox.polar.sh) で同じ組織名のテスト環境を作成
2. Sandbox 用の Access Token と Webhook Secret を発行
3. Sandbox 用の商品（Pro Monthly / Pro Yearly）を作成
4. SDK 初期化時に `server: 'sandbox'` を指定

### 8.2 ローカル開発時の Webhook テスト

Polar の Webhook をローカルで受け取るには [ngrok](https://ngrok.com/) を使用:

```bash
ngrok http 3000
# → https://xxxx.ngrok-free.app を Polar ダッシュボードの Webhook URL に設定
```

### 8.3 テスト観点

| テストケース | 確認ポイント |
|---|---|
| Checkout → 購入完了 | `subscription.created` で DB に `pro/active` が UPSERT される |
| サブスク更新（月次） | `subscription.updated` + `order.paid` で期間が更新される |
| キャンセル（期間終了時） | `subscription.canceled` で DB が `canceled` に、期間終了後 `subscription.revoked` で `free/canceled` に |
| 即時キャンセル | `subscription.canceled` + `subscription.revoked` が連続して到着 |
| 支払い失敗 | `subscription.past_due` で DB が `past_due` に |
| カスタマーポータル | ポータル URL が正しく生成・遷移できる |
| userId 紐付け | `customer.external_id` で正しく Cognito ユーザーに紐付く |

### 8.4 既存テストの更新

**ファイル**: `terraform/modules/api/lambda/src/__tests__/app.test.ts`

`POST /api/webhooks/lemonsqueezy` のテストを `POST /api/webhooks/polar` に変更。
ペイロード形式と署名検証方法も Standard Webhooks 準拠に更新する。

---

## Step 9: 本番デプロイ

### 9.1 デプロイ手順

1. **Secrets Manager に値を設定**
   ```bash
   aws secretsmanager update-secret \
     --secret-id zedi-prod-polar \
     --secret-string '{"POLAR_ACCESS_TOKEN":"polat_xxx","POLAR_WEBHOOK_SECRET":"whsec_xxx"}'
   ```

2. **Terraform apply**
   ```bash
   cd terraform
   terraform plan -out=tfplan-polar-migration
   terraform apply tfplan-polar-migration
   ```

3. **Lambda ビルド＆デプロイ**
   ```bash
   cd terraform/modules/api/lambda
   npm run build
   cd ../../../
   terraform apply
   ```

4. **Polar ダッシュボードで Webhook 設定**
   - URL: `https://<API Gateway ドメイン>/api/webhooks/polar`
   - Format: Raw
   - Secret: 上記で設定した `POLAR_WEBHOOK_SECRET`
   - Events: `subscription.created`, `subscription.updated`, `subscription.active`, `subscription.canceled`, `subscription.revoked`, `subscription.past_due`, `order.paid`

5. **フロントエンドデプロイ**
   - 環境変数を Polar 用に差し替え
   - ビルド＆デプロイ

### 9.2 ロールバック計画

- 旧 LemonSqueezy の Webhook ルートとシークレットは移行完了まで削除しない
- 問題発生時は CORS_ORIGIN の切り替えなしでフロントエンド環境変数を戻すだけで LemonSqueezy に復帰可能

---

## 付録: 変更対象ファイル一覧

### 新規作成

| ファイル | 内容 |
|---|---|
| `terraform/modules/api/lambda/src/routes/webhooks/polar.ts` | Polar Webhook ハンドラ |
| `terraform/modules/api/lambda/src/routes/checkout.ts` | Checkout Session API (オプション) |

### 変更

| ファイル | 変更内容 |
|---|---|
| `terraform/modules/api/lambda/package.json` | `@polar-sh/sdk` 依存追加 |
| `terraform/modules/api/lambda/src/app.ts` | ルーティング変更 (`/webhooks/polar`) |
| `terraform/modules/api/lambda/src/env.ts` | `POLAR_SECRET_ARN` 追加 |
| `terraform/modules/api/lambda/src/types/index.ts` | `EnvConfig` に `POLAR_SECRET_ARN` 追加 |
| `terraform/modules/api/lambda/src/lib/secrets.ts` | `getPolarSecrets()` 追加、webhook secret キー名変更 |
| `src/lib/subscriptionService.ts` | Polar Checkout API に全面書き換え |
| `src/pages/Pricing.tsx` | `handleSelectPro` を `async` に変更 |
| `.env.example` | LemonSqueezy → Polar 環境変数差し替え |
| `terraform/modules/subscription/main.tf` | Polar 用 Secret 追加 |
| `terraform/modules/subscription/outputs.tf` | `polar_secret_arn` output 追加 |
| `terraform/modules/subscription/variables.tf` | 変更なし（`environment`, `tags` は共通） |
| `terraform/modules/api/variables.tf` | `polar_secret_arn` 変数追加 |
| `terraform/modules/api/main.tf` | IAM / Lambda 環境変数 / API GW ルート更新 |
| `terraform/main.tf` | `polar_secret_arn` の受け渡し |
| `terraform/modules/api/lambda/src/__tests__/app.test.ts` | テストのパス・ペイロード更新 |

### 削除予定（移行完了後）

| ファイル | 備考 |
|---|---|
| `terraform/modules/api/lambda/src/routes/webhooks/lemonsqueezy.ts` | 旧 Webhook ハンドラ |
| `terraform/modules/subscription/main.tf` 内の `lemonsqueezy` リソース | 旧 Secrets |

### DB スキーマ

変更不要。既存の `subscriptions` テーブルの `external_id` / `external_customer_id` カラムに Polar の ID を格納する。
