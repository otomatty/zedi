# AWS VPC・RDS コスト調査レポート

**日付:** 2026-02-10  
**対象:** 開発中アプリの AWS インフラ（VPC / RDS）  
**根拠:** Terraform コード・tfvars・AWS 公式料金・ドキュメント

---

## 1. 概要

Terraform と環境別 tfvars を確認した結果、**VPC** と **RDS（Aurora Serverless v2）** の主なコスト要因と、削減の余地を整理しました。

| 領域 | 主なコスト要因 | 削減の余地 |
|------|----------------|------------|
| **VPC** | Interface エンドポイント 4 本の時間課金 | 開発ではエンドポイント削減 or スケールゼロと組み合わせ |
| **RDS** | Aurora が常時 0.5 ACU 以上で稼働（スケールゼロ未使用） | **min_capacity=0 + 自動ポーズ** で開発時コスト削減可能 |

---

## 2. VPC コストの内訳と問題点

### 2.1 現在の構成（`terraform/modules/networking/main.tf`）

- **VPC 本体**: 無料（CIDR 10.0.0.0/16、2 AZ）
- **サブネット**: 無料（public 2 + private 2）
- **Internet Gateway**: 無料
- **VPC Endpoints**（`enable_vpc_endpoints = true` 時）:
  - **Interface エンドポイント（有料）**: 4 本
    - ECR API
    - ECR DKR
    - CloudWatch Logs
    - Secrets Manager
  - **Gateway エンドポイント**: S3（無料）

### 2.2 コストがかかる理由

- **Interface エンドポイント**は「1 エンドポイントあたり × 稼働時間」で課金されます。
- 各エンドポイントは **2 AZ（ap-northeast-1a / 1c）のサブネットに ENI を 1 つずつ**持つため、AZ 数に応じた料金になります。
- 東京リージョン（ap-northeast-1）の目安:
  - 約 **$0.01/時間/エンドポイント**（AZ あたりなどの細則は AWS 料金ページで要確認）
  - 4 エンドポイント × 730 時間 ≒ **約 $29/月以上**（データ処理料は別）

つまり、「NAT Gateway をやめて VPC Endpoints にしている」構成は正しいが、**Interface エンドポイントを 4 本フルで 24 時間稼働**させていることが、VPC まわりの主なコスト要因です。

### 2.3 問題になり得る点

1. **開発環境でも本番と同じ 4 本が常時 ON**  
   - 開発時だけ ECR/Logs/Secrets Manager のうち「本当に必要なもの」に減らすと、VPC まわりを削減できる余地がある。
2. **NAT Gateway は使っていない**  
   - コメントの通り NAT をやめて Endpoint にしているため、NAT による $32/月程度はかかっていない。ここは適切。

---

## 3. RDS（Aurora Serverless v2）コストの内訳と問題点

### 3.1 現在の構成（Terraform / tfvars）

- **エンジン**: Aurora PostgreSQL 15.8（Serverless v2 対応）
- **dev**: `aurora_min_capacity = 0.5`, `aurora_max_capacity = 4`
- **prod**: `aurora_min_capacity = 0.5`, `aurora_max_capacity = 8`
- **インスタンス数**: デフォルト 1（`instance_count = 1`）

### 3.2 コストがかかる理由

- **Aurora Serverless v2 は、min_capacity を 0.5 にしている限り「スケールゼロ」しない**  
  - 常に **最低 0.5 ACU** で稼働し、その分のコンピュート料金が 24 時間発生します。
- dev.tfvars のコメントに「Minimum ACU (scales to zero when idle)」とあるが、**現状の設定（min=0.5）ではアイドル時も 0.5 ACU で課金**されます。
- 東京リージョン目安: 0.5 ACU × 約 $0.12/ACU-hour × 730 時間 ≒ **約 $44/月**（コンピュートのみ。ストレージ・バックアップは別）

つまり「RDS にコストがかかっている」主因は、**開発・本番ともに min_capacity=0.5 のまま 24 時間起動している**ことです。

### 3.3 重要なポイント: スケールゼロ（Scale to Zero）が利用可能

