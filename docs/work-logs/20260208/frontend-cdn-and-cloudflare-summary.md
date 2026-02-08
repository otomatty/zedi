# フロント CDN・Cloudflare 作業サマリー（2026-02-08）

本番フロントの AWS CDN（S3 + CloudFront）構築から、Cloudflare での CNAME 登録までを一括で記録する作業ログです。

---

## 1. 作業の流れ（実施済み）

| 順 | 内容 | 状態 |
|----|------|------|
| 1 | CDN モジュール作成（S3, CloudFront OAC, ACM, Route53 オプション） | 完了 |
| 2 | prod で CloudFront をデフォルト証明書のみで作成（`cdn_attach_custom_domain = false`） | 完了 |
| 3 | ACM 証明書の検証用 CNAME を AWS CLI で取得 | 完了 |
| 4 | Cloudflare に ACM 検証用 CNAME を 2 件追加（zedi-note.app / www.zedi-note.app） | 完了 |
| 5 | 証明書が「発行済み」になったら `cdn_attach_custom_domain = true` で Terraform apply | 証明書発行待ち or 実施済み |
| 6 | Cloudflare で本番 CNAME（zedi-note.app, www → CloudFront ドメイン） | 完了 |
| 7 | フロントデプロイ（GitHub Actions または手動 s3 sync + invalidation） | ワークフロー追加済み |

---

## 2. 実施した変更（ファイル・リソース）

### 2.1 Terraform

- **modules/cdn/**  
  S3 バケット、OAC、CloudFront、ACM（us-east-1）、Route53 オプション。`attach_custom_domain` で「カスタムドメイン付与」を切り替え。
- **terraform/variables.tf**  
  `route53_zone_id`, `cdn_attach_custom_domain` を追加。
- **terraform/main.tf**  
  CDN モジュール有効化、`attach_custom_domain` を渡すように変更。
- **terraform/outputs.tf**  
  `cloudfront_distribution_id`, `cloudfront_domain_name`, `frontend_url`, `frontend_s3_bucket`, `acm_certificate_domain_validation_options` を出力。
- **terraform/environments/prod.tfvars**  
  `domain_name = "zedi-note.app"`, `route53_zone_id = ""`, `cdn_attach_custom_domain`（当初 false → 証明書発行後に true に変更）。

### 2.2 本番リソース（prod workspace）

| リソース | 値 |
|----------|-----|
| CloudFront Distribution ID | E30K53ZAPT4J6C |
| CloudFront ドメイン | d3vlr2g381j1ip.cloudfront.net |
| S3 バケット（フロント） | zedi-prod-frontend-590183877893 |
| ACM 証明書（us-east-1） | arn:aws:acm:us-east-1:590183877893:certificate/5de68ead-e346-4c06-b03c-d4ef8813cedc |
| ドメイン | zedi-note.app, www.zedi-note.app |

### 2.3 Cloudflare に追加した CNAME（ACM 検証用）

| 名前 | タイプ | ターゲット | 備考 |
|------|--------|------------|------|
| _a0b3fbed053e0e5d382c5f84c1afde01 | CNAME | _672da6a941b8b4d84cdf267175617a2b.jkddzztszm.acm-validations.aws. | zedi-note.app 用・プロキシ OFF |
| _33d0b42e43b5655fcbb7c99c732808d6.www | CNAME | _b6f0c33fb3e8957238748965d1e278a8.jkddzztszm.acm-validations.aws. | www.zedi-note.app 用・プロキシ OFF |

### 2.4 本番用 CNAME（Cloudflare で設定するメモ）

zedi-note.app を CloudFront で配信するために、Cloudflare の DNS で次の 2 件を「この内容」にする。  
（CloudFront にカスタムドメイン・ACM を付与したあとに行う。Terraform の `cloudfront_domain_name` = `d3vlr2g381j1ip.cloudfront.net`。）

| 名前（Cloudflare） | タイプ | ターゲット（Content） | プロキシ |
|--------------------|--------|------------------------|----------|
| `@`（apex = zedi-note.app） | CNAME | `d3vlr2g381j1ip.cloudfront.net` | DNS のみ or プロキシ有効（好みで） |
| `www` | CNAME | `d3vlr2g381j1ip.cloudfront.net` | 同上 |

- **プロキシ OFF（DNS のみ）:** ユーザー ⇔ CloudFront 間で ACM 証明書の HTTPS がそのまま効く。
- **プロキシ ON（オレンジの雲）:** ユーザー ⇔ Cloudflare ⇔ CloudFront。Cloudflare 側で SSL を「フル（ストリクト）」にすれば DDoS 対策・キャッシュを利用可能。
- 最新の CloudFront ドメイン名は `terraform -chdir=terraform output -raw cloudfront_domain_name`（prod workspace）で確認できる。

**「An A, AAAA, or CNAME record with that host already exists」が出る場合**

同じホスト（`@` や `www`）にすでに A / AAAA / CNAME が存在するため、**新規追加はできません**。次のどちらかで対応する。

1. **既存レコードを編集する**  
   Cloudflare ダッシュボード → zedi-note.app → **DNS** → 一覧で `@` または `www` の行を探す → **編集** → タイプを **CNAME**、ターゲットを `d3vlr2g381j1ip.cloudfront.net` に変更して保存。
2. **既存レコードを削除してから CNAME を追加する**  
   該当する `@` または `www` のレコードを**削除**し、あらためて上記の CNAME を 1 件ずつ**追加**する。

※ 同一ホストに A と CNAME を同時に置くことはできないため、必ず「編集で差し替え」か「削除 → 追加」のどちらかになる。

### 2.5 CI/CD

- **.github/workflows/deploy-frontend.yml**  
  main の対象パス変更時または手動で、ビルド → S3 sync → CloudFront invalidation。本番用 VITE_* と AWS 認証情報は GitHub Secrets で渡す。

---

## 3. 参照ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| **docs/guides/github-and-deploy-guide.md** | **GitHub 運用・デプロイの手順（Secrets、手動デプロイ、Terraform）** |
| docs/work-logs/20260208/work-summary-and-next-steps.md | 作業サマリーと今後の進め方 |
| docs/plans/20260208/aws-frontend-deploy-terraform-plan.md | CDN 設計・デプロイフロー・Cloudflare 手順 |
| docs/work-logs/20260208/cdn-apply-and-deploy-workflow.md | CDN apply と deploy-frontend ワークフローの詳細 |
| docs/guides/env-variables-guide.md | 本番 VITE_* の説明 |

---

## 4. 今後の計画（ドメイン・DNS の IaC）

Cloudflare で管理しているドメイン（zedi-note.app）の DNS も Terraform で IaC 管理する計画を、別ドキュメントにまとめています。

- **docs/plans/20260208/cloudflare-dns-terraform-plan.md**  
  Cloudflare Provider を使ったゾーン・DNS レコードの管理方針とタスク概要。
