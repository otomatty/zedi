# API トークンスコープ / API token scopes

移行作業で必要な Cloudflare API トークン権限。**移行専用トークンを 1 つ作成**し、
ローカル env と（必要なら）GitHub Environment secret に設定する。本番 Terraform 用トークンとは
分離する（Terraform は Phase 5 で廃止）。

_Create one dedicated migration token; keep it separate from the existing Terraform token._

## 必要権限 / Required permissions

| スコープ                            | レベル                 | 用途                                | 必要フェーズ    |
| ----------------------------------- | ---------------------- | ----------------------------------- | --------------- |
| Workers Scripts (Edit)              | Account                | Worker の deploy / versions         | Phase 2〜       |
| Workers R2 Storage (Edit)           | Account                | R2 バケット作成・操作               | Phase 1 (#1089) |
| Workers KV Storage (Edit)           | Account                | KV namespace 作成・操作             | Phase 2 (#1093) |
| D1 (Edit)                           | Account                | D1 作成・マイグレーション・クエリ   | Phase 4 (#1090) |
| Workers Tail / Observability (Read) | Account                | ログ・メトリクス確認                | デバッグ全般    |
| Cloudflare Pages (Edit)             | Account                | 既存 Pages deploy（移行完了まで）   | Phase 3 まで    |
| DNS (Edit)                          | Zone (`zedi-note.app`) | `custom_domain` による DNS 自動作成 | Phase 2〜3      |
| Workers Routes (Edit)               | Zone (`zedi-note.app`) | カスタムドメインのルート設定        | Phase 2〜3      |

## 確定事項 / Decided (2026-07-18, #1091)

- **種別**: アカウント API トークン（Account Owned Token）。ユーザートークンは使わない
  — CI 用資格情報を個人ユーザーに紐づけないため。必要権限は全て Account/Zone レベルで賄える。
- **トークン名**: `zedi-migration`
- **作成ページ**: Cloudflare ダッシュボード → 対象アカウント →
  **Manage Account → Account API Tokens**
  （`https://dash.cloudflare.com/<CLOUDFLARE_ACCOUNT_ID>/api-tokens`）。
  プロフィール配下の API Tokens は**ユーザートークン側**なので使わない。
- **Phase 2 時点の権限**（現行 CI が壊れない最小集合）:
  - Account / **Workers Scripts (Edit)** — `deploy-api-worker-dev.yml` / `deploy-mcp-worker-dev.yml`
  - Account / **Cloudflare Pages (Edit)** — ⚠️ GitHub Secret `CLOUDFLARE_API_TOKEN` は
    `deploy-dev.yml` / `deploy-prod.yml` の Pages デプロイと共用のため、これを外すと
    フロント/admin のデプロイが壊れる
  - Account / **Workers Tail (Read)** — `wrangler tail` での dev 検証
  - Account / **Workers R2 Storage (Edit)** — バケット管理（既存 #1089 分の運用）
- D1 / DNS / Workers Routes は該当フェーズ（#1090 / prod 切替）到達時にトークンを
  **Roll ではなく編集**で拡張する（Account API Tokens は権限の追記が可能）。

## 設定手順 / Setup steps

1. 上記ページで `zedi-migration` を作成（TTL は無期限 or 1 年。Client IP 制限は CI ランナー
   が可変 IP のため付けない）。
2. GitHub Secrets を差し替え:
   `gh secret set CLOUDFLARE_API_TOKEN --repo otomatty/zedi`（値をペースト）。
   `CLOUDFLARE_ACCOUNT_ID` がアカウント ID と一致しているかも確認。
3. 検証: `gh workflow run deploy-api-worker-dev.yml --ref develop` → run が green になること。
   併せて `deploy-dev.yml`（Pages 側）が次の develop push で green のままであること。
4. ローカルは wrangler の OAuth ログインで足りている場合、トークン設定は不要。
   必要になったら `.env.local`（gitignore）へ。

## 注意 / Notes

- トークンは最小権限から始め、フェーズ進行に合わせて拡張する。
- ローカルでは `.env.local`（gitignore）に置く。リポジトリにはコミットしない。
- `wrangler whoami` で有効性とアカウント ID を確認できる。
- 既存 `TF_API_TOKEN`（Terraform Cloud 用）は Phase 5 で GitHub Secrets から削除する。