- **Aurora Serverless v2 は 2024 年から「Scale to Zero」（0 ACU + 自動ポーズ/再開）」をサポート**しています。
- 要件:
  - **エンジンバージョン**: Aurora PostgreSQL 15.7+（現在 15.8 のため **要件は満たしている**）
  - **min_capacity = 0** に設定
  - **seconds_until_auto_pause** でアイドル時間（例: 300〜86400 秒）を指定
- 0 ACU に縮小すると **コンピュート料金は発生せず**、ストレージ料金のみ継続。再接続時に約 15 秒で再開します。
- 開発・検証環境では、この「0 ACU + 自動ポーズ」を有効にすると RDS コストを大きく削減できます。

### 3.4 現在の Terraform の制約

- **`terraform/modules/database/variables.tf`** の `min_capacity` の validation が **0.5 以上** に固定されているため、**min_capacity = 0 を指定できません**。
- **`serverlessv2_scaling_configuration`** に **`seconds_until_auto_pause`** が未定義のため、0 にしても「いつポーズするか」を制御できません。
- AWS Provider 5.x（ロックファイルでは 5.100.0）では、`min_capacity = 0` と `seconds_until_auto_pause` の利用がサポートされています。

---

## 4. まとめ: 何が問題か

| 問題 | 内容 | 影響 |
|------|------|------|
| **RDS** | min_capacity=0.5 のためスケールゼロしておらず、24 時間 0.5 ACU 課金 | 開発環境でも月 $40 前後のコンピュート料金が発生 |
| **RDS** | Terraform の validation で min_capacity=0 が禁止されている | スケールゼロをコードで有効化できない |
| **RDS** | seconds_until_auto_pause が未設定 | 0 にしても自動ポーズの挙動を定義できない |
| **VPC** | Interface エンドポイント 4 本を常時稼働 | 月 $30 前後（目安）の VPC まわりコスト |
| **認識** | dev のコメント「scales to zero when idle」| 現設定ではスケールゼロしていないため誤解を招く |

---

## 5. 推奨アクション（コスト削減）

### 5.1 RDS（Aurora）の削減

1. **開発環境で Scale to Zero を有効にする**
   - `aurora_min_capacity = 0`（dev のみ）
   - `seconds_until_auto_pause` を追加（例: 600 秒 = 10 分）
   - 本番は可用性のため `min_capacity = 0.5` 以上を維持する想定で検討
2. **Terraform の修正**
   - `modules/database/variables.tf`: `min_capacity` の validation を **0 以上** に変更（例: `>= 0 && <= 128`）
   - `modules/database/main.tf`: `serverlessv2_scaling_configuration` に `seconds_until_auto_pause` を追加（変数化し、0 のときは null など）
   - ルート `variables.tf` と `environments/dev.tfvars`: `aurora_min_capacity = 0` と `aurora_seconds_until_auto_pause = 600` などを設定

※ Performance Insights は 0 ACU 時はデータ取得されません。開発では 7 日保持は無料枠のため、必要に応じて 2 ACU 以上に上げる運用も検討してください。

### 5.2 VPC の削減（オプション）

- **開発環境**で、使わない Interface エンドポイントを切る選択肢があります。
  - 例: ECR のみ必要で Logs/Secrets Manager を外す場合、モジュールを「エンドポイント単位で有効/無効」できる変数に拡張する。
- 削減する場合は、**Private サブネットから AWS API へ出る経路**（NAT なしで済むか、Lambda のみか ECS のみか）を整理したうえで、必要なエンドポイントだけ有効にすると安全です。

---

## 6. AWS CLI での確認結果（2026-02-10 実行）

### 6.1 VPC エンドポイント（ap-northeast-1）

| Service | Type | State | Environment |
|---------|------|-------|-------------|
| s3 | Gateway | available | dev |
| logs | **Interface** | available | dev |
| secretsmanager | **Interface** | available | dev |
| ecr.api | **Interface** | available | dev |
| ecr.dkr | **Interface** | available | dev |
| s3 | Gateway | available | prod |
| ecr.api | **Interface** | available | prod |
| logs | **Interface** | available | prod |
| ecr.dkr | **Interface** | available | prod |
| secretsmanager | **Interface** | available | prod |

