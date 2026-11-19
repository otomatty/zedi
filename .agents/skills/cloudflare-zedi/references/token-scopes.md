# API トークンスコープ / API token scopes

Zedi の Cloudflare 作業で使うアカウント API トークンの権限。ローカル env と GitHub Secret
`CLOUDFLARE_API_TOKEN` に同じトークンを設定する。

_One account API token, used locally and as the `CLOUDFLARE_API_TOKEN` GitHub secret._

## 必要権限 / Required permissions

| スコープ                            | レベル                 | 用途                                  | いつまで / until |
| ----------------------------------- | ---------------------- | ------------------------------------- | ---------------- |
| Workers Scripts (Edit)              | Account                | `app/` の deploy / versions / secrets | 継続             |
| D1 (Edit)                           | Account                | D1 作成・マイグレーション・クエリ     | 継続             |
| Workers Tail / Observability (Read) | Account                | ログ・メトリクス確認                  | 継続             |
| DNS (Edit)                          | Zone (`zedi-note.app`) | `custom_domain` による DNS 自動作成   | 継続             |
| Workers Routes (Edit)               | Zone (`zedi-note.app`) | カスタムドメインのルート設定          | 継続             |
| Workers R2 Storage (Edit)           | Account                | R2 バケット操作                       | R2 を使う間      |

KV など新しいバインディングを使うときは、その権限を足す。

## 確定事項 / Decided (2026-07-18, #1091)

- **種別**: アカウント API トークン（Account Owned Token）。ユーザートークンは使わない
  — CI 用資格情報を個人ユーザーに紐づけないため。必要権限は全て Account/Zone レベルで賄える。
- **トークン名**: `zedi-migration`
- **作成ページ**: Cloudflare ダッシュボード → 対象アカウント →
  **Manage Account → Account API Tokens**
  （`https://dash.cloudflare.com/<CLOUDFLARE_ACCOUNT_ID>/api-tokens`）。
  プロフィール配下の API Tokens は**ユーザートークン側**なので使わない。
- 権限が足りなくなったら、トークンを **Roll ではなく編集**で拡張する（Account API Tokens は
  権限の追記が可能）。

## 設定手順 / Setup steps

1. 上記ページで `zedi-migration` を作成（TTL は無期限 or 1 年。Client IP 制限は CI ランナー
   が可変 IP のため付けない）。
2. GitHub Secrets を差し替え:
   `gh secret set CLOUDFLARE_API_TOKEN --repo otomatty/zedi`（値をペースト）。
   `CLOUDFLARE_ACCOUNT_ID` がアカウント ID と一致しているかも確認。
3. ローカルは wrangler の OAuth ログインで足りている場合、トークン設定は不要。
   必要になったら `.env.local`（gitignore）へ。

## 注意 / Notes

- トークンは最小権限から始め、必要になった時点で拡張する。
- ローカルでは `.env.local`（gitignore）に置く。リポジトリにはコミットしない。
- `wrangler whoami` で有効性とアカウント ID を確認できる。
- `TF_API_TOKEN`（Terraform Cloud 用）は Terraform を削除したので、GitHub Secrets から削除する。
