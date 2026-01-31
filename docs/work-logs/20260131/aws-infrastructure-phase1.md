# 作業ログ: AWS インフラ構築 Phase 1

**作業日:** 2026-01-31  
**作業者:** -  
**ステータス:** Phase 1 完了 ✅

---

## 1. 本日の作業サマリー

### 1.1 完了した作業

| # | 作業内容 | ステータス |
|---|----------|-----------|
| 1 | AWS初期セットアップガイド作成 | ✅ 完了 |
| 2 | Terraform Phase 1 (Networking) コード作成 | ✅ 完了 |
| 3 | Terraform init/validate/plan 実行 | ✅ 完了 |
| 4 | Terraform apply でAWSにデプロイ | ✅ 完了 |
| 5 | .gitignore にTerraform除外設定追加 | ✅ 完了 |
| 6 | Git コミット | ✅ 完了 |

### 1.2 作成・変更したファイル

```
zedi/
├── .gitignore                                    # 変更: Terraform除外設定追加
├── docs/
│   ├── guides/
│   │   └── aws-initial-setup-guide.md           # 新規: AWS初期設定ガイド
│   └── specs/
│       ├── realtime-collaboration-specification.md  # 既存（更新済み）
│       ├── aws-terraform-implementation-plan.md     # 既存（更新済み）
│       └── application-implementation-plan.md       # 既存
└── terraform/
    ├── backend.tf                               # 新規: S3バックエンド設定
    ├── main.tf                                  # 新規: メイン設定
    ├── variables.tf                             # 新規: 変数定義
    ├── outputs.tf                               # 新規: 出力定義
    ├── .terraform.lock.hcl                      # 自動生成: 依存関係ロック
    ├── environments/
    │   ├── dev.tfvars                           # 新規: 開発環境設定
    │   └── prod.tfvars                          # 新規: 本番環境設定
    └── modules/
        └── networking/
            ├── main.tf                          # 新規: VPC, Subnets, VPC Endpoints
            ├── variables.tf                     # 新規: モジュール変数
            └── outputs.tf                       # 新規: モジュール出力
```

---

## 2. デプロイ済みAWSリソース

### 2.1 リソース一覧

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| VPC | `vpc-04acab2235ceb032e` | CIDR: 10.0.0.0/16 |
| Internet Gateway | `igw-076739583e5f1da89` | - |
| Public Subnet | `subnet-0ab16cd5ece570673` | AZ: ap-northeast-1a, CIDR: 10.0.0.0/24 |
| Private Subnet | `subnet-01deac6f1dfdbc4c8` | AZ: ap-northeast-1a, CIDR: 10.0.100.0/24 |
| Public Route Table | `rtb-025ad386c6f035409` | 0.0.0.0/0 → IGW |
| Private Route Table | `rtb-05835561c545bb02e` | - |
| Security Group | `sg-0f73a9e5ed1b2acc1` | VPC Endpoints用 |
| VPC Endpoint (ECR API) | `vpce-02c3fc17b98cd3baa` | Interface型 |
| VPC Endpoint (ECR DKR) | `vpce-05d664ff12a432f7a` | Interface型 |
| VPC Endpoint (Logs) | `vpce-0a0875e507c6e3fd4` | Interface型 |
| VPC Endpoint (Secrets) | `vpce-00983f4896fd211ef` | Interface型 |
| VPC Endpoint (S3) | `vpce-07b0316e32b3180db` | Gateway型（無料） |

### 2.2 Terraform State

- **保存先:** `s3://zedi-terraform-state-590183877893/zedi/terraform.tfstate`
- **ロック:** `dynamodb://zedi-terraform-lock`
- **リソース数:** 14

---

## 3. AWS環境情報

```
AWS Account ID: 590183877893
Region: ap-northeast-1 (Tokyo)
Environment: dev
```

---

## 4. 関連ドキュメント

### 4.1 仕様書

