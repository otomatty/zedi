# 引き継ぎ時におさえるドキュメント一覧

次の作業を引き継ぐ場合、**優先度の順**に以下のドキュメントを参照してください。

---

## 1. まず読むもの（全体像・現状）

| ドキュメント | 目的 |
|-------------|------|
| **docs/work-logs/20260208/prod-deploy-and-auth-complete.md** | 本番デプロイ〜認証完了までに何をしたか一通り把握する。リソース一覧・運用メモ付き。 |
| **docs/work-logs/20260208/work-summary-and-next-steps.md** | 実施内容の要約と「今後 GitHub で作業するときにやること」の要約。 |

---

## 2. 作業内容に応じて読むもの

| やりたいこと | 参照するドキュメント |
|-------------|----------------------|
| **フロントを本番にデプロイする**（手動 or CI） | **docs/guides/github-and-deploy-guide.md**（§1 デプロイ、§2 GitHub Secrets） |
| **Terraform で本番を変更する** | **docs/guides/github-and-deploy-guide.md**（§3 Terraform）。本番 apply 時は必ず `set -a && . environments/prod.secret.env && set +a` してから実行。 |
| **認証（Google/GitHub）で不具合が出た** | **docs/guides/troubleshooting-cognito-google-callback.md**（Login option not available、GCP リダイレクト URI、set -a など） |
| **CDN・Cloudflare・CNAME の詳細** | **docs/work-logs/20260208/frontend-cdn-and-cloudflare-summary.md**（本番 CNAME メモ、既存レコードの編集方法） |
| **本番 IdP（Google/GitHub）の設計・手順** | **docs/plans/20260208/prod-idp-google-github-work-plan.md** |
| **フロントデプロイの設計** | **docs/plans/20260208/aws-frontend-deploy-terraform-plan.md** |
| **Cloudflare DNS を Terraform で管理する** | **docs/plans/20260208/cloudflare-dns-terraform-plan.md** |
| **本番で使う VITE_* 環境変数** | **docs/guides/env-variables-guide.md** |

---

## 3. クイック参照（よく使う値）

- **本番 URL:** https://zedi-note.app
- **CloudFront Distribution ID:** E30K53ZAPT4J6C
- **S3 バケット（フロント）:** zedi-prod-frontend-590183877893
- **Cognito Hosted UI:** https://zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com
- **Terraform 本番:** workspace `prod`、`environments/prod.tfvars`。Secret は `environments/prod.secret.env`（`set -a` で読み込む）。

---

上記の「1. まず読むもの」で全体を把握し、作業内容に応じて「2. 作業内容に応じて読むもの」から該当ドキュメントを参照すると効率的です。
