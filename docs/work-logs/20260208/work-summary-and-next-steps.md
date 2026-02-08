# 作業サマリー（2026-02-08）と今後の進め方

ここまでの実施内容のまとめと、GitHub などで作業を続けるときの手順を一括で記載します。

---

## 1. ここまでの作業内容のまとめ

### 1.1 実施したこと一覧

| 項目 | 内容 |
|------|------|
| **本番 CDN（AWS）** | Terraform の `modules/cdn` で S3 バケット・CloudFront・ACM（us-east-1）を構築。prod workspace で apply 済み。 |
| **カスタムドメイン** | 当初は証明書未発行のため `cdn_attach_custom_domain = false` で CloudFront 作成。Cloudflare に ACM 検証用 CNAME を追加し証明書発行後、`true` に変更して apply。CloudFront に zedi-note.app / www.zedi-note.app と ACM を付与済み。 |
| **Cloudflare DNS** | ACM 検証用 CNAME 2 件を追加。本番用 CNAME（@ と www → CloudFront）を設定済み。 |
| **フロントデプロイ** | GitHub Actions の `deploy-frontend.yml` を追加。手動で `bun run build` → S3 sync → CloudFront invalidation を実行し、https://zedi-note.app で配信確認済み。 |
| **認証（Google/GitHub）** | 当初 Hosted UI で「Login option is not available」→ IdP が未作成だったため、`set -a && . prod.secret.env && set +a` で Secret を export して Terraform apply。Google/GitHub IdP 作成・アプリクライアントに追加し、ホーム画面までアクセス可能に。 |
| **ドキュメント** | フロント CDN サマリー、ACM/本番 CNAME メモ、Cloudflare DNS を Terraform で管理する計画、デプロイワークフロー説明、認証トラブルシュート（troubleshooting-cognito-google-callback.md）を追加。 |

### 1.2 本番で使っている主なリソース

| 種類 | 値 |
|------|-----|
| 本番 URL | https://zedi-note.app（および https://www.zedi-note.app） |
| CloudFront Distribution ID | E30K53ZAPT4J6C |
| CloudFront ドメイン | d3vlr2g381j1ip.cloudfront.net |
| S3 バケット（フロント） | zedi-prod-frontend-590183877893 |
| Terraform workspace（本番） | prod |
| ドメイン管理 | Cloudflare（zedi-note.app） |

### 1.3 参照したい作業ログ・プラン

| ドキュメント | 用途 |
|-------------|------|
| **docs/work-logs/20260208/prod-deploy-and-auth-complete.md** | **本番デプロイ〜認証完了までの一括ログ** |
| docs/work-logs/20260208/frontend-cdn-and-cloudflare-summary.md | CDN・Cloudflare の詳細と CNAME メモ |
| docs/work-logs/20260208/cdn-apply-and-deploy-workflow.md | CDN apply と deploy-frontend の説明 |
| docs/plans/20260208/aws-frontend-deploy-terraform-plan.md | フロントデプロイの設計 |
| docs/plans/20260208/cloudflare-dns-terraform-plan.md | Cloudflare DNS を Terraform で管理する計画 |
| docs/guides/env-variables-guide.md | VITE_* 環境変数の説明 |

---

## 2. 今後 GitHub などで作業するときにやること

以下は **docs/guides/github-and-deploy-guide.md** に同じ内容をガイドとしてまとめてあります。作業時はそちらも参照してください。

- **GitHub Secrets の設定**（未設定なら）：デプロイに必要な AWS と VITE_* をリポジトリの Secrets に登録する。
- **フロントの変更を本番反映**：main に push（対象パス変更時）で deploy-frontend が動く。または手動でワークフロー実行。
- **Terraform の変更**：workspace 選択・prod.secret.env の読み込み・plan → apply の流れを守る。
- **Cloudflare の変更**：DNS は手動 or 将来 Terraform（Cloudflare Provider）で管理。
- **手動デプロイ**：ビルド → S3 sync → CloudFront invalidation の 3 コマンド。

詳細は **docs/guides/github-and-deploy-guide.md** を参照してください。