| ドキュメント | パス | 内容 |
|-------------|------|------|
| リアルタイム同時編集仕様 | [docs/specs/realtime-collaboration-specification.md](../specs/realtime-collaboration-specification.md) | 全体アーキテクチャ、データフロー、API仕様 |
| Terraform実装計画 | [docs/specs/aws-terraform-implementation-plan.md](../specs/aws-terraform-implementation-plan.md) | 各モジュールの詳細設計、コスト試算 |
| アプリケーション実装計画 | [docs/specs/application-implementation-plan.md](../specs/application-implementation-plan.md) | Hocuspocusサーバー、クライアント実装 |

### 4.2 ガイド

| ドキュメント | パス | 内容 |
|-------------|------|------|
| AWS初期セットアップ | [docs/guides/aws-initial-setup-guide.md](../guides/aws-initial-setup-guide.md) | IAMユーザー作成、CLI設定、バックエンド準備 |

---

## 5. 今後の実装計画

### 5.1 Phase概要

| Phase | モジュール | 内容 | 推定時間 | ステータス |
|-------|-----------|------|----------|-----------|
| 1 | networking | VPC, Subnets, VPC Endpoints | 30分 | ✅ **完了** |
| 2 | security | Cognito, IAM Roles, WAF | 30分 | ⏳ 次回 |
| 3 | database | Aurora Serverless v2 | 20分 | ⏳ 未着手 |
| 4 | cache | ElastiCache Redis | 15分 | ⏳ 未着手 |
| 5 | realtime | ECS Fargate Spot, ALB | 45分 | ⏳ 未着手 |
| 6 | cdn | CloudFront, S3 | 20分 | ⏳ 未着手 |
| 7 | monitoring | CloudWatch Alarms, Dashboards | 15分 | ⏳ 未着手 |

### 5.2 Phase 2: Security モジュール（次回作業）

作成するファイル:
```
terraform/modules/security/
├── main.tf          # Cognito User Pool, IAM Roles
├── variables.tf     # モジュール変数
└── outputs.tf       # User Pool ID, Client ID など
```

主なリソース:
- Amazon Cognito User Pool（認証）
- Cognito User Pool Client
- IAM Role for ECS Task Execution
- IAM Role for ECS Task
- （オプション）WAF Web ACL

### 5.3 Phase 3-7 概要

**Phase 3: Database**
- Aurora Serverless v2 (PostgreSQL)
- DB Subnet Group
- Security Group
- Secrets Manager (DB credentials)

**Phase 4: Cache**
- ElastiCache Redis (cache.t4g.micro)
- Subnet Group
- Security Group

**Phase 5: Realtime**
- ECR Repository
- ECS Cluster
- ECS Task Definition
- ECS Service (Fargate Spot)
- Application Load Balancer
- Target Group (WebSocket対応)
- Security Groups

**Phase 6: CDN**
- S3 Bucket (Frontend hosting)
- CloudFront Distribution
- Origin Access Control
- （オプション）ACM Certificate

**Phase 7: Monitoring**
- CloudWatch Log Groups
- CloudWatch Alarms
- SNS Topic (通知)
- （オプション）CloudWatch Dashboard

---

## 6. 引き継ぎ事項

### 6.1 作業再開手順

```powershell
# 1. terraformディレクトリに移動
cd c:\Users\saedg\apps\zedi\terraform

# 2. Terraform実行（フルパスが必要）
$TF = "C:\Users\saedg\AppData\Local\Microsoft\WinGet\Packages\Hashicorp.Terraform_Microsoft.Winget.Source_8wekyb3d8bbwe\terraform.exe"

# 3. 現在の状態確認
& $TF show

# 4. 次のモジュール作成後
& $TF plan -var-file="environments/dev.tfvars"
& $TF apply -var-file="environments/dev.tfvars"
```

### 6.2 Terraformコマンド早見表

