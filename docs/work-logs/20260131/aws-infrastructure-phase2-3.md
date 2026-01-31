# 作業ログ: AWS インフラ構築 Phase 2-4

**作業日:** 2026-01-31  
**作業者:** -  
**ステータス:** Phase 2-4 完了 ✅

---

## 1. 本日の作業サマリー

### 1.1 完了した作業

| # | 作業内容 | ステータス |
|---|----------|-----------|
| 1 | Phase 2: Security モジュール作成 | ✅ 完了 |
| 2 | Cognito User Pool デプロイ | ✅ 完了 |
| 3 | ECS用 IAM Roles デプロイ | ✅ 完了 |
| 4 | Phase 3: Database モジュール作成 | ✅ 完了 |
| 5 | Aurora Serverless v2 デプロイ | ✅ 完了 |
| 6 | 2AZ対応のためのネットワーク拡張 | ✅ 完了 |
| 7 | Phase 4: Cache モジュール作成 | ✅ 完了 |
| 8 | ElastiCache Redis デプロイ | ✅ 完了 |

### 1.2 作成・変更したファイル

```
zedi/
├── terraform/
│   ├── main.tf                              # 変更: security, database, cache モジュール有効化
│   ├── variables.tf                         # 変更: Cognito変数追加
│   ├── outputs.tf                           # 変更: Security, Database, Cache出力追加
│   ├── .terraform.lock.hcl                  # 変更: random provider追加
│   ├── environments/
│   │   └── dev.tfvars                       # 変更: 2AZ対応、Cognito URL設定
│   └── modules/
│       ├── security/                        # 新規ディレクトリ
│       │   ├── main.tf                      # Cognito, IAM Roles
│       │   ├── variables.tf                 # モジュール変数
│       │   └── outputs.tf                   # モジュール出力
│       ├── database/                        # 新規ディレクトリ
│       │   ├── main.tf                      # Aurora Serverless v2
│       │   ├── variables.tf                 # モジュール変数
│       │   └── outputs.tf                   # モジュール出力
│       └── cache/                           # 新規ディレクトリ
│           ├── main.tf                      # ElastiCache Redis
│           ├── variables.tf                 # モジュール変数
│           └── outputs.tf                   # モジュール出力
└── docs/
    └── work-logs/
        └── 20260131/
            └── aws-infrastructure-phase2-3.md  # 本ドキュメント
```

---

## 2. デプロイ済みAWSリソース

### 2.1 Phase 2: Security リソース

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| Cognito User Pool | `ap-northeast-1_Q5fQJZkgd` | ユーザー認証用 |
| Cognito Client | `3oace2ln47tv6btvftfkkt5qm1` | Web SPA用クライアント |
| Cognito Domain | `zedi-dev-590183877893` | Hosted UI用ドメイン |
| IAM Role | `zedi-dev-ecs-execution-role` | ECSタスク実行ロール |
| IAM Role | `zedi-dev-ecs-task-role` | ECSタスクロール |
| IAM Policy | `zedi-dev-ecs-execution-secrets` | Secrets Manager アクセス |
| IAM Policy | `zedi-dev-ecs-task-s3` | S3 アクセス |
| IAM Policy | `zedi-dev-ecs-task-logs` | CloudWatch Logs アクセス |
| IAM Policy | `zedi-dev-ecs-task-ssm` | SSM Parameter Store アクセス |

### 2.2 Phase 3: Database リソース

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| Aurora Cluster | `zedi-dev-cluster` | PostgreSQL 15.8, Serverless v2 |
| Aurora Instance | `zedi-dev-instance-1` | db.serverless |
| DB Subnet Group | `zedi-dev-db-subnet` | 2AZ対応 |
| Security Group | `sg-0f5413e30ba3c6def` | Aurora用 (Port 5432) |
| Secrets Manager | `zedi-dev-db-credentials` | DB認証情報 |
| Cluster Parameter Group | `zedi-dev-cluster-pg` | ログ設定 |
| DB Parameter Group | `zedi-dev-db-pg` | pg_stat_statements有効 |