- **dev**: Interface 4 本 + Gateway 1（S3 無料）→ 有料 4 本
- **prod**: 同様に Interface 4 本 + Gateway 1 → 有料 4 本
- **合計**: 有料 Interface エンドポイント **8 本**（dev 4 + prod 4）が常時 available

### 6.2 Aurora クラスター（ap-northeast-1）

| DBClusterIdentifier | EngineVersion | MinCapacity | MaxCapacity | Status |
|---------------------|---------------|-------------|-------------|--------|
| zedi-dev-cluster | 15.8 | **0.5** | 4.0 | available |
| zedi-prod-cluster | 15.8 | **0.5** | 8.0 | available |

- 両クラスターとも **MinCapacity=0.5** のためスケールゼロしていない
- 両方 **available**（24 時間稼働）でコンピュート課金が発生

### 6.3 確認に使ったコマンド

```bash
# リージョン指定（東京）
export AWS_REGION=ap-northeast-1

# VPC エンドポイント一覧（環境タグ付き）
aws ec2 describe-vpc-endpoints --region $AWS_REGION \
  --filters "Name=tag:Project,Values=zedi" \
  --query "VpcEndpoints[*].{Service:ServiceName,Type:VpcEndpointType,State:State,VpcId:VpcId,Tags:Tags[?Key=='Environment'].Value|[0]}" --output table

# Aurora クラスターのスケーリング設定
aws rds describe-db-clusters --region $AWS_REGION \
  --query "DBClusters[?contains(DBClusterIdentifier,'zedi')].{Id:DBClusterIdentifier,Status:Status,Min:ServerlessV2ScalingConfiguration.MinCapacity,Max:ServerlessV2ScalingConfiguration.MaxCapacity}" --output table
```

実際の課金は **Cost Explorer** で確認してください。

---

## 8. dev の `terraform plan -var-file=environments/dev.tfvars` 結果（要約）

**実行条件:** workspace `default`（dev）、`terraform plan -var-file=environments/dev.tfvars`

**Plan サマリ:** **24 to add, 6 to change, 3 to destroy**

### 8.1 追加されるリソース（24）

| モジュール | 内容 |
|------------|------|
| **module.api** | REST API 一式が state にないため「追加」として検出: API Gateway HTTP API（main, JWT authorizer, integration）、ルート（/api, /api/{proxy+}, GET /api/health）、Stage、Lambda（IAM role, DB/S3 用ポリシー, function）、S3 media バケット、API Gateway ↔ Lambda の permission。dev で API が後からコードに追加され、一度も apply されていないか、別 workspace で管理されている想定。 |
| **module.cdn** | CDN 一式が state にないため「追加」: CloudFront Origin Access Control、S3 フロント用バケット（zedi-dev-frontend-*）、bucket policy・public access block・versioning（Disabled）、CloudFront 配布など。dev で CDN をまだ apply していない想定。 |

### 8.2 変更されるリソース（6）

| リソース | 内容 |
|----------|------|
| **module.cognito_github_proxy[0].aws_lambda_function.main** | 環境変数（GITHUB_CLIENT_SECRET など）の再評価（sensitive のため内容は表示されない）。 |
| **module.database.aws_db_parameter_group.main** | `shared_preload_libraries` の `apply_method` が `pending-reboot` → `immediate` に変更（値は `pg_stat_statements` のまま）。Terraform の表現差。 |
| **module.security.aws_cognito_user_pool_client.web** | `supported_identity_providers` の更新（IdP 削除・再作成に伴う変更の可能性）。 |
| **module.security.aws_iam_role_policy.ecs_execution_secrets** | ポリシー JSON の記述差（`zedi-dev-*` のワイルドカード等）。 |
| **module.security.aws_iam_role_policy.ecs_task_logs** | 同上（log-group の ARN 表記）。 |
| **module.security.aws_iam_role_policy.ecs_task_ssm** | 同上（SSM parameter path）。 |

### 8.3 削除されるリソース（3）

