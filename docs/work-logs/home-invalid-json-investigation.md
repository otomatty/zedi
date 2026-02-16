# /home アクセス時の「Invalid JSON response (HTTP 200)」エラー調査報告

## 現象

本番環境で `/home` にアクセスすると以下が発生する。

- コンソール: `[Sync/API] Failed (attempt 1/3): ApiError: Invalid JSON response (HTTP 200): <!doctype html>...`
- ページデータが一切表示されない

## 結論（原因）

**本番ビルド時に `VITE_ZEDI_API_BASE_URL` が未設定または空のままビルドされているため、API リクエストがフロントのオリジン（CloudFront の URL）に送られ、HTML（index.html）が返却されている。**

- クライアントは **API Gateway の URL** に `/api/sync/pages` 等を叩く必要がある。
- `VITE_ZEDI_API_BASE_URL` が空の場合、`apiClient` は `window.location.origin`（＝本番では CloudFront のドメイン）を使う。
- CloudFront は S3 のみをオリジンとしており、`/api/*` 用の別オリジン（API Gateway）へのルーティングはしていない。
- そのため `GET https://<frontend-domain>/api/sync/pages` は S3 に渡り、キーが無いので 403 → CloudFront の custom_error_response で **200 + /index.html** が返る。
- クライアントは JSON を期待しているのに HTML が返るため、`JSON.parse` が失敗し `Invalid JSON response (HTTP 200)` となる。

## 実装の流れ（該当箇所）

### 1. API のベース URL

| ファイル | 内容 |
|----------|------|
| `src/lib/api/apiClient.ts` | `getDefaultBaseUrl()` は `import.meta.env.VITE_ZEDI_API_BASE_URL ?? ""`。空のときは `request()` 内で `window.location.origin` を使用（57行目付近）。 |
| `src/lib/sync/syncWithApi.ts` | `api.getSyncPages(since)` → `apiClient` の `GET /api/sync/pages` を呼ぶ。 |
| `src/hooks/usePageQueries.ts` | 認証済みユーザーで初期同期時に `runAuroraSync()` → `syncWithApi()` → `api.getSyncPages()`。 |

### 2. エラーが発生する箇所

- `apiClient.ts` の `request()`:
  - `res.text()` を取得後 `JSON.parse(text)` を実行（84–96行目）。
  - パースに失敗すると `ApiError('Invalid JSON response (HTTP ${res.status}): ${snippet}')` をスロー。
- このエラーが `syncWithApi.ts` で catch され、`[Sync/API] Failed (attempt n/3):` としてログ出力され、`usePageQueries.ts` で「Sync failed」として扱われる。

### 3. 本番アーキテクチャ

- **フロント**: CloudFront → S3（`terraform/modules/cdn/main.tf`）。オリジンは S3 のみ。403/404 時は `response_page_path = "/index.html"` で 200 を返す（SPA 用）。
- **API**: Lambda + API Gateway。別 URL（例: `https://xxxx.execute-api.ap-northeast-1.amazonaws.com`）。Terraform: `terraform output api_invoke_url`。
- フロントと API は **別ドメイン** 想定。フロントから API を叩くには、ビルド時に **API のベース URL** を `VITE_ZEDI_API_BASE_URL` に埋め込む必要がある。

### 4. 本番ビルドと環境変数

- `bun run deploy:prod` → `scripts/deploy/deploy-to-aws.ts` が `.env.production` を読み、`bun run build` を実行。
- Vite の production ビルドでは `mode === 'production'` のため `.env.production` が読み込まれるが、**ビルド時に `VITE_ZEDI_API_BASE_URL` が存在しなければ** クライアントには空のまま埋め込まれる。
- `.env.production.example` には  
  `VITE_ZEDI_API_BASE_URL=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com`  
  とあり、本番用には `terraform output -raw api_invoke_url` で取得した URL を設定する想定。

## 推奨対応

1. **本番用に `VITE_ZEDI_API_BASE_URL` を必ず設定する**
   - `.env.production` に以下を設定（プレースホルダーではなく実際の API Gateway URL に置き換える）:
     ```bash
     VITE_ZEDI_API_BASE_URL=https://<api-gateway-id>.execute-api.ap-northeast-1.amazonaws.com
     ```
   - URL は `terraform output -raw api_invoke_url` で取得。
   - 末尾の `/` は付けない（`apiClient` 側で `replace(/\/$/, "")` しているため付けてよいが、example に合わせて付けない運用でよい）。

2. **デプロイ前に設定確認**
   - デプロイ前に `.env.production` に `VITE_ZEDI_API_BASE_URL` が設定されているか確認する。
   - 必要なら `deploy-to-aws.ts` でビルド前に `VITE_ZEDI_API_BASE_URL` が空でないことをチェックし、空ならエラー終了するようにすると安全。

3. **再デプロイ**
   - 上記を設定したうえで `bun run deploy:prod` で再ビルド・再デプロイする。  
   - ビルド時に正しい API URL が埋め込まれたクライアントが配信されれば、`/home` の Sync/API は API Gateway を叩くようになり、Invalid JSON は解消される。

## 補足

- **開発環境**: `VITE_ZEDI_API_BASE_URL` が空でも、Vite の proxy（`vite.config.ts` の `ZEDI_API_PROXY_TARGET`）で `/api` を API に転送しているため、同一オリジンで動く。
- **本番**: プロキシは無いため、クライアントが「API のベース URL」を正しく持っている必要がある。現状はそれが空のため、フロントのオリジンにリクエストが行き、HTML が返ってきている状態。
