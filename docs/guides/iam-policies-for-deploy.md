# デプロイ用 IAM ユーザーに必要なポリシー（dev / prod）

GitHub Actions の **deploy-dev** / **deploy-prod** で使う IAM ユーザー（dev 用・prod 用で分けることを推奨）に付与するポリシーです。

---

## 1. ワークフローごとに必要な AWS 権限

| ジョブ | 主な操作 | 必要なサービス |
|--------|----------|----------------|
| **Terraform Apply** | インフラの作成・更新・削除 | VPC, EC2, ECS, ECR, Lambda, API Gateway, Cognito, RDS/Aurora, ElastiCache, S3, CloudFront, Secrets Manager, IAM（ロール作成）, CloudWatch, ACM, Route53 など |
| **DB Migration** | RDS Data API で SQL 実行、Secrets Manager 参照 | `rds-data:*`, `secretsmanager:GetSecretValue` |
| **Frontend Deploy**（prod のみ） | S3 アップロード、CloudFront キャッシュ無効化 | `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`, `cloudfront:CreateInvalidation` |
| **Hocuspocus Deploy** | ECR プッシュ、ECS サービス更新 | `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecs:UpdateService`, `ecs:DescribeServices`, `ecs:DescribeTaskDefinition`, `iam:PassRole` |

Terraform が扱うリソースは上記の通り多岐にわたるため、**実務ではマネージドポリシー＋IAM 用の追加** でまとめて付与する運用が一般的です。

---

## 2. 推奨: マネージドポリシー ＋ IAM 用カスタムポリシー

dev / prod それぞれの IAM ユーザーに、以下を付与します。

### 2.1 マネージドポリシー（1 つ）

| ポリシー名 | 用途 |
|------------|------|
| **PowerUserAccess** | Terraform・マイグレーション・S3/CloudFront/ECR/ECS など、IAM 以外のほぼ全操作を許可 |

- 含まれる例: EC2, VPC, S3, Lambda, API Gateway, Cognito, RDS, ElastiCache, ECR, ECS, CloudFront, Secrets Manager, CloudWatch, ACM, Route53 など
- **含まれないもの**: IAM のユーザー／グループ／ポリシーの作成・削除（ロールの作成も不可）。Terraform は Lambda/ECS 用の **IAM ロール** を作るため、次のカスタムポリシーで補う。

### 2.2 カスタムポリシー（IAM ロール操作に限定）

Terraform が「ロールの作成・更新・削除」「PassRole」だけできるようにするためのインラインポリシーです。  
ポリシー名は例として `ZediDeployIAMRoles` としています。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowTerraformIAMRoles",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:ListRoles",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PassRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:CreateServiceLinkedRole"
      ],
      "Resource": "*"
    }
  ]
}
```

- **PassRole**: ECS タスク実行ロール・タスクロール、Lambda 実行ロールに Terraform がロールを渡すために必要です。
- 上記は「ロール」に限定しており、IAM ユーザー／グループ／ポリシー自体の作成・削除は許可していません。

### 2.3 付与手順（要約）

1. IAM コンソールで **dev 用** と **prod 用** の IAM ユーザーをそれぞれ作成（推奨）。
2. 各ユーザーに **PowerUserAccess** をアタッチ。
3. 各ユーザーに上記 **ZediDeployIAMRoles** をインラインポリシーまたはカスタムマネージドポリシーとしてアタッチ。
4. 各ユーザーで **アクセスキー** を発行し、対応する GitHub Environment（dev / prod）の `AWS_ACCESS_KEY_ID` と `AWS_SECRET_ACCESS_KEY` に登録。

---

## 3. オプション: Terraform リモートバックエンド（S3 + DynamoDB）を使う場合

Terraform の state を S3、ロックを DynamoDB で管理する場合は、該当バケット・テーブルへの権限が追加で必要です。

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:ListBucket"
  ],
  "Resource": [
    "arn:aws:s3:::your-terraform-state-bucket",
    "arn:aws:s3:::your-terraform-state-bucket/*"
  ]
},
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:DeleteItem",
    "dynamodb:ConditionCheckItem",
    "dynamodb:DescribeTable",
    "dynamodb:BatchGetItem"
  ],
  "Resource": "arn:aws:dynamodb:ap-northeast-1:*:table/your-terraform-lock-table"
}
```

現在の Zedi リポジトリでは `terraform` ブロックに `backend` がなく、ローカル state の想定です。リモートバックエンドを導入した場合のみ、上記を追加してください。

---

## 4. まとめ

| 対象 | 付与するポリシー |
|------|------------------|
| **dev 用 IAM ユーザー** | PowerUserAccess ＋ ZediDeployIAMRoles（上記 JSON） |
| **prod 用 IAM ユーザー** | 同上（別ユーザーで同じポリシー） |

- dev と prod で **同じポリシー** でよく、**別ユーザー・別アクセスキー** にすることで、漏洩時の影響範囲とローテーションを分けられます。
- さらに本番を絞りたい場合は、Condition で `ResourceTag/env = prod` などを付けて「prod 用ユーザーは prod タグ付きリソースのみ」に制限する方法もあります（Terraform でタグ付けと Condition の設計が必要です）。

関連: [GitHub Environments とシークレット設定](github-environments-and-secrets.md)
