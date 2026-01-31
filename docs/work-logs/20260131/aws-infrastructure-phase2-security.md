# 作業ログ: AWS インフラ構築 Phase 2 - Security

**作業日:** 2026-01-31  
**作業者:** -  
**ステータス:** 完了 ✅

---

## 1. 作業サマリー

### 1.1 完了した作業

| # | 作業内容 | ステータス |
|---|----------|-----------|
| 1 | Security モジュール作成 | ✅ 完了 |
| 2 | Cognito User Pool デプロイ | ✅ 完了 |
| 3 | Cognito App Client 作成 | ✅ 完了 |
| 4 | Cognito Hosted UI ドメイン設定 | ✅ 完了 |
| 5 | ECS用 IAM Execution Role デプロイ | ✅ 完了 |
| 6 | ECS用 IAM Task Role デプロイ | ✅ 完了 |

### 1.2 作成したファイル

```
terraform/modules/security/
├── main.tf          # Cognito User Pool, IAM Roles
├── variables.tf     # モジュール変数
└── outputs.tf       # モジュール出力
```

---

## 2. デプロイ済みリソース

### 2.1 Cognito リソース

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| User Pool | `ap-northeast-1_Q5fQJZkgd` | ユーザー認証用 |
| App Client | `3oace2ln47tv6btvftfkkt5qm1` | Web SPA用クライアント |
| Domain | `zedi-dev-590183877893` | Hosted UI用ドメイン |

### 2.2 IAM リソース

| リソースタイプ | 名前 | 用途 |
|---------------|------|------|
| IAM Role | `zedi-dev-ecs-execution-role` | ECSタスク実行ロール |
| IAM Role | `zedi-dev-ecs-task-role` | ECSタスクロール |
| IAM Policy | `zedi-dev-ecs-execution-secrets` | Secrets Manager アクセス |
| IAM Policy | `zedi-dev-ecs-task-s3` | S3 アクセス |
| IAM Policy | `zedi-dev-ecs-task-logs` | CloudWatch Logs アクセス |
| IAM Policy | `zedi-dev-ecs-task-ssm` | SSM Parameter Store アクセス |

---

## 3. Terraform 出力値

```hcl
cognito_user_pool_id       = "ap-northeast-1_Q5fQJZkgd"
cognito_client_id          = "3oace2ln47tv6btvftfkkt5qm1"
cognito_user_pool_endpoint = "cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_Q5fQJZkgd"
cognito_hosted_ui_url      = "https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com"

ecs_execution_role_arn     = "arn:aws:iam::590183877893:role/zedi-dev-ecs-execution-role"
ecs_task_role_arn          = "arn:aws:iam::590183877893:role/zedi-dev-ecs-task-role"
```

---

## 4. 設定詳細

### 4.1 Cognito User Pool 設定

| 設定項目 | 値 |
|----------|-----|
| ユーザー名属性 | メールアドレス |
| MFA | オプション (TOTP) |
| パスワードポリシー | 8文字以上、大小英字・数字・記号必須 |
| コールバックURL | `http://localhost:30000/callback`, `http://localhost:30000/auth/callback` |
| ログアウトURL | `http://localhost:30000` |
| アクセストークン有効期限 | 1時間 |
| リフレッシュトークン有効期限 | 30日 |

### 4.2 IAM Execution Role 権限

- AmazonECSTaskExecutionRolePolicy (AWS管理ポリシー)
- Secrets Manager へのアクセス (カスタムポリシー)

### 4.3 IAM Task Role 権限

- S3 バケットへのアクセス
- CloudWatch Logs への書き込み
- SSM Parameter Store からの読み取り

---

## 5. アプリケーション設定値

フロントエンドアプリケーションで使用する環境変数:

```env
VITE_AWS_REGION=ap-northeast-1
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_Q5fQJZkgd
VITE_COGNITO_CLIENT_ID=3oace2ln47tv6btvftfkkt5qm1
```

---

## 6. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Phase 1 作業ログ | [aws-infrastructure-phase1.md](./aws-infrastructure-phase1.md) |
| Phase 3 作業ログ | [aws-infrastructure-phase3-database.md](./aws-infrastructure-phase3-database.md) |

---

*作成日: 2026-01-31*
