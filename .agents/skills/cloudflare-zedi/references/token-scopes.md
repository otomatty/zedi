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

## 注意 / Notes

- トークンは最小権限から始め、フェーズ進行に合わせて拡張する。
- ローカルでは `.env.local`（gitignore）に置く。リポジトリにはコミットしない。
- `wrangler whoami` で有効性とアカウント ID を確認できる。
- 既存 `TF_API_TOKEN`（Terraform Cloud 用）は Phase 5 で GitHub Secrets から削除する。
