# Cloudflare DNS を Terraform で IaC 管理する計画

**作成日:** 2026-02-08  
**目的:** Cloudflare で管理しているドメイン（zedi-note.app）の DNS を Terraform で定義し、IaC で管理する。

---

## 1. 結論：可能です

**Cloudflare の DNS（ゾーン・レコード）は Terraform で管理できます。**  
公式の [Cloudflare Terraform Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest) を使い、ゾーン ID と API トークンで認証して、`cloudflare_record` で CNAME 等を定義します。

- **ゾーン:** 既存ゾーンを `data "cloudflare_zone"` で参照するか、`resource "cloudflare_zone"` で新規作成（通常は既存参照）。
- **レコード:** `cloudflare_record` で A / AAAA / CNAME / TXT 等を管理。
- **認証:** `CLOUDFLARE_API_TOKEN` を環境変数または `provider "cloudflare" { api_token = "..." }` で指定（Secrets で管理推奨）。

---

## 2. 管理したい対象（zedi-note.app）

| 種類 | 内容 | 現在 |
|------|------|------|
| ACM 検証用 CNAME | 証明書発行用（_xxxx.zedi-note.app → acm-validations.aws） | 手動で 2 件追加済み |
| 本番 CNAME | @ / www → CloudFront（d3vlr2g381j1ip.cloudfront.net） | 手動 or 未設定 |

Terraform で管理すると、CloudFront のドメイン名を output から取り、Cloudflare の CNAME を同一の apply または別モジュールで揃えられます。

---

## 3. 構成案

### 3.1 パターン A: 既存 Terraform リポジトリに Cloudflare を追加

- **provider:** `cloudflare/cloudflare` を追加。
- **認証:** 環境変数 `CLOUDFLARE_API_TOKEN` または `tfvars` 用の変数（secret に格納）。
- **モジュール例:** `terraform/modules/cloudflare-dns/` を新規作成し、以下を定義。
  - `data "cloudflare_zone" "zedi"` で zedi-note.app の zone_id を取得。
  - `cloudflare_record` で
    - 本番用: `@` と `www` の CNAME → CloudFront の `distribution_domain_name`（AWS 側の output を変数で受け取る）。
    - ACM 検証用: Terraform の `acm_certificate_domain_validation_options` を for で回して CNAME を作成（オプション。初回は手動で追加済みなら import も可）。

**注意:** Cloudflare のリソースは「AWS の Terraform state」とは別管理にするか、同じ state に入れるか選べます。同じ state に入れる場合は、AWS の CloudFront の output を Cloudflare モジュールに渡す形にすると、apply の順序で「先に AWS、後に Cloudflare」とできます。

### 3.2 パターン B: Cloudflare 専用のディレクトリで管理

- 例: `terraform-cloudflare/` を用意し、`provider "cloudflare"` のみ使用。
- AWS の CloudFront ドメイン名は、別途 `terraform output` や CI で取得して変数注入するか、データソースでは使わず「本番 CNAME のターゲット」を変数で渡す。

運用が分離しやすく、AWS と Cloudflare の apply を分けたい場合に向きます。

---

## 4. 実装タスク例（パターン A の場合）

| # | タスク | 内容 |
|---|--------|------|
| 1 | Cloudflare Provider 追加 | `terraform {}` に `cloudflare` を required_providers で追加。`provider "cloudflare"` で api_token を var または env から参照。 |
| 2 | ゾーン参照 | `data "cloudflare_zone" "zedi"` で domain = "zedi-note.app" の zone_id を取得。 |
| 3 | 本番 CNAME の作成 | `cloudflare_record` で `@` と `www` を CloudFront のドメイン名（変数で受け取り）に向ける。proxied は false（CloudFront の ACM を利用する場合）または true（Cloudflare プロキシ利用時）を選択。 |
| 4 | ACM 検証用 CNAME（任意） | 既存レコードを `terraform import` するか、Terraform で新規作成。新規作成する場合は AWS の `acm_certificate_domain_validation_options` を別モジュールの output から受け取り、for で `cloudflare_record` を並べる。ACM は 1 回発行すれば検証用 CNAME は不要になるため、既に手動で追加済みなら import のみでよい。 |
| 5 | 変数・Secret | `cloudflare_api_token` を変数化し、`.secret.env` や CI の Secrets で渡す。 |

---

## 5. 参考リンク

| リソース | URL |
|----------|-----|
| Cloudflare Provider (Terraform Registry) | https://registry.terraform.io/providers/cloudflare/cloudflare/latest |
| cloudflare_record リソース | https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/record |
| Cloudflare Terraform チュートリアル | https://developers.cloudflare.com/terraform/tutorial/ |

---

## 6. 次のアクション

1. 運用方針を決める: AWS と同じ state で管理するか、`terraform-cloudflare/` で分離するか。
2. Cloudflare API トークンを作成（DNS 編集権限があれば十分）。  
   [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) で「Edit zone DNS」権限のトークンを作成。
3. 上記タスク 1〜5 に沿って、まずは「本番 CNAME（@, www → CloudFront）」だけ Terraform で定義し、apply して動作確認する。
4. 必要なら ACM 検証用 CNAME を import して Terraform 管理下に含める（証明書は既に発行済みのため優先度は低い）。