### 2.3 追加されたNetworkingリソース（2AZ対応）

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| Public Subnet | `subnet-0dcc13c16c391f1bb` | AZ: ap-northeast-1c, CIDR: 10.0.1.0/24 |
| Private Subnet | `subnet-01ba74846537d514f` | AZ: ap-northeast-1c, CIDR: 10.0.101.0/24 |

### 2.4 Phase 4: Cache リソース

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| ElastiCache Replication Group | `zedi-dev-redis` | Redis 7.1, cache.t4g.micro |
| ElastiCache Subnet Group | `zedi-dev-redis-subnet` | 2AZ対応 |
| Security Group | `sg-001777c1d2975c56b` | Redis用 (Port 6379) |
| Parameter Group | `zedi-dev-redis-pg` | redis7 family |
| CloudWatch Log Group | `/aws/elasticache/zedi-dev/slow-log` | スロークエリログ |
| CloudWatch Log Group | `/aws/elasticache/zedi-dev/engine-log` | エンジンログ |

---

## 3. Terraform 出力値

```
aurora_cluster_endpoint    = "zedi-dev-cluster.cluster-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com"
aurora_reader_endpoint     = "zedi-dev-cluster.cluster-ro-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com"
aurora_database_name       = "zedi"
db_credentials_secret_arn  = "arn:aws:secretsmanager:ap-northeast-1:590183877893:secret:zedi-dev-db-credentials-x1aCah"

cognito_user_pool_id       = "ap-northeast-1_Q5fQJZkgd"
cognito_client_id          = "3oace2ln47tv6btvftfkkt5qm1"
cognito_user_pool_endpoint = "cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_Q5fQJZkgd"
cognito_hosted_ui_url      = "https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com"

ecs_execution_role_arn     = "arn:aws:iam::590183877893:role/zedi-dev-ecs-execution-role"
ecs_task_role_arn          = "arn:aws:iam::590183877893:role/zedi-dev-ecs-task-role"

redis_endpoint             = "master.zedi-dev-redis.rllaew.apne1.cache.amazonaws.com"
redis_connection_string    = "rediss://master.zedi-dev-redis.rllaew.apne1.cache.amazonaws.com:6379"

vpc_id                     = "vpc-04acab2235ceb032e"
public_subnet_ids          = ["subnet-0ab16cd5ece570673", "subnet-0dcc13c16c391f1bb"]
private_subnet_ids         = ["subnet-01deac6f1dfdbc4c8", "subnet-01ba74846537d514f"]
```

---

## 4. 設定詳細

### 4.1 Cognito設定

| 設定項目 | 値 |
|----------|-----|
| ユーザー名属性 | メールアドレス |
| MFA | オプション (TOTP) |
| パスワードポリシー | 8文字以上、大小英字・数字・記号必須 |
| コールバックURL | `http://localhost:30000/callback`, `http://localhost:30000/auth/callback` |
| ログアウトURL | `http://localhost:30000` |
| アクセストークン有効期限 | 1時間 |
| リフレッシュトークン有効期限 | 30日 |

### 4.2 Aurora Serverless v2 設定

| 設定項目 | 値 |
|----------|-----|
| エンジン | Aurora PostgreSQL 15.8 |
| スケーリング | 0.5 - 4 ACU |
| データベース名 | zedi |
| マスターユーザー | zedi_admin |
| バックアップ保持期間 | 7日 |
| バックアップウィンドウ | 03:00-04:00 UTC (12:00-13:00 JST) |
| メンテナンスウィンドウ | 日曜 04:00-05:00 UTC (13:00-14:00 JST) |
| 暗号化 | 有効 (AWS管理キー) |
| Performance Insights | 有効 (7日間保持) |
| IAM認証 | 有効 |
| Data API | 有効 |

### 4.3 ElastiCache Redis 設定