| コマンド | 用途 |
|----------|------|
| `terraform init` | 初期化（モジュール追加時に再実行） |
| `terraform validate` | 構文チェック |
| `terraform plan -var-file="environments/dev.tfvars"` | 変更プレビュー |
| `terraform apply -var-file="environments/dev.tfvars"` | 適用 |
| `terraform destroy -var-file="environments/dev.tfvars"` | 全削除（注意！） |
| `terraform state list` | 管理中リソース一覧 |
| `terraform output` | 出力値確認 |

### 6.3 注意事項

1. **Terraformパス問題**
   - `terraform`コマンドがPATHに通っていない
   - フルパスで実行: `C:\Users\saedg\AppData\Local\Microsoft\WinGet\Packages\Hashicorp.Terraform_Microsoft.Winget.Source_8wekyb3d8bbwe\terraform.exe`
   - または新しいPowerShellターミナルを開く（PATH反映）

2. **モジュール追加時**
   - `main.tf`のモジュール呼び出しをアンコメント
   - `terraform init`を再実行

3. **コスト管理**
   - VPC Endpoints: 約$14/月（Interface型4つ）
   - 今後追加されるリソースで約$76/月の予定
   - AWS Budgets でアラート設定済み（$100/月）

4. **セキュリティ**
   - アクセスキーは`~/.aws/credentials`に保存
   - tfvarsに機密情報を入れない（現在は問題なし）
   - `.terraform/`はGit除外済み

### 6.4 次回作業の開始方法

```powershell
# Phase 2 を開始する場合
# 1. モジュールファイル作成（後述のコード）
# 2. main.tf で security モジュールをアンコメント
# 3. terraform init
# 4. terraform plan -var-file="environments/dev.tfvars"
# 5. terraform apply -var-file="environments/dev.tfvars"
```

---

## 7. 参考情報

### 7.1 コスト内訳（予定）

| サービス | 月額コスト |
|----------|-----------|
| VPC Endpoints (4 Interface) | ~$14 |
| Aurora Serverless v2 (0.5-4 ACU) | ~$30 |
| ElastiCache (cache.t4g.micro) | ~$12 |
| ECS Fargate Spot | ~$8 |
| ALB | ~$16 |
| CloudFront | ~$1 |
| その他 (S3, CloudWatch等) | ~$5 |
| **合計** | **~$76/月** |

### 7.2 アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                    AWS Cloud (ap-northeast-1)                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  VPC: zedi-dev-vpc (10.0.0.0/16)                        │    │
│  │                                                         │    │
│  │  ┌─────────────────┐    ┌─────────────────┐            │    │
│  │  │  Public Subnet   │    │  Private Subnet  │            │    │
│  │  │  10.0.0.0/24    │    │  10.0.100.0/24  │            │    │
│  │  │                 │    │                 │            │    │
│  │  │  [ALB] ←────────┼────┼─→ [ECS Fargate] │  Phase 5   │    │
│  │  │  Phase 5        │    │     Phase 5     │            │    │
│  │  │                 │    │       ↓         │            │    │
│  │  └─────────────────┘    │  [Aurora]       │  Phase 3   │    │
│  │                         │  [Redis]        │  Phase 4   │    │
│  │                         │                 │            │    │
│  │  [VPC Endpoints] ←──────┤  ECR, Logs,     │  Phase 1 ✅│    │
│  │                         │  Secrets, S3    │            │    │
│  │                         └─────────────────┘            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [CloudFront] → [S3 Frontend]                      Phase 6      │
│  [Cognito]                                         Phase 2      │
│  [CloudWatch]                                      Phase 7      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. 変更履歴

| 日付 | 作業内容 | 担当 |
|------|----------|------|
| 2026-01-31 | Phase 1 (Networking) 完了 | - |

---

*このログは`docs/work-logs/20260131/aws-infrastructure-phase1.md`に保存されています。*
