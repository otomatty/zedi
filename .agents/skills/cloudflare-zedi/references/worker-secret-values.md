# Worker secrets の値の取得方法 / How to obtain each Worker secret

`server/api/.env.worker.dev`（および `.env.worker.production`）を埋めるときの、
**各値をどこから取るか**の実務ガイド。何のための値か・ライフサイクルは
[secrets-template.md](secrets-template.md) を、鍵名の一覧は
`server/api/.env.worker.dev.example` を正とする。

> 大原則: ほとんどの値は **Railway で現在稼働中の api サービスの Variables から
> そのままコピー**する（本番と同じ値で dev Worker を動かす）。新規に発行するのは
> R2 アクセスキーと（必要なら）Sentry DSN くらい。
>
> 取得元:
>
> - **Railway**: dashboard → プロジェクト → `api` サービス → **Variables** タブ。
>   値は目のアイコンで表示、またはコピー。CLI なら `railway variables`（要ログイン）。
> - 秘密値は **Issue / PR / チャットに貼らない**。`.env.worker.dev`（gitignore 済み）にだけ書く。

---

## 必須 / Required at boot（未設定だと `wrangler deploy` が失敗する）

### BETTER_AUTH_SECRET

- **取得**: Railway `api` の `BETTER_AUTH_SECRET` をそのままコピー。
- ⚠️ API / MCP / hocuspocus と**必ず同一値**（署名鍵の共有）。新規生成しない。

### BETTER_AUTH_URL

- **取得**: dev Worker の公開 URL。
  - workers.dev を使う場合: `https://zedi-api-dev.<アカウントのサブドメイン>.workers.dev`
    - サブドメインは Cloudflare dashboard → **Workers & Pages** → `zedi-api-dev` を開くと
      表示される URL、または **Workers & Pages → 右側の `<xxx>.workers.dev` サブドメイン**で確認。
  - custom domain（`api-dev.zedi-note.app` 等）を後で使う場合はそれを設定。
- ⚠️ 認証フローの dev 検証は #1090（D1）後なので、起動時に URL としてパースできれば
  暫定値で可。ただし OAuth コールバック base になるため、OAuth を実際に試すときは
  この URL を Google/GitHub の redirect URI にも登録する。

### CORS_ORIGIN

- **取得**: Railway `api` の `CORS_ORIGIN` をコピー（フロント/admin のオリジン、カンマ区切り）。
- dev フロントを Pages で見る場合の例: `https://zedi-dev.pages.dev,https://zedi-admin-dev.pages.dev`
- Chrome 拡張を使うなら `chrome-extension://<id>` も含める（`chrome://extensions` で ID 確認）。

### GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

- **取得（推奨）**: Railway `api` の同名変数をコピー。
- **元の発行元**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  → APIs & Services → **Credentials** → OAuth 2.0 Client IDs → 該当クライアント。
  Secret は「Reset」しない限り再表示可（クライアント作成時のもの）。
- OAuth を dev Worker URL で試すなら、同画面の **Authorized redirect URIs** に
  `<BETTER_AUTH_URL>/api/auth/callback/google` を追加。

### GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET

- **取得（推奨）**: Railway `api` の同名変数をコピー。
- **元の発行元**: GitHub → Settings → **Developer settings** → **OAuth Apps** →
  該当アプリ。Client secret は再表示不可なので、無ければ「Generate a new client secret」。
- dev Worker URL で試すなら **Authorization callback URL** に
  `<BETTER_AUTH_URL>/api/auth/callback/github` を追加。

### DATABASE_URL

- **取得**: #1090（D1 移行）まで **到達しないプレースホルダで可**。
  例ファイルの `postgresql://placeholder:unused@127.0.0.1:5432/unused` のままで良い。
- 理由: auth.ts がモジュールロード時に pg.Pool を構築するため起動時に必須だが、
  実接続は DB 依存ルートを叩くまで発生しない（遅延接続）。dev の DB 依存経路の
  検証は #1090 後。
- （もし dev で実 DB に繋ぎたい場合のみ）Railway Postgres の接続文字列をコピー。

---

## 任意 / Optional（未設定なら no-op、またはその機能だけ無効）

### SENTRY_DSN_API

- **取得**: [Sentry](https://sentry.io) → 対象プロジェクト → Settings → **Client Keys (DSN)**。
  または Railway `api` の同名変数をコピー。
- 空のままなら Sentry 送信は no-op（起動には影響しない）。

### STORAGE_ENDPOINT / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY / STORAGE_BUCKET_NAME

- presigned URL 生成にのみ必要（R2 の読み書きは `STORAGE_BUCKET` binding が処理）。
- **STORAGE_ENDPOINT**: `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`
  （アカウント ID = `175c04a4465bcc9815b21176a852f0c0`）。
- **STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY**: R2 の S3 互換キー。
  - 今回 `zedi-migration` トークン作成時に発行された **アクセスキー ID / シークレット
    アクセスキー**をそのまま使える（`.env` の `CLOUDFLARE_R2_ACCESS_KEY_ID` /
    `CLOUDFLARE_R2_SECRET_ACCESS_KEY`）。
  - もしくは Cloudflare dashboard → **R2 → Manage R2 API Tokens** で専用トークンを発行
    （MCP では発行不可）。Railway で稼働中の `STORAGE_*` は別トークン由来なので touch しない。
- **STORAGE_BUCKET_NAME**: dev は `zedi-storage-dev`（例ファイル既定）。

### RESEND_API_KEY / RESEND_FROM_EMAIL

- **取得**: [Resend](https://resend.com/api-keys) の API キー、または Railway からコピー。
- 未設定なら招待メール等のメール送信が無効になるだけ（起動には影響しない）。

### MCP_REDIRECT_URI_ALLOW / MCP_JWT_EXP_DAYS

- 外部 MCP クライアント連携を dev で使う場合のみ。Railway `api` からコピー。
- 未設定だと `/api/mcp/authorize-code` が全 redirect を拒否する（MCP 機能のみ無効）。

### OPENROUTER_API_KEY / YOUTUBE_DATA_API_KEY

- それぞれ AI モデル料金 sync / YouTube クリップ用の任意キー。Railway からコピー。

---

## 投入と確認 / Put & verify

```bash
cd server/api
bun run worker:secrets:put -- --env dev --dry-run   # 埋めた項目の確認（空値はスキップされる）
bun run worker:secrets:put -- --env dev             # 一括投入
bunx wrangler secret list --env dev                 # Worker 側に載った secret 名の確認
```

- ⚠️ `worker:secrets:put` は **空値をスキップ**する。必須 8 項目に実値が入っていないと
  アップロードされず、deploy が `... must be set` で失敗する。`--dry-run` で 8 項目
  （最低でも `DATABASE_URL` プレースホルダ含む）が出ることを確認する。
- ⚠️ **順序**: secrets 投入 → その後 `wrangler deploy`（deploy 時の起動検証で必須値を読む）。
- 投入後、CI の `deploy-api-worker-dev.yml` を再実行するか develop への push で dev デプロイ。

---

## 関連 / Related

- [secrets-template.md](secrets-template.md) — 全 secret のライフサイクル台帳
- [token-scopes.md](token-scopes.md) — API トークンのスコープと作成手順
- `server/api/.env.worker.dev.example` — 鍵名と必須/任意の区別
