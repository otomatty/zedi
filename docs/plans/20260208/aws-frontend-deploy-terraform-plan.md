# AWS フロントエンドデプロイ Terraform 実装プラン

**作成日:** 2026-02-08  
**対象:** フロントエンド（Vite/React）を AWS（S3 + CloudFront）で配信し、Terraform でインフラを管理する

**本番 URL 想定:** https://zedi-note.app  
**ドメイン:** Cloudflare で取得・管理（zedi-note.app）

---

## 1. 全体構成

```
[GitHub] -- push/main --> [GitHub Actions]
                               |
                               v
                     npm run build (VITE_* 注入)
                               |
                               v
                     aws s3 sync dist/ --> [S3 バケット]
                               |
                               v
                     CloudFront invalidation
                               |
[ユーザー] <-- HTTPS --> [CloudFront] <-- Origin Access --> [S3]
                |
                +-- カスタムドメイン zedi-note.app (ACM + Cloudflare DNS で CNAME 設定)
```

- **Terraform の役割:** S3 バケット、CloudFront 配信、ACM 証明書（us-east-1）の作成。**DNS は Cloudflare で管理するため Route53 は使わない**。アプリのビルド成果物のアップロイは行わない。
- **デプロイの役割:** GitHub Actions でビルド → S3 アップロード → CloudFront キャッシュ無効化。

---

## 2. 実装する Terraform モジュール: `modules/cdn`

### 2.1 ディレクトリ構成

```
terraform/modules/cdn/
├── main.tf      # CloudFront distribution, Origin Access Control
├── s3.tf        # S3 バケット、バケットポリシー（CloudFront OAC からのみ読み取り可）
├── acm.tf       # ACM 証明書（us-east-1、domain_name 指定時のみ）
├── route53.tf   # Route53 レコード（zone_id 指定時のみ。Alias → CloudFront）
├── variables.tf
├── outputs.tf
└── README.md
```

### 2.2 リソース仕様

| リソース | 内容 |
|----------|------|
| **S3 バケット** | 名前例: `zedi-{environment}-frontend`。パブリックアクセスブロック有効。バージョニングは任意（本番では有効推奨）。 |
| **S3 バケットポリシー** | CloudFront の OAC（Origin Access Control）からの `s3:GetObject` のみ許可。OAI ではなく OAC を使用（推奨方式）。 |
| **CloudFront OAC** | オリジンアクセス制御（Origin Access Control）。S3 をプライベートのまま配信。 |
| **CloudFront 配信** | オリジン: 上記 S3。デフォルトルートオブジェクト: `index.html`。カスタムエラー: 403/404 → 200, `/index.html`（SPA 用）。Viewer Protocol Policy: Redirect HTTP to HTTPS。価格クラス: 必要に応じて（例: PriceClass_200 = 北米・欧州・アジア）。 |
| **ACM 証明書** | `domain_name` が空でない場合のみ。**us-east-1** でリクエスト（CloudFront 要件）。DNS 検証用の CNAME を Route53 に作成するか、手動で外部 DNS に追加。 |
| **Route53** | `route53_zone_id` が渡された場合のみ、CloudFront への Alias レコード（A/AAAA）を作成。`domain_name` と組み合わせて `zedi-note.app` を指す。 |

### 2.3 変数設計（modules/cdn/variables.tf）

| 変数名 | 型 | 必須 | 説明 |
|--------|-----|------|------|
| environment | string | ○ | dev / prod |
| domain_name | string | - | カスタムドメイン（例: zedi-note.app）。空の場合は CloudFront の xxx.cloudfront.net のみ。 |
| route53_zone_id | string | - | Route53 ホストゾーン ID。空の場合はレコード作成しない（DNS は手動）。 |
| create_route53_zone | bool | - | 新規で Route53 ゾーンを作成するか。既存ゾーンを使う場合は false で zone_id を渡す。 |
| tags | map(string) | - | 共通タグ |

