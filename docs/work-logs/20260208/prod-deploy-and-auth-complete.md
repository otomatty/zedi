# 本番デプロイ・認証完了までの作業ログ（2026-02-08）

https://zedi-note.app でフロントを配信し、Google/GitHub サインインでホーム画面まで到達できる状態にした一連の作業をまとめます。

---

## 1. 作業の流れ（全体）

| 順 | 内容 | 状態 |
|----|------|------|
| 1 | CDN モジュール作成・prod で CloudFront（デフォルト証明書）作成 | 完了 |
| 2 | ACM 検証用 CNAME 取得（AWS CLI）→ Cloudflare に 2 件追加 | 完了 |
| 3 | 証明書発行後、`cdn_attach_custom_domain = true` で Terraform apply | 完了 |
| 4 | Cloudflare で本番 CNAME（@, www → CloudFront）設定 | 完了 |
| 5 | フロント手動デプロイ（build → S3 sync → CloudFront invalidation） | 完了 |
| 6 | Cognito コールバックで止まる → GCP リダイレクト URI 確認（問題なし） | 完了 |
| 7 | Hosted UI で「Login option is not available」→ IdP 未作成を解消 | 完了 |
| 8 | `set -a` で prod.secret.env を export して Terraform apply → Google/GitHub IdP 作成 | 完了 |
| 9 | ホーム画面にアクセス可能であることを確認 | 完了 |

---

## 2. 実施した主な変更

### 2.1 フロント配信（CDN・Cloudflare）

- **Terraform:** `modules/cdn`（S3, CloudFront OAC, ACM us-east-1）、`attach_custom_domain` フラグ、prod.tfvars のドメイン設定・www 用 Cognito コールバック URL 追加。
- **Cloudflare:** ACM 検証用 CNAME 2 件、本番用 CNAME（@ と www → d3vlr2g381j1ip.cloudfront.net）。既存レコードがある場合は「編集」で CNAME に差し替え。
- **デプロイ:** `.github/workflows/deploy-frontend.yml` 追加。手動では `bun run build` → `aws s3 sync dist/ s3://zedi-prod-frontend-590183877893/ --delete` → `aws cloudfront create-invalidation --distribution-id E30K53ZAPT4J6C --paths "/*"`。

### 2.2 認証まわり（Cognito IdP）

- **現象 1:** コールバックで止まる → GCP の「承認済みリダイレクト URI」は Cognito の `/oauth2/idpresponse` で正しかった。
- **現象 2:** Hosted UI で Google/GitHub を選ぶと 401「Login option is not available」→ Terraform の apply 時に **Client Secret が渡っておらず**、Google/GitHub の IdP が作成されていなかった。
- **対応:** `prod.secret.env` に `TF_VAR_google_oauth_client_secret` と `TF_VAR_github_oauth_client_secret` を設定済みのうえで、**Bash で確実に export** してから apply。
  ```bash
  set -a && . environments/prod.secret.env && set +a
  terraform apply -var-file=environments/prod.tfvars
  ```
- **Apply 結果:** Google IdP と GitHub IdP を新規作成、Cognito アプリクライアントの `supported_identity_providers` に Google/GitHub を追加。Cognito ドメインは replace されたがドメイン名は同じ（zedi-prod-590183877893）。

### 2.3 アプリ・ドキュメント

- **AuthCallback.tsx:** `code` が無いときのエラーメッセージを改善（GCP のリダイレクト URI 確認を案内）。
- **prod.tfvars:** `cognito_callback_urls` / `cognito_logout_urls` に www を追加。
- **トラブルシュート:** `docs/guides/troubleshooting-cognito-google-callback.md` に「Login option is not available」の原因と対処（prod.secret.env の確認、**set -a で export してから apply**）を追記。

---

## 3. 本番で使っている主なリソース

| 種類 | 値 |
|------|-----|
| 本番 URL | https://zedi-note.app（https://www.zedi-note.app も可） |
| CloudFront Distribution ID | E30K53ZAPT4J6C |
| CloudFront ドメイン | d3vlr2g381j1ip.cloudfront.net |
| S3 バケット（フロント） | zedi-prod-frontend-590183877893 |
| Cognito Hosted UI | https://zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com |
| Cognito User Pool ID | ap-northeast-1_7C9aAQGjy |
| Terraform workspace（本番） | prod |
| ドメイン管理 | Cloudflare（zedi-note.app） |

---

## 4. 参照ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| docs/work-logs/20260208/frontend-cdn-and-cloudflare-summary.md | CDN・Cloudflare の詳細と CNAME メモ |
| docs/work-logs/20260208/work-summary-and-next-steps.md | 作業サマリーと今後の進め方 |
| docs/guides/github-and-deploy-guide.md | GitHub 運用・デプロイ手順 |
| docs/guides/troubleshooting-cognito-google-callback.md | 認証まわりトラブルシュート（GCP URI、IdP 未作成、set -a） |
| docs/plans/20260208/prod-idp-google-github-work-plan.md | 本番 IdP（Google/GitHub）作業計画 |
| docs/plans/20260208/aws-frontend-deploy-terraform-plan.md | フロントデプロイの設計 |

---

## 5. 今後の運用メモ

- **Terraform apply（本番）:** IdP の Secret を渡すため、必ず `set -a && . environments/prod.secret.env && set +a` してから `terraform apply -var-file=environments/prod.tfvars` を実行する。
- **フロントの再デプロイ:** GitHub Actions の Deploy Frontend (prod) を使うか、手動で build → S3 sync → CloudFront invalidation。
- **GitHub Secrets:** 自動デプロイを使う場合は、AWS 認証情報と本番用 VITE_* をリポジトリの Secrets に登録する（docs/guides/github-and-deploy-guide.md 参照）。
