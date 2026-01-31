# 作業ログ: AWS インフラ構築 Phase 3 - Database

**作業日:** 2026-01-31  
**作業者:** -  
**ステータス:** 完了 ✅

---

## 1. 作業サマリー

### 1.1 完了した作業

| # | 作業内容 | ステータス |
|---|----------|-----------|
| 1 | Database モジュール作成 | ✅ 完了 |
| 2 | 2AZ対応のためのネットワーク拡張 | ✅ 完了 |
| 3 | Aurora Serverless v2 クラスターデプロイ | ✅ 完了 |
| 4 | DB認証情報をSecrets Managerに保存 | ✅ 完了 |
| 5 | Parameter Group設定 | ✅ 完了 |

### 1.2 作成したファイル

```
terraform/modules/database/
├── main.tf          # Aurora Serverless v2
├── variables.tf     # モジュール変数
└── outputs.tf       # モジュール出力
```

---

## 2. デプロイ済みリソース

### 2.1 Aurora リソース

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| Aurora Cluster | `zedi-dev-cluster` | PostgreSQL 15.8, Serverless v2 |
| Aurora Instance | `zedi-dev-instance-1` | db.serverless |
| DB Subnet Group | `zedi-dev-db-subnet` | 2AZ対応 |
| Security Group | `sg-0f5413e30ba3c6def` | Aurora用 (Port 5432) |
| Secrets Manager | `zedi-dev-db-credentials` | DB認証情報 |
| Cluster Parameter Group | `zedi-dev-cluster-pg` | ログ設定 |
| DB Parameter Group | `zedi-dev-db-pg` | pg_stat_statements有効 |

### 2.2 追加されたNetworkingリソース（2AZ対応）

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| Public Subnet | `subnet-0dcc13c16c391f1bb` | AZ: ap-northeast-1c, CIDR: 10.0.1.0/24 |
| Private Subnet | `subnet-01ba74846537d514f` | AZ: ap-northeast-1c, CIDR: 10.0.101.0/24 |

---

## 3. Terraform 出力値

```hcl
aurora_cluster_endpoint    = "zedi-dev-cluster.cluster-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com"
aurora_reader_endpoint     = "zedi-dev-cluster.cluster-ro-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com"
aurora_database_name       = "zedi"
db_credentials_secret_arn  = "arn:aws:secretsmanager:ap-northeast-1:590183877893:secret:zedi-dev-db-credentials-x1aCah"
```

---

## 4. 設定詳細

### 4.1 Aurora Serverless v2 設定

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

## 6. DB接続情報の取得方法

```bash
# AWS CLIでSecrets Managerから認証情報を取得
aws secretsmanager get-secret-value \
  --secret-id zedi-dev-db-credentials \
  --query SecretString \
  --output text | jq .
```

---

## 7. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Phase 2 作業ログ | [aws-infrastructure-phase2-security.md](./aws-infrastructure-phase2-security.md) |
| Phase 4 作業ログ | [aws-infrastructure-phase4-cache.md](./aws-infrastructure-phase4-cache.md) |

---

*作成日: 2026-01-31*