- **カスタムドメインなし:** `domain_name = ""` → ACM も Route53 も作らず、CloudFront のデフォルトドメイン（`d111111abcdef8.cloudfront.net`）のみ。
- **カスタムドメインあり・DNS は手動:** `domain_name = "zedi-note.app"`、`route53_zone_id = ""` → ACM のみ作成。証明書の検証用 CNAME と、本番用 CNAME（zedi-note.app → CloudFront）は外部 DNS で手動設定。
- **カスタムドメインあり・Route53 で管理:** `domain_name = "zedi-note.app"`、`route53_zone_id = "Z123..."`（既存ゾーン）→ ACM + Route53 Alias を Terraform で作成。

### 2.4 出力（modules/cdn/outputs.tf）

| 出力名 | 説明 |
|--------|------|
| bucket_id | S3 バケット名（デプロイスクリプトで sync 先に使用） |
| bucket_arn | S3 バケット ARN |
| distribution_id | CloudFront 配信 ID（invalidation 用） |
| distribution_domain_name | xxx.cloudfront.net |
| distribution_hosted_zone_id | CloudFront の Hosted Zone ID（Route53 Alias 用） |
| frontend_url | 本番 URL（domain_name があれば https://${domain_name}、なければ https://${distribution_domain_name}） |
| acm_certificate_arn | 作成した ACM 証明書 ARN（空の場合は ""） |

---

## 3. ルート側の変更（terraform/）

### 3.1 variables.tf の追加・既存の流用

| 変数 | 対応 |
|------|------|
| domain_name | 既存。prod では `zedi-note.app` を設定。 |
| create_route53_zone | 既存。既存ゾーンを使う場合は false。 |
| **route53_zone_id** | **新規追加**。zedi-note.app のホストゾーンが既に Route53 にある場合にその ID を渡す。空なら CDN モジュールは Route53 レコードを作らない。 |

### 3.2 main.tf の CDN モジュール有効化

- コメントアウトを外し、`module "cdn"` を有効化。
- `provider "aws.us_east_1"` は既にあるので、CDN モジュールに `providers = { aws.us_east_1 = aws.us_east_1 }` を渡す（ACM と CloudFront は us-east-1 で作成）。
- 渡す変数: `environment`, `domain_name`, `route53_zone_id`, `create_route53_zone`, `tags`。

### 3.3 outputs.tf の CDN 出力有効化

- `cloudfront_distribution_id`, `cloudfront_domain_name`, `frontend_url` のコメントを外し、`module.cdn` の出力を参照する。

### 3.4 prod.tfvars の更新（ドメインは Cloudflare で管理）

```hcl
domain_name         = "zedi-note.app"
create_route53_zone = false   # Cloudflare で DNS 管理のため false
route53_zone_id     = ""      # Route53 は使わない（Cloudflare で管理）
```

- **DNS は Cloudflare:** Route53 は使わない。ACM のみ Terraform で作成し、**証明書の DNS 検証用 CNAME** と **zedi-note.app を CloudFront に向ける CNAME** は Cloudflare ダッシュボードで手動追加する（§6.1 参照）。

---

## 4. デプロイパイプライン（GitHub Actions）

Terraform は**インフラのみ**管理する。アプリのビルド・アップロイは **GitHub Actions** で行う。

### 4.1 ワークフロー案: `.github/workflows/deploy-frontend.yml`