| リソース | 理由 |
|----------|------|
| **module.security.aws_cognito_identity_provider.github[0]** | 「index [0] is out of range for count」— security モジュールの IdP が `count` から `for_each` 等に変わったか、条件付きでインデックスが変わっており、既存の GitHub IdP が state 上で削除対象になっている。 |
| **module.security.aws_cognito_identity_provider.google[0]** | 同上、Google IdP。 |
| **module.security.aws_cognito_user_pool_domain.main** | **replace**（削除＋作成）。`domain` が "forces replacement" と出ているため、同一ドメイン名でもリソースの作り直しとして検出されている可能性。Cognito の Hosted UI ドメイン（zedi-dev-590183877893）に影響するため、apply 前に確認推奨。 |

### 8.4 注意点

- **Cognito User Pool Domain の replace**: ドメイン名が変わる、または同じでも作り直しになると、Hosted UI の URL が変わり、アプリの callback URL やドキュメントの更新が必要になる可能性あり。
- **API / CDN の 24 追加**: dev でまだ API や CDN を apply していない場合は、これらを追加するための変更。意図どおりであれば apply で dev 環境がコードと揃う。

### 8.5 セキュリティモジュールの IdP 定義と state の関係（調査結果）

**結論: IdP の「3 破壊」は、plan 実行時にシークレット未読み込みで count が 0 と評価されることが原因。コードと state の不整合ではない。**

| 項目 | 内容 |
|------|------|
| **定義** | `modules/security/main.tf` で Google / GitHub は `count` で制御。Google: `var.google_client_id != "" && var.google_client_secret != "" ? 1 : 0`。GitHub: `var.enable_github_idp && var.github_client_id != "" && var.github_client_secret != "" ? 1 : 0`。 |
| **渡し方** | ルート `main.tf` から `var.google_oauth_client_*` / `var.github_oauth_client_*` を security に渡している。シークレットは tfvars に書かず `TF_VAR_*`（例: `environments/dev.secret.env`）で渡す想定。 |
| **state** | default (dev) workspace の state に `module.security.aws_cognito_identity_provider.google[0]` と `github[0]` が存在する。 |
| **plan で destroy になる理由** | `terraform plan -var-file=environments/dev.tfvars` だけだと、`TF_VAR_google_oauth_client_secret` / `TF_VAR_github_oauth_client_secret` が未設定で空。security 内で `var.*_client_secret != ""` が false になり、**count が 0**。state には [0] があるため「index [0] is out of range for count」となり削除計画になる。 |
| **推奨** | dev の plan/apply 時は **必ず `source environments/dev.secret.env`（または同等）でシークレットを読み込んでから** 実行する。シークレットを読み込めば count=1 となり、IdP は削除されない。 |

### 8.6 dev / prod のコスト最適化の適用状況（2026-02-10 作業後）

| 環境 | Aurora スケールゼロ | 備考 |
|------|---------------------|------|
| **dev** | **適用済み** | `zedi-dev-cluster`: Min=0, SecondsUntilAutoPause=600。加えて DB parameter group と Cognito IdP（Google/GitHub）の in-place 更新を適用済み。plan は `source environments/dev.secret.env` 読み込み後に実行すると **0 destroy**（23 add は API/CDN が state にないため）。 |
| **prod** | **適用済み** | `zedi-prod-cluster`: Min=0, SecondsUntilAutoPause=600。prod workspace で `-target=module.database.aws_rds_cluster.main` を apply 済み。本番も 10 分アイドルで自動ポーズされコンピュート料金が削減される。 |

### 8.7 実行コマンド（参照）

```bash
cd terraform
terraform workspace select default   # dev
# シークレットを読み込んでから plan（IdP の誤った destroy を防ぐ）
source environments/dev.secret.env   # または . envs/dev.secret.env
terraform plan -var-file=environments/dev.tfvars
```

---

## 7. 参照リンク

- [Aurora Serverless v2 スケールゼロ（自動ポーズ/再開）](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)
- [Introducing scaling to 0 capacity with Amazon Aurora Serverless v2](https://aws.amazon.com/blogs/database/introducing-scaling-to-0-capacity-with-amazon-aurora-serverless-v2/)
- [Amazon VPC 料金](https://aws.amazon.com/vpc/pricing/)
- [AWS PrivateLink 料金](https://aws.amazon.com/privatelink/pricing/)
