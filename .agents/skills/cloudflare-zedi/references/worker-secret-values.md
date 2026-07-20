# Worker secrets の値の取得方法 / How to obtain each Worker secret

`server/api/.env.worker.dev`（および `.env.worker.production`）を埋めるときの、
**各値をどこから取る/どう作るか**の実務ガイド。何のための値か・ライフサイクルは
[secrets-template.md](secrets-template.md) を、鍵名の一覧は
`server/api/.env.worker.dev.example` を正とする。

> このガイドは **dev Worker を新規セットアップする**前提（Railway からのコピーではなく
> dev 用の値を新たに用意する）。秘密値は **Issue / PR / チャットに貼らない**。
> `.env.worker.dev`（gitignore 済み）にだけ書く。

## まず deploy を通す最小構成 / Minimum to unblock deploy

`wrangler deploy` の起動検証は必須 8 項目が **非空である**ことだけを見る（値の正しさは
検証しない）。認証フロー・DB 到達の dev 検証は #1090（D1）後なので、**いま deploy を
通すだけなら**次の割り切りが可能:

| 項目                      | 最小構成での値                                                   |
| ------------------------- | ---------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`      | **新規生成した実値**（署名に使うので本物が必要）                 |
| `BETTER_AUTH_URL`         | `https://zedi-api-dev.otomatty.workers.dev`（実 URL）            |
| `CORS_ORIGIN`             | 実オリジン（CORS を正しく動かすなら本物、boot だけなら仮でも可） |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth を試すまでは仮文字列で可（例 `placeholder`）               |
| `GITHUB_CLIENT_ID/SECRET` | 同上                                                             |
| `DATABASE_URL`            | プレースホルダのまま（例ファイル既定）                           |

OAuth プロバイダの実値は sign-in を実際に試すとき（#1090 後）に差し替える。

---

## 必須 / Required at boot（未設定だと `wrangler deploy` が失敗する）

### BETTER_AUTH_SECRET

- **新規生成**（元の値は失われているため作り直す）:
  ```bash
  openssl rand -base64 32   # 44 文字。Better Auth の最低 32 文字要件を満たす
  ```
- ⚠️ 同一環境で共有する他サービス（dev の MCP / hocuspocus Worker を将来立てる場合）とは
  **同一値**にすること。dev Worker 単体で動かす今は独立でよいが、生成した値は控えておく。
- Railway 本番の secret とは別物（別環境）。本番切替時に本番用を別途決める。

### BETTER_AUTH_URL

- **値**: `https://zedi-api-dev.otomatty.workers.dev`（workers.dev サブドメイン = `otomatty`）。
  - サブドメインが未設定なら Cloudflare dashboard → **Workers & Pages** → 右側
    **サブドメイン**で `otomatty` を設定（アカウントに 1 つ）。
  - custom domain（`api-dev.zedi-note.app` 等）を後で使う場合はそちらに差し替え。
- ⚠️ OAuth コールバック base になるため、OAuth を実際に試すときはこの URL を
  Google/GitHub の redirect URI にも登録する（下記）。

### CORS_ORIGIN

- **値**: dev で API を叩くフロント/admin のオリジンをカンマ区切りで新規指定。
  - 例: `https://zedi-dev.pages.dev,https://zedi-admin-dev.pages.dev`
  - ローカルから叩くなら `http://localhost:5173,http://localhost:30001` を足す。
- Chrome 拡張を使うなら `chrome-extension://<id>`（`chrome://extensions` で ID 確認）。

### GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

- OAuth sign-in を dev で試すときに必要。それまでは仮文字列で boot を通せる。
- **新規作成/取得**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  → APIs & Services → **Credentials** → **Create Credentials → OAuth client ID**
  （Web application）。または既存クライアントの ID / Secret を使う。
- **Authorized redirect URIs** に `<BETTER_AUTH_URL>/api/auth/callback/google` を追加。

### GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET

- OAuth sign-in を dev で試すときに必要。それまでは仮文字列で boot を通せる。
- **新規作成/取得**: GitHub → Settings → **Developer settings** → **OAuth Apps** →
  **New OAuth App**（または既存アプリ）。Client secret は「Generate a new client secret」。
- **Authorization callback URL** に `<BETTER_AUTH_URL>/api/auth/callback/github` を設定。

### DATABASE_URL

- **プレースホルダのままで可**（例ファイル既定
  `postgresql://placeholder:unused@127.0.0.1:5432/unused`）。
- 理由: auth.ts がモジュールロード時に pg.Pool を構築するため起動時に必須だが、実接続は
  DB 依存ルートを叩くまで発生しない（遅延接続）。dev の DB 依存経路の検証は #1090 後。

---

## 任意 / Optional（未設定なら no-op、またはその機能だけ無効）

### SENTRY_DSN_API

- **新規取得**: [Sentry](https://sentry.io) → 対象プロジェクト → Settings →
  **Client Keys (DSN)**。空のままなら Sentry 送信は no-op（起動に影響しない）。

### STORAGE_ENDPOINT / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY / STORAGE_BUCKET_NAME

- presigned URL 生成にのみ必要（R2 の読み書きは `STORAGE_BUCKET` binding が処理）。
- **STORAGE_ENDPOINT**: `https://175c04a4465bcc9815b21176a852f0c0.r2.cloudflarestorage.com`。
- **STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY**: R2 の S3 互換キー。
  - `zedi-migration` トークン作成時に発行された **アクセスキー ID / シークレット
    アクセスキー**を使える（`.env` の `CLOUDFLARE_R2_ACCESS_KEY_ID` /
    `CLOUDFLARE_R2_SECRET_ACCESS_KEY`）。
  - もしくは Cloudflare dashboard → **R2 → Manage R2 API Tokens** で専用トークンを新規発行。
- **STORAGE_BUCKET_NAME**: dev は `zedi-storage-dev`（例ファイル既定）。

### RESEND_API_KEY / RESEND_FROM_EMAIL

- **新規取得**: [Resend](https://resend.com/api-keys)。未設定ならメール送信が無効になるだけ。

### MCP_REDIRECT_URI_ALLOW / MCP_JWT_EXP_DAYS

- 外部 MCP 連携を dev で使う場合のみ。未設定だと `/api/mcp/authorize-code` が全 redirect を
  拒否する（MCP 機能のみ無効）。例: `http://127.0.0.1:,https://zedi-note.app`。

### OPENROUTER_API_KEY / YOUTUBE_DATA_API_KEY

- それぞれ AI モデル料金 sync / YouTube クリップ用の任意キー。使う機能があれば新規取得。

---

## 投入と確認 / Put & verify

```bash
cd server/api
bun run worker:secrets:put -- --env dev --dry-run   # 埋めた項目の確認（空値はスキップされる）
bun run worker:secrets:put -- --env dev             # 一括投入
bunx wrangler secret list --env dev                 # Worker 側に載った secret 名の確認
```

- ⚠️ `worker:secrets:put` は **空値をスキップ**する。必須 8 項目に値（プレースホルダ含む）が
  入っていないとアップロードされず、deploy が `... must be set` で失敗する。`--dry-run` で
  8 項目が出ることを確認する。
- ⚠️ **順序**: secrets 投入 → その後 `wrangler deploy`（deploy 時の起動検証で必須値を読む）。
- 投入後、CI の `deploy-api-worker-dev.yml` を再実行するか develop への push で dev デプロイ。

---

## 関連 / Related

- [secrets-template.md](secrets-template.md) — 全 secret のライフサイクル台帳
- [token-scopes.md](token-scopes.md) — API トークンのスコープと作成手順
- `server/api/.env.worker.dev.example` — 鍵名と必須/任意の区別