| トリガー | main ブランチへの push（または手動）。パス指定で `src/`, `public/`, `index.html`, `vite.config.ts`, `package.json` 等の変更時のみでも可。 |
|----------|--------------------------------------------------------------------------------------------------------------------------------------|
| 手順 | 1. チェックアウト<br>2. Node/Bun セットアップ、依存関係インストール<br>3. 本番用環境変数を GitHub Secrets から取得し、`VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_TURSO_*`, `VITE_REALTIME_URL` 等を設定<br>4. `npm run build`（または `bun run build`）で `dist/` を生成<br>5. AWS credentials（OIDC または IAM ユーザーキー）で `aws s3 sync dist/ s3://zedi-prod-frontend/ --delete`<br>6. `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"` |
| 必要な Secrets | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`（または OIDC 用の Role ARN）、および本番用 `VITE_*` を Secrets に登録。S3 バケット名と CloudFront 配信 ID は Terraform output から取得するか、Secrets に格納。 |

- **Terraform でデプロイしない理由:** ビルド成果物は環境依存（VITE_* の値で変わる）ため、Terraform の `null_resource` + `local-exec` でビルドするより、CI でビルド・アップロードする方が一般的で柔軟。

### 4.2 IAM 権限（デプロイ用）

- デプロイ用の IAM ユーザーまたはロールに付与する権限の例:
  - 対象 S3 バケット: `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`
  - CloudFront: `cloudfront:CreateInvalidation`
- 最小権限のため、バケット名・配信 ID をリソースで限定する。

---

## 5. 実装タスク一覧（推奨順）

| # | タスク | 内容 | 成果物 |
|---|--------|------|--------|
| 1 | **cdn モジュール: S3** | S3 バケット、パブリックアクセスブロック、バケットポリシー用の識別子（OAC 用）の準備 | `modules/cdn/s3.tf` |
| 2 | **cdn モジュール: CloudFront** | OAC、CloudFront 配信、default root object、SPA 用 403/404 → index.html | `modules/cdn/main.tf` |
| 3 | **cdn モジュール: ACM（オプション）** | domain_name が空でないときに us-east-1 で ACM 証明書リクエスト、DNS 検証用レコード（Route53 の場合） | `modules/cdn/acm.tf` |
| 4 | **cdn モジュール: Route53（オプション）** | route53_zone_id が渡されたとき、CloudFront への Alias レコード作成 | `modules/cdn/route53.tf` |
| 5 | **cdn モジュール: variables / outputs** | 上記変数・出力の定義 | `modules/cdn/variables.tf`, `outputs.tf` |
| 6 | **ルート: CDN 有効化** | main.tf の module cdn のコメント解除、変数渡し。variables.tf に route53_zone_id 追加。outputs.tf の CDN 出力を有効化 | `main.tf`, `variables.tf`, `outputs.tf` |
| 7 | **prod.tfvars: ドメイン設定** | domain_name = "zedi-note.app", route53_zone_id の設定（必要に応じて） | `environments/prod.tfvars` |
| 8 | **GitHub Actions: フロントデプロイ** | ビルド → S3 sync → CloudFront invalidation。Secrets で VITE_* と AWS 認証情報を渡す | `.github/workflows/deploy-frontend.yml` |
| 9 | **動作確認** | Terraform apply（prod workspace）→ 初回は手動で `aws s3 sync` と invalidation でデプロイ → https://zedi-note.app で表示・サインイン確認 | - |

---

## 6. 注意事項・設計上の選択

### 6.1 ドメインが Cloudflare で取得・管理されている場合（本番の想定）

zedi-note.app は **Cloudflare で取得・DNS 管理** しているため、Terraform では **Route53 を使わず**、次のようにする。

| 項目 | 対応 |
|------|------|
| **Terraform** | `route53_zone_id = ""`、`create_route53_zone = false`。ACM 証明書（us-east-1）と CloudFront のみ作成。 |
| **ACM 証明書の検証** | Terraform apply 後、ACM コンソールで「証明書の検証」に表示される **CNAME 名** と **CNAME 値** をコピーし、**Cloudflare の DNS** で 1 件の CNAME レコードとして追加する。検証が通ると証明書が「発行済み」になる。 |
| **本番ドメインの向き先** | CloudFront 作成後、**Cloudflare** で zedi-note.app（および必要なら www.zedi-note.app）の **CNAME** を、CloudFront のドメイン名（例: `d111111abcdef8.cloudfront.net`）に向ける。Terraform の output `cloudfront_domain_name` で確認できる。 |

**Cloudflare での設定手順（概要）**

1. **ACM 検証用 CNAME（1 回だけ）**
   - AWS コンソール → Certificate Manager（リージョン **us-east-1**）→ 対象証明書 → 「ドメインの検証」で表示されるレコード名・値を控える。
   - Cloudflare ダッシュボード → zedi-note.app → DNS → レコードを追加。
   - タイプ: **CNAME**。名前: ACM に表示された「レコード名」（例: `_abc123.zedi-note.app` の場合は `_abc123`）。ターゲット: ACM に表示された「レコード値」。プロキシ: **DNS のみ（グレーの雲）** 推奨（検証が確実に通るため）。
   - 数分〜最大 30 分程度で ACM のステータスが「発行済み」になる。

2. **本番用 CNAME（CloudFront に向ける）**
   - Terraform output で `cloudfront_domain_name`（例: `d1234abcd.cloudfront.net`）を確認。
   - Cloudflare → DNS → レコードを追加（または既存の zedi-note.app を編集）。
   - タイプ: **CNAME**（または A/AAAA で Cloudflare の「プロキシ」を使う場合は別設定）。名前: `@`（apex の場合は Cloudflare の CNAME Flattening または A レコードでプロキシを利用）。ターゲット: `d1234abcd.cloudfront.net`。
   - **Apex（zedi-note.app）を CloudFront に向ける場合:** Cloudflare では CNAME で apex を指定できる（CNAME Flattening）。そのまま CNAME `@` → `xxx.cloudfront.net` でよい。プロキシをオレンジ（プロキシ有効）にすると Cloudflare 経由になり、証明書は Cloudflare のものを利用する。**CloudFront の ACM 証明書をそのまま使う場合はプロキシをオフ（DNS のみ）** にし、HTTPS は CloudFront ⇔ ユーザー間で完結させる。

**プロキシ（オレンジの雲）を使う場合**

- Cloudflare プロキシを有効にすると、ユーザー → Cloudflare → CloudFront となり、Cloudflare の DDoS 対策やキャッシュが使える。その場合、Cloudflare 側で SSL/TLS を「フル（ストリクト）」にし、CloudFront のカスタムドメイン＋ACM 証明書はそのまま利用できる。
- 証明書検証用 CNAME は **必ず DNS のみ（グレー）** のままにすること。

### 6.2 Route53 でドメインを管理する場合（参考）

- 既存ホストゾーンがある: `route53_zone_id` にその ID を渡す。Terraform で ACM（検証用レコード含む）と Alias レコードを作成。
- 新規でゾーンを作る: `create_route53_zone = true` とし、モジュール内で `aws_route53_zone` を作成する設計も可能（名前サーバーをドメイン登録業者で変更する必要あり）。
- **本番は Cloudflare のため上記 6.1 を採用する。**

### 6.2 環境別

- **dev:** CDN モジュールを有効にすれば、dev 用バケット・配信も作成可能。`domain_name` は空にして CloudFront の xxx.cloudfront.net のみで確認する運用でもよい。
- **prod:** `domain_name = "zedi-note.app"` とし、ACM + 必要に応じて Route53 でカスタムドメインを付与。

### 6.3 コスト目安

- S3: ストレージ数 GB 程度なら月数セント。
- CloudFront: 転送量に応じて。小規模なら月 1 ドル前後の記載が既存計画書にある。
- ACM: 証明書は無料。

---

## 7. 参照

| ドキュメント | パス |
|-------------|------|
| AWS Terraform 実装計画書 | `docs/specs/aws-terraform-implementation-plan.md` |
| Phase C 作業内容（C2 CDN） | `docs/plans/20260208/phase-c-work-breakdown.md` |
| 環境変数ガイド（本番 VITE_*） | `docs/guides/env-variables-guide.md` |

---

## 8. 次のアクション

1. 上記タスク 1〜6 で **Terraform の cdn モジュールとルートの有効化** を実装する。
2. **prod workspace** で `terraform plan -var-file=environments/prod.tfvars` を実行し、S3・CloudFront・必要に応じて ACM が作成されることを確認してから `apply` する。
3. タスク 8 の **deploy-frontend.yml** を追加し、本番用 VITE_* を Secrets に設定したうえで、main ブランチから初回デプロイを実行する。
4. **Cloudflare** で ACM 検証用 CNAME を追加して証明書を「発行済み」にし、zedi-note.app の CNAME を CloudFront のドメイン名に向ける。その後 https://zedi-note.app で動作確認する。
