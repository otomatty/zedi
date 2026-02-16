# .env.production 登録チェック一覧

`.env.production.example` および `.env.example` と照合した結果（実施日: 2026-02-16）。

## 必須（本番で設定済み）

| 変数 | .env.production | 備考 |
|------|-----------------|------|
| VITE_COGNITO_DOMAIN | ✅ | |
| VITE_COGNITO_CLIENT_ID | ✅ | |
| VITE_COGNITO_REDIRECT_URI | ✅ | |
| VITE_COGNITO_LOGOUT_REDIRECT_URI | ✅ | |
| VITE_ZEDI_API_BASE_URL | ✅ | AI API（HTTP）・サムネイル API も同一 URL で共通化済み。末尾 `/` はコード側で除去。 |
| VITE_AI_WS_URL | ✅ | AI ストリーミング用。Terraform: terraform output -raw ai_api_websocket_url |
| VITE_REALTIME_URL | ✅ | |
| PROD_FRONTEND_S3_BUCKET | ✅ | deploy:prod 用 |
| PROD_CLOUDFRONT_DISTRIBUTION_ID | ✅ | deploy:prod 用 |

## コード共通化（2026-02-16）

- **VITE_AI_API_BASE_URL / VITE_THUMBNAIL_API_BASE_URL** は使用廃止。AI（HTTP）・サムネイルはすべて **VITE_ZEDI_API_BASE_URL** を参照。

## 任意（VITE_LEMONSQUEEZY_* のみ）

| 変数 | .env.production | 備考 |
|------|-----------------|------|
| VITE_LEMONSQUEEZY_STORE_ID | ❌ | Pro プラン課金時のみ。 |
| VITE_LEMONSQUEEZY_AI_MONTHLY_PRODUCT_ID | ❌ | 同上。 |
| VITE_LEMONSQUEEZY_AI_YEARLY_PRODUCT_ID | ❌ | 同上。 |
| VITE_LEMONSQUEEZY_PORTAL_URL | ❌ | 顧客ポータル（任意）。 |

## .env.production にのみある項目

| 変数 | 備考 |
|------|------|
| VITE_CLERK_PUBLISHABLE_KEY | .env.production.example にはなし。Clerk 利用時はそのままで可。 |
| VITE_TURSO_DATABASE_URL / VITE_TURSO_AUTH_TOKEN | example では「AWS 移行済みなら未使用で可」。Aurora 移行後は削除してよい。 |

## 推奨アクション

1. **VITE_AI_WS_URL**  
   プレースホルダーの場合は `terraform output -raw ai_api_websocket_url` で取得した値に差し替える。

2. **LemonSqueezy で Pro 課金を行う場合**  
   `VITE_LEMONSQUEEZY_STORE_ID`、`VITE_LEMONSQUEEZY_AI_MONTHLY_PRODUCT_ID`（または YEARLY）を追加。

3. **Turso**  
   Aurora 完全移行済みなら本番では `VITE_TURSO_*` を削除してよい。
