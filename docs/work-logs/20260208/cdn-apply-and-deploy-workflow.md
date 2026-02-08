# CDN apply 完了とフロントデプロイワークフロー追加

**日付:** 2026-02-08

---

## 1. 実施内容

### 1.1 CDN apply の完了（prod）

- **経緯:** 初回 apply で CloudFront にカスタムドメイン＋ACM を付与しようとしたところ、ACM 証明書が「検証待ち」のため `InvalidViewerCertificate` で失敗。
- **対応:** CDN モジュールに `attach_custom_domain`（ルート変数名: `cdn_attach_custom_domain`）を追加。Cloudflare で ACM 検証用 CNAME を追加するまで `attach_custom_domain = false` とし、CloudFront はデフォルト証明書（xxx.cloudfront.net）のみで作成するようにした。
- **実施:**
  - `terraform/variables.tf`: `cdn_attach_custom_domain` 追加（default: false）
  - `terraform/main.tf`: CDN モジュールに `attach_custom_domain = var.cdn_attach_custom_domain` を渡すよう変更
  - `terraform/environments/prod.tfvars`: `cdn_attach_custom_domain = false` を追加
  - `terraform workspace select prod` のうえで `terraform plan -var-file=environments/prod.tfvars -out=tfplan-cdn2` → `terraform apply "tfplan-cdn2"` を実行
- **結果:**
  - CloudFront 配信作成: **E30K53ZAPT4J6C**
  - CloudFront ドメイン: **d3vlr2g381j1ip.cloudfront.net**
  - S3 バケット: **zedi-prod-frontend-590183877893**
  - S3 バケットポリシー（OAC からの GetObject 許可）も適用済み

### 1.2 次のステップ（手動作業）

1. **Cloudflare で ACM 検証**
   - 検証用 CNAME の取得方法は次のいずれか。
   - **A) Terraform output（推奨）**  
     `terraform workspace select prod` のうえで:
     ```bash
     cd terraform
     terraform output -json acm_certificate_domain_validation_options
     ```
     `name`（FQDN）と `value` が Cloudflare に登録する CNAME の「名前」「ターゲット」に対応。Cloudflare では「名前」は FQDN からドメインを除いた部分（例: `_abc123.zedi-note.app` → 名前は `_abc123`）。
   - **B) AWS CLI**  
     証明書は **us-east-1** にあるため `--region us-east-1` を指定する:
     ```bash
     # 証明書 ARN を調べる（zedi-note.app のドメインのもの）
     aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='zedi-note.app'].CertificateArn" --output text

     # 検証用 CNAME を表示
     aws acm describe-certificate --certificate-arn <上記のARN> --region us-east-1 \
       --query "Certificate.DomainValidationOptions[0].ResourceRecord" --output table
     ```
     `Name` が CNAME の名前、`Value` がターゲット。Cloudflare に「CNAME」タイプで 1 件追加（プロキシ: **DNS のみ**）。
   - 証明書が「発行済み」になるのを待つ。
2. **カスタムドメインの付与**
   - `prod.tfvars` で `cdn_attach_custom_domain = true` に変更し、`terraform apply` で CloudFront に ACM と aliases（zedi-note.app, www.zedi-note.app）を付与。
3. **Cloudflare で本番 CNAME**
   - zedi-note.app（と www）の CNAME を `d3vlr2g381j1ip.cloudfront.net` に向ける。

### 1.3 GitHub Actions: deploy-frontend.yml

- **追加:** `.github/workflows/deploy-frontend.yml`
- **トリガー:** main への push（パス: `src/`, `public/`, `index.html`, `vite.config.ts`, `package.json`, `package-lock.json`）、または `workflow_dispatch`
- **手順:** チェックアウト → Bun セットアップ → 依存関係インストール → 本番用 VITE_* を Secrets から渡して `bun run build` → `aws s3 sync dist/` → CloudFront invalidation
- **必要な GitHub Secrets:** プラン文書およびワークフロー内コメントを参照。少なくとも:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - `PROD_FRONTEND_S3_BUCKET`（例: zedi-prod-frontend-590183877893）
  - `PROD_CLOUDFRONT_DISTRIBUTION_ID`（例: E30K53ZAPT4J6C）
  - 本番用 `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REDIRECT_URI`, `VITE_COGNITO_LOGOUT_REDIRECT_URI`, `VITE_TURSO_DATABASE_URL`, `VITE_TURSO_AUTH_TOKEN`, `VITE_AI_API_BASE_URL`, `VITE_THUMBNAIL_API_BASE_URL`, `VITE_REALTIME_URL`

---

## 2. 参照

- プラン: `docs/plans/20260208/aws-frontend-deploy-terraform-plan.md`
- Phase C: `docs/plans/20260208/phase-c-work-breakdown.md`
- 環境変数: `docs/guides/env-variables-guide.md`
