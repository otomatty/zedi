# Polar アクセストークン & Webhook シークレット 取得ガイド

**作成日:** 2026-02-28
**対象:** Zedi の課金機能（Pro プランのチェックアウト・サブスクリプション管理）に必要な Polar の認証情報を取得する

---

## 概要

Zedi は [Polar](https://polar.sh/) を決済プラットフォームとして使用している。API サーバーが Polar と通信するために以下の 2 つの値が必要。

| 環境変数               | 用途                                                                     | 設定先               |
| ---------------------- | ------------------------------------------------------------------------ | -------------------- |
| `POLAR_ACCESS_TOKEN`   | Polar SDK でチェックアウトやカスタマーポータルを作成する際の認証トークン | Railway API サービス |
| `POLAR_WEBHOOK_SECRET` | Polar から送信される Webhook の署名を検証するためのシークレット          | Railway API サービス |

さらに、フロントエンドには以下の値が必要。

| 環境変数                            | 用途                              | 設定先                    |
| ----------------------------------- | --------------------------------- | ------------------------- |
| `VITE_POLAR_PRO_MONTHLY_PRODUCT_ID` | Pro プラン（月額）のプロダクト ID | `.env` / Cloudflare Pages |
| `VITE_POLAR_PRO_YEARLY_PRODUCT_ID`  | Pro プラン（年額）のプロダクト ID | `.env` / Cloudflare Pages |

---

## Sandbox と Production の違い

Zedi のコードは環境に応じて Polar のサーバーを切り替える:

```typescript
const polar = new Polar({
  accessToken: getEnv("POLAR_ACCESS_TOKEN"),
  server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
});
```

| 環境        | Polar サーバー | ダッシュボード URL                                     |
| ----------- | -------------- | ------------------------------------------------------ |
| development | **Sandbox**    | [https://sandbox.polar.sh/](https://sandbox.polar.sh/) |
| production  | **Production** | [https://polar.sh/](https://polar.sh/)                 |

> **Sandbox** はテスト用環境で、実際の決済は発生しない。development 環境ではまず Sandbox で動作確認し、production 環境では Production の値を使用する。

---

## Step 1: Polar アカウントの準備

### Sandbox（development 用）

1. [https://sandbox.polar.sh/](https://sandbox.polar.sh/) にアクセス
2. GitHub アカウントでログイン
3. Organization を作成（または既存のものを使用）

### Production（本番用）

1. [https://polar.sh/](https://polar.sh/) にアクセス
2. GitHub アカウントでログイン
3. Organization を作成（または既存のものを使用）

> Sandbox と Production は完全に独立した環境。それぞれ別のアクセストークン・Webhook シークレット・プロダクト ID が必要。

---

## Step 2: アクセストークンの取得

### 2.1 Sandbox の場合

1. [https://sandbox.polar.sh/](https://sandbox.polar.sh/) にログイン
2. 左サイドバーの下部にある **Settings**（歯車アイコン）をクリック
3. **「Access Tokens」** タブを開く（または直接 [https://sandbox.polar.sh/settings](https://sandbox.polar.sh/settings) にアクセス）
4. **「Create Token」** をクリック
5. 設定:

| 項目   | 値                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------- |
| Name   | `Zedi API (dev)`                                                                                  |
| Scopes | 全てチェック（または必要最小限: `checkouts:write`, `customers:write`, `customer-sessions:write`） |

1. **「Create」** をクリック
2. 表示されたトークンをコピー

> **重要:** トークンは作成時に一度だけ表示される。コピーし忘れた場合は削除して再作成する。

### 2.2 Production の場合

1. [https://polar.sh/](https://polar.sh/) にログイン
2. 同じ手順でトークンを作成（Name は `Zedi API (prod)` 等にする）

### 2.3 Railway に設定

```bash
# development
railway link -p Zedi -e development
railway variable set "POLAR_ACCESS_TOKEN=<コピーしたトークン>" --service api

# production（本番用トークン）
railway link -p Zedi -e production
railway variable set "POLAR_ACCESS_TOKEN=<コピーしたトークン>" --service api-prod
```

---

## Step 3: Webhook シークレットの取得

### 3.1 Webhook エンドポイントの作成

#### Sandbox の場合

1. [https://sandbox.polar.sh/](https://sandbox.polar.sh/) にログイン
2. 左サイドバーの **Settings** → **「Webhooks」** タブを開く
3. **「Add Endpoint」** をクリック
4. 設定:

| 項目   | 値                                                               |
| ------ | ---------------------------------------------------------------- |
| URL    | `https://api-development-b126.up.railway.app/api/webhooks/polar` |
| Format | `Raw`                                                            |

1. **Events** で以下を選択:

| イベント                  | 用途                                     |
| ------------------------- | ---------------------------------------- |
| `subscription.created`    | サブスクリプション作成時                 |
| `subscription.active`     | サブスクリプションがアクティブになった時 |
| `subscription.updated`    | サブスクリプション更新時                 |
| `subscription.canceled`   | サブスクリプションキャンセル時           |
| `subscription.uncanceled` | キャンセル取り消し時                     |
| `subscription.revoked`    | サブスクリプション取り消し時             |
| `subscription.past_due`   | 支払い遅延時                             |
| `order.paid`              | 注文支払い完了時                         |

> 全イベントを選択しても問題ない。Zedi のコードは未知のイベントを無視する。

1. **「Create」** をクリック

### 3.2 Webhook シークレットの確認

1. 作成した Webhook エンドポイントをクリック
2. **「Signing Secret」** の値をコピー

> シークレットは `whsec_` で始まる文字列。

#### Production の場合

1. [https://polar.sh/](https://polar.sh/) で同じ手順を実行
2. URL は `https://api.zedi-note.app/api/webhooks/polar` に設定

### 3.3 Railway に設定

```bash
# development
railway link -p Zedi -e development
railway variable set "POLAR_WEBHOOK_SECRET=<コピーしたシークレット>" --service api

# production
railway link -p Zedi -e production
railway variable set "POLAR_WEBHOOK_SECRET=<コピーしたシークレット>" --service api-prod
```

---

## Step 4: プロダクト ID の取得

フロントエンドでチェックアウトページに遷移する際に、プロダクト ID が必要。

### 4.1 プロダクトの作成（初回のみ）

既にプロダクトが作成済みの場合はスキップ。

#### Sandbox の場合

1. [https://sandbox.polar.sh/](https://sandbox.polar.sh/) にログイン
2. **「Products」** ページを開く
3. **「Create Product」** をクリック
4. 以下の 2 つのプロダクトを作成:

**Pro プラン（月額）:**

| 項目           | 値                                           |
| -------------- | -------------------------------------------- |
| Name           | `Zedi Pro (Monthly)`                         |
| Type           | `Subscription`                               |
| Price          | 任意（Sandbox なので実際の課金は発生しない） |
| Billing Period | `Monthly`                                    |

**Pro プラン（年額）:**

| 項目           | 値                  |
| -------------- | ------------------- |
| Name           | `Zedi Pro (Yearly)` |
| Type           | `Subscription`      |
| Price          | 任意                |
| Billing Period | `Yearly`            |

### 4.2 プロダクト ID の確認

1. 作成したプロダクトをクリック
2. URL に含まれる UUID がプロダクト ID（例: `https://sandbox.polar.sh/.../products/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）
3. または、プロダクト詳細ページに表示される ID をコピー

### 4.3 フロントエンドの `.env` に設定

```
VITE_POLAR_PRO_MONTHLY_PRODUCT_ID=<月額プロダクトのID>
VITE_POLAR_PRO_YEARLY_PRODUCT_ID=<年額プロダクトのID>
```

> Production 用のプロダクト ID は [https://polar.sh/](https://polar.sh/) で別途作成・確認する。

---

## 設定値の一覧

### development 環境

| 設定先                 | 変数                                | 取得元                                         |
| ---------------------- | ----------------------------------- | ---------------------------------------------- |
| Railway `api` サービス | `POLAR_ACCESS_TOKEN`                | Sandbox → Settings → Access Tokens             |
| Railway `api` サービス | `POLAR_WEBHOOK_SECRET`              | Sandbox → Settings → Webhooks → Signing Secret |
| ローカル `.env`        | `VITE_POLAR_PRO_MONTHLY_PRODUCT_ID` | Sandbox → Products → 月額プロダクトの ID       |
| ローカル `.env`        | `VITE_POLAR_PRO_YEARLY_PRODUCT_ID`  | Sandbox → Products → 年額プロダクトの ID       |

### production 環境

| 設定先                      | 変数                                | 取得元                                            |
| --------------------------- | ----------------------------------- | ------------------------------------------------- |
| Railway `api-prod` サービス | `POLAR_ACCESS_TOKEN`                | Production → Settings → Access Tokens             |
| Railway `api-prod` サービス | `POLAR_WEBHOOK_SECRET`              | Production → Settings → Webhooks → Signing Secret |
| Cloudflare Pages            | `VITE_POLAR_PRO_MONTHLY_PRODUCT_ID` | Production → Products → 月額プロダクトの ID       |
| Cloudflare Pages            | `VITE_POLAR_PRO_YEARLY_PRODUCT_ID`  | Production → Products → 年額プロダクトの ID       |

---

## トラブルシューティング

### Webhook が届かない

1. Polar Dashboard → Webhooks → 該当エンドポイント → **「Deliveries」** タブで送信履歴を確認
2. ステータスコードが `403` の場合、`POLAR_WEBHOOK_SECRET` が正しく設定されているか確認
3. ステータスコードが `500` の場合、Railway のログを確認:

```bash
railway logs --service api --lines 50 --filter "polar-webhook"
```

### チェックアウトが失敗する

1. `POLAR_ACCESS_TOKEN` が正しいか確認
2. Sandbox と Production のトークンを間違えていないか確認（development 環境は Sandbox のトークンを使用）
3. プロダクト ID がフロントエンドの `.env` に正しく設定されているか確認

### 「Invalid webhook signature」エラー

`POLAR_WEBHOOK_SECRET` の値が、Polar Dashboard の Webhook エンドポイントに表示される Signing Secret と一致しているか確認する。別の Webhook エンドポイントのシークレットを設定していないか注意。