| 設定項目 | 値 |
|----------|-----|
| エンジン | Redis 7.1 |
| ノードタイプ | cache.t4g.micro (Graviton2) |
| ノード数 | 1 |
| ポート | 6379 |
| 暗号化(転送中) | 有効 (TLS) |
| 暗号化(保存時) | 有効 |
| メモリポリシー | allkeys-lru |
| メンテナンスウィンドウ | 日曜 05:00-06:00 UTC (14:00-15:00 JST) |
| スナップショットウィンドウ | 04:00-05:00 UTC (13:00-14:00 JST) |
| スナップショット保持期間 | 1日 |
| ログ出力 | CloudWatch Logs (slow-log, engine-log) |

---

## 5. 問題と解決策

### 5.1 Aurora 最低2AZ要件

**問題:** Aurora Serverless v2のDB Subnet Groupは最低2つのAZが必要

**エラーメッセージ:**
```
DBSubnetGroupDoesNotCoverEnoughAZs: The DB subnet group doesn't meet 
Availability Zone (AZ) coverage requirement. Current AZ coverage: ap-northeast-1a. 
Add subnets to cover at least 2 AZs.
```

**解決策:** `dev.tfvars`のavailability_zonesを1AZから2AZに変更
```hcl
# Before
availability_zones = ["ap-northeast-1a"]

# After
availability_zones = ["ap-northeast-1a", "ap-northeast-1c"]
```

### 5.2 Aurora PostgreSQL バージョン

**問題:** PostgreSQL 15.4がAurora Serverless v2で利用不可

**エラーメッセージ:**
```
InvalidParameterCombination: Cannot find version 15.4 for aurora-postgresql
```

**解決策:** エンジンバージョンを15.8に変更
```hcl
# Before
engine_version = "15.4"

# After
engine_version = "15.8"
```

---

## 6. 今後の実装計画

### 6.1 Phase概要

| Phase | モジュール | 内容 | ステータス |
|-------|-----------|------|-----------|
| 1 | networking | VPC, Subnets, VPC Endpoints | ✅ 完了 |
| 2 | security | Cognito, IAM Roles | ✅ 完了 |
| 3 | database | Aurora Serverless v2 | ✅ 完了 |
| 4 | cache | ElastiCache Redis | ✅ **完了** |
| 5 | realtime | ECS Fargate Spot, ALB | ⏳ 次回 |
| 6 | cdn | CloudFront, S3 | ⏳ 未着手 |
| 7 | monitoring | CloudWatch Alarms, Dashboards | ⏳ 未着手 |

### 6.2 Phase 5: Realtime モジュール（次回作業）

作成するファイル:
```
terraform/modules/realtime/
├── main.tf          # ECS Cluster, Service, Task Definition, ALB
├── variables.tf     # モジュール変数
└── outputs.tf       # ALB DNS name など
```

主なリソース:
- ECS Cluster
- ECS Service (Fargate Spot)
- ECS Task Definition
- Application Load Balancer (ALB)
- Target Group
- ALB Listener
- ECR Repository
- Security Groups

---

## 7. 引き継ぎ事項

### 7.1 作業再開手順

```powershell
# 1. terraformディレクトリに移動
cd c:\Users\saedg\apps\zedi\terraform

# 2. Terraform実行（フルパスが必要）
$TF = "C:\Users\saedg\AppData\Local\Microsoft\WinGet\Packages\Hashicorp.Terraform_Microsoft.Winget.Source_8wekyb3d8bbwe\terraform.exe"

# 3. 現在の状態確認
& $TF show
& $TF output

# 4. 次のモジュール作成後
& $TF init
& $TF plan -var-file="environments/dev.tfvars"
& $TF apply -var-file="environments/dev.tfvars"
```

### 7.2 DB接続情報の取得方法

```bash
# AWS CLIでSecrets Managerから認証情報を取得
aws secretsmanager get-secret-value \
  --secret-id zedi-dev-db-credentials \
  --query SecretString \
  --output text | jq .
```

### 7.3 Cognito設定値（アプリケーション用）

```env
# .env に設定する値
VITE_AWS_REGION=ap-northeast-1
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_Q5fQJZkgd
VITE_COGNITO_CLIENT_ID=3oace2ln47tv6btvftfkkt5qm1
```

---

## 8. コスト情報

### 8.1 現在のリソースコスト（月額推定）

| サービス | リソース | 月額コスト |
|----------|----------|-----------|
| VPC Endpoints | Interface型 x 4 | ~$14 |
| Aurora Serverless v2 | 0.5-4 ACU | ~$25-30 |
| Cognito | User Pool | 無料（50,000 MAUまで） |
| Secrets Manager | 1シークレット | ~$0.40 |
| **小計** | | **~$40-45/月** |

### 8.2 残りのPhaseで追加予定

| サービス | 月額コスト |
|----------|-----------|
| ElastiCache (cache.t4g.micro) | ~$12 |
| ECS Fargate Spot | ~$8 |
| ALB | ~$16 |
| CloudFront | ~$1 |
| CloudWatch | ~$3 |
| **追加小計** | **~$40/月** |
| **合計（全Phase完了後）** | **~$76/月** |

---

## 9. アーキテクチャ図（現在の状態）

```
┌─────────────────────────────────────────────────────────────────┐
│                    AWS Cloud (ap-northeast-1)                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  VPC: zedi-dev-vpc (10.0.0.0/16)                        │    │
│  │                                                         │    │
│  │  ┌──────────────────────┐  ┌──────────────────────┐    │    │
│  │  │  Public Subnets      │  │  Private Subnets     │    │    │
│  │  │  10.0.0.0/24 (1a)    │  │  10.0.100.0/24 (1a)  │    │    │
│  │  │  10.0.1.0/24 (1c)    │  │  10.0.101.0/24 (1c)  │    │    │
│  │  │                      │  │                      │    │    │
│  │  │  [ALB] ←─────────────┼──┼─→ [ECS Fargate]      │    │    │
│  │  │  (Phase 5)           │  │     (Phase 5)        │    │    │
│  │  │                      │  │        ↓             │    │    │
│  │  └──────────────────────┘  │  ┌─────────────┐     │    │    │
│  │                            │  │ Aurora ✅   │     │    │    │
│  │                            │  │ PostgreSQL  │     │    │    │
│  │                            │  │ 15.8        │     │    │    │
│  │                            │  └─────────────┘     │    │    │
│  │                            │  ┌─────────────┐     │    │    │
│  │                            │  │ Redis ✅    │     │    │    │
│  │  [VPC Endpoints] ✅ ←──────┤  │ 7.1         │     │    │    │
│  │                            │  └─────────────┘     │    │    │
│  │                            └──────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ Cognito ✅      │  │ Secrets Manager │                       │
│  │ User Pool       │  │ DB Credentials  │                       │
│  └─────────────────┘  └─────────────────┘                       │
│                                                                  │
│  [CloudFront] → [S3 Frontend]                      (Phase 6)    │
│  [CloudWatch Alarms/Dashboards]                    (Phase 7)    │
└─────────────────────────────────────────────────────────────────┘

✅ = デプロイ済み
```

---

## 10. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Phase 1 作業ログ | [aws-infrastructure-phase1.md](./aws-infrastructure-phase1.md) |
| リアルタイム同時編集仕様 | [../specs/realtime-collaboration-specification.md](../specs/realtime-collaboration-specification.md) |
| Terraform実装計画 | [../specs/aws-terraform-implementation-plan.md](../specs/aws-terraform-implementation-plan.md) |
| アプリケーション実装計画 | [../specs/application-implementation-plan.md](../specs/application-implementation-plan.md) |
| AWS初期セットアップ | [../guides/aws-initial-setup-guide.md](../guides/aws-initial-setup-guide.md) |

---

## 11. 変更履歴

| 日付 | 作業内容 | 担当 |
|------|----------|------|
| 2026-01-31 | Phase 1 (Networking) 完了 | - |
| 2026-01-31 | Phase 2 (Security) 完了 | - |
| 2026-01-31 | Phase 3 (Database) 完了 | - |
| 2026-01-31 | Phase 4 (Cache) 完了 | - |

---

*このログは`docs/work-logs/20260131/aws-infrastructure-phase2-3.md`に保存されています。*
