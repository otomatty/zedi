# AWS 初期セットアップガイド

**Document Version:** 1.0  
**Created:** 2026-01-31  
**Purpose:** Zedi リアルタイム同時編集機能のためのAWS環境構築準備

---

## 目次

1. [概要](#1-概要)
2. [AWSアカウントの準備](#2-awsアカウントの準備)
3. [セキュリティ設定](#3-セキュリティ設定)
4. [Terraform用IAMユーザーの作成](#4-terraform用iamユーザーの作成)
5. [ローカル環境の準備](#5-ローカル環境の準備)
6. [Terraformバックエンドの準備](#6-terraformバックエンドの準備)
7. [コスト管理の設定](#7-コスト管理の設定)
8. [カスタムドメインの準備（オプション）](#8-カスタムドメインの準備オプション)
9. [準備完了チェックリスト](#9-準備完了チェックリスト)
10. [トラブルシューティング](#10-トラブルシューティング)

---

## 1. 概要

### 1.1 このガイドの目的

Terraformでインフラをコード管理する前に、AWS側で必要な初期設定を行います。これらの設定は一度行えば、以降はTerraformで自動管理されます。

### 1.2 所要時間

| 作業 | 時間目安 |
|------|----------|
| AWSアカウント作成（新規の場合） | 10-15分 |
| セキュリティ設定 | 10分 |
| IAMユーザー作成 | 10分 |
| ローカル環境準備 | 15分 |
| Terraformバックエンド準備 | 10分 |
| コスト管理設定 | 5分 |
| **合計** | **約1時間** |

### 1.3 前提条件

- クレジットカード（AWS登録用）
- メールアドレス
- 電話番号（本人確認用）
- Windows 10/11 環境

---

## 2. AWSアカウントの準備

### 2.1 新規アカウント作成（アカウントがない場合）

1. **AWS公式サイトにアクセス**
   ```
   https://aws.amazon.com/jp/
   ```

2. **「無料アカウントを作成」をクリック**

3. **必要情報を入力**
   - メールアドレス（ルートユーザー）
   - AWSアカウント名: `zedi-production` など
   - パスワード（強力なものを設定）

4. **連絡先情報を入力**
   - アカウントタイプ: 「個人」または「ビジネス」
   - 住所、電話番号など

5. **支払い情報を入力**
   - クレジットカード情報
   - ※無料利用枠内なら請求なし

6. **本人確認**
   - 電話またはSMSで確認コードを受信

7. **サポートプランを選択**
   - 「ベーシックサポート - 無料」を選択

### 2.2 既存アカウントの確認

既にAWSアカウントがある場合は、以下を確認：

```
□ ルートユーザーでログインできる
□ 支払い情報が有効
□ アカウントがアクティブ状態
```

---

## 3. セキュリティ設定

### 3.1 ルートユーザーのMFA有効化（必須）

ルートユーザーは最高権限を持つため、必ずMFAを設定します。

1. **AWSコンソールにルートユーザーでログイン**
   ```
   https://console.aws.amazon.com/
   ```

2. **IAMダッシュボードに移動**
   - 右上のアカウント名 → 「セキュリティ認証情報」

3. **MFAを割り当て**
   - 「MFAデバイスの割り当て」をクリック
   - デバイス名: `root-mfa`
   - MFAデバイスタイプ: 「認証アプリケーション」を選択

4. **認証アプリで設定**
   - Google Authenticator または Microsoft Authenticator を使用
   - QRコードをスキャン
   - 連続する2つのコードを入力

5. **設定完了を確認**
   - 「MFAが正常に割り当てられました」と表示

### 3.2 ルートユーザーの使用制限

```
⚠️ 重要: ルートユーザーは以下の場合のみ使用
- アカウントレベルの設定変更
- 請求情報の確認
- アカウントの閉鎖

日常の作業はIAMユーザーで行う
```

---

## 4. Terraform用IAMユーザーの作成

### 4.1 IAMユーザーの作成

1. **IAMコンソールに移動**
   ```
   https://console.aws.amazon.com/iam/
   ```

2. **ユーザーを作成**
   - 左メニュー「ユーザー」→「ユーザーを作成」
   - ユーザー名: `terraform-admin`

3. **アクセスキーを有効化**
   - 「AWSマネジメントコンソールへのユーザーアクセスを提供する」のチェックは任意
   - 次のステップへ

4. **権限を設定**
   
   **オプションA: AdministratorAccess（簡単・推奨）**
   - 「ポリシーを直接アタッチする」を選択
   - `AdministratorAccess` を検索してチェック
   
   **オプションB: 最小権限（セキュリティ重視）**
   - カスタムポリシーを作成（後述）

5. **確認して作成**

### 4.2 アクセスキーの作成

1. **作成したユーザーを選択**
   - IAM → ユーザー → `terraform-admin`

2. **アクセスキーを作成**
   - 「セキュリティ認証情報」タブ
   - 「アクセスキーを作成」をクリック

3. **ユースケースを選択**
   - 「コマンドラインインターフェイス (CLI)」を選択
   - 確認のチェックボックスをオン
   - 「次へ」

4. **説明タグを追加（オプション）**
   - 説明: `Terraform deployment key`

5. **アクセスキーを保存**
   ```
   ⚠️ 重要: この画面でしかシークレットアクセスキーは表示されません
   
   - Access key ID: AKIA...（控える）
   - Secret access key: xxxx...（控える）
   
   「.csvファイルをダウンロード」で安全に保存
   ```

### 4.3 最小権限ポリシー（オプションB用）

セキュリティを重視する場合、以下のカスタムポリシーを作成：

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "TerraformFullAccess",
            "Effect": "Allow",
            "Action": [
                "ec2:*",
                "ecs:*",
                "ecr:*",
                "rds:*",
                "elasticache:*",
                "s3:*",
                "cloudfront:*",
                "cognito-idp:*",
                "cognito-identity:*",
                "iam:*",
                "logs:*",
                "elasticloadbalancing:*",
                "acm:*",
                "route53:*",
                "wafv2:*",
                "dynamodb:*",
                "secretsmanager:*",
                "kms:*",
                "application-autoscaling:*",
                "cloudwatch:*",
                "sns:*",
                "lambda:*",
                "apigateway:*"
            ],
            "Resource": "*"
        }
    ]
}
```

ポリシーの作成手順：
1. IAM → ポリシー → 「ポリシーを作成」
2. 「JSON」タブを選択
3. 上記JSONを貼り付け
4. ポリシー名: `TerraformDeploymentPolicy`
5. 作成後、`terraform-admin`ユーザーにアタッチ

---

## 5. ローカル環境の準備

### 5.1 AWS CLI のインストール

**Windows (PowerShell を管理者権限で実行)**

```powershell
# winget でインストール（推奨）
winget install Amazon.AWSCLI

# または MSI インストーラー
# https://awscli.amazonaws.com/AWSCLIV2.msi からダウンロード

# インストール確認
aws --version
# aws-cli/2.x.x Python/3.x.x Windows/10 exe/AMD64
```

### 5.2 Terraform のインストール

**Windows (PowerShell を管理者権限で実行)**

```powershell
# winget でインストール（推奨）
winget install Hashicorp.Terraform

# インストール確認
terraform --version
# Terraform v1.x.x
```

**手動インストールの場合:**
1. https://www.terraform.io/downloads にアクセス
2. Windows AMD64 版をダウンロード
3. ZIPを展開し、`terraform.exe`をPATHの通った場所に配置

### 5.3 AWS CLI の設定

```powershell
# 認証情報を設定
aws configure

# 以下を入力（IAMユーザー作成時に取得した値）
AWS Access Key ID [None]: AKIAXXXXXXXXXXXXXXXX
AWS Secret Access Key [None]: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Default region name [None]: ap-northeast-1
Default output format [None]: json
```

### 5.4 設定の確認

```powershell
# 認証情報ファイルの確認
cat ~/.aws/credentials

# 出力例:
# [default]
# aws_access_key_id = AKIAXXXXXXXXXXXXXXXX
# aws_secret_access_key = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# リージョン設定の確認
cat ~/.aws/config

# 出力例:
# [default]
# region = ap-northeast-1
# output = json
```

### 5.5 接続テスト

```powershell
# 認証確認（現在のIAMユーザー情報を取得）
aws sts get-caller-identity

# 成功時の出力例:
# {
#     "UserId": "AIDAXXXXXXXXXXXXXXXXX",
#     "Account": "123456789012",
#     "Arn": "arn:aws:iam::123456789012:user/terraform-admin"
# }
```

**アカウントIDをメモしておく**（後で使用）
```powershell
# 環境変数に設定（オプション）
$env:AWS_ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)
echo $env:AWS_ACCOUNT_ID
```

---

## 6. Terraformバックエンドの準備

Terraformの状態ファイル（tfstate）を安全に管理するため、S3バケットとDynamoDBテーブルを作成します。

### 6.1 なぜ手動で作成するのか

```
Terraform自身が使うリソースをTerraformで作成すると
「鶏が先か卵が先か」問題が発生するため、
バックエンド用リソースのみ手動で作成します。
```

### 6.2 S3バケットの作成

```powershell
# アカウントIDを取得（まだ設定していない場合）
$AWS_ACCOUNT_ID = aws sts get-caller-identity --query Account --output text

# バケット名を設定
$BUCKET_NAME = "zedi-terraform-state-$AWS_ACCOUNT_ID"

# S3バケットを作成
aws s3api create-bucket `
  --bucket $BUCKET_NAME `
  --region ap-northeast-1 `
  --create-bucket-configuration LocationConstraint=ap-northeast-1

# バージョニングを有効化（誤削除防止）
aws s3api put-bucket-versioning `
  --bucket $BUCKET_NAME `
  --versioning-configuration Status=Enabled

# 暗号化を有効化
aws s3api put-bucket-encryption `
  --bucket $BUCKET_NAME `
  --server-side-encryption-configuration '{\"Rules\": [{\"ApplyServerSideEncryptionByDefault\": {\"SSEAlgorithm\": \"AES256\"}}]}'

# パブリックアクセスをブロック
aws s3api put-public-access-block `
  --bucket $BUCKET_NAME `
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 確認
aws s3 ls | Select-String $BUCKET_NAME
```

### 6.3 DynamoDBテーブルの作成

```powershell
# DynamoDBテーブルを作成（state lock用）
aws dynamodb create-table `
  --table-name zedi-terraform-lock `
  --attribute-definitions AttributeName=LockID,AttributeType=S `
  --key-schema AttributeName=LockID,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST `
  --region ap-northeast-1

# 作成確認
aws dynamodb describe-table --table-name zedi-terraform-lock --query "Table.TableStatus"
# "ACTIVE" と表示されればOK
```

### 6.4 作成したリソースの確認

```powershell
# S3バケット一覧
aws s3 ls

# DynamoDBテーブル一覧
aws dynamodb list-tables
```

### 6.5 バックエンド設定の確認

Terraformで使用するバックエンド設定（参考）:

```hcl
# terraform/backend.tf で使用する値
terraform {
  backend "s3" {
    bucket         = "zedi-terraform-state-{YOUR_ACCOUNT_ID}"
    key            = "zedi/terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "zedi-terraform-lock"
  }
}
```

---

## 7. コスト管理の設定

### 7.1 予算アラートの作成

予期せぬ課金を防ぐため、予算アラートを設定します。

1. **Billing コンソールにアクセス**
   ```
   https://console.aws.amazon.com/billing/
   ```

2. **Budgets に移動**
   - 左メニュー「予算」→「予算を作成」

3. **予算タイプを選択**
   - 「コスト予算を使用」→「次へ」

4. **予算の詳細を設定**
   - 予算名: `zedi-monthly-budget`
   - 期間: 月別
   - 予算額: `100` USD（余裕を持たせた金額）
   - ※予想コスト ~$76/月 + バッファ

5. **アラートしきい値を設定**
   
   | しきい値 | 金額 | 用途 |
   |----------|------|------|
   | 50% | $50 | 早期警告 |
   | 80% | $80 | 注意 |
   | 100% | $100 | 予算到達 |
   | 120% | $120 | 超過警告 |

6. **通知先を設定**
   - メールアドレスを入力
   - 「予算を作成」をクリック

### 7.2 Cost Explorer の有効化

1. **Billing → Cost Explorer**
2. **「Cost Explorerを有効にする」をクリック**
   - 有効化まで24時間かかる場合あり

### 7.3 Free Tier 使用状況の確認

```
Billing → 無料利用枠

以下を定期的に確認:
- EC2: 750時間/月（t2.micro or t3.micro）
- S3: 5GB ストレージ
- DynamoDB: 25GB ストレージ
- Lambda: 100万リクエスト/月
```

---

## 8. カスタムドメインの準備（オプション）

### 8.1 ドメインの選択肢

| 方法 | メリット | デメリット |
|------|----------|------------|
| Route53で購入 | AWS統合が簡単 | やや高い |
| 外部で購入 | 安い場合あり | NS設定が必要 |
| CloudFront デフォルト | 無料 | URL が長い |

### 8.2 Route53でドメイン購入（推奨）

1. **Route53 コンソールに移動**
   ```
   https://console.aws.amazon.com/route53/
   ```

2. **ドメインを登録**
   - 「ドメインの登録」→ 希望のドメインを検索
   - 例: `zedi-app.com`

3. **購入手続き**
   - 連絡先情報を入力
   - 自動更新の設定（推奨）
   - 購入完了

4. **Hosted Zoneの確認**
   - ドメイン購入時に自動作成される
   - Route53 → ホストゾーン で確認

### 8.3 外部ドメインを使用する場合

1. **Route53でHosted Zoneを作成**
   - Route53 → ホストゾーン → 「ホストゾーンの作成」
   - ドメイン名を入力

2. **NSレコードを確認**
   ```
   作成されたHosted Zoneの「NS」レコードをメモ
   例:
   ns-xxx.awsdns-xx.org
   ns-xxx.awsdns-xx.co.uk
   ns-xxx.awsdns-xx.com
   ns-xxx.awsdns-xx.net
   ```

3. **外部レジストラでNSを設定**
   - ドメイン管理画面でネームサーバーを変更
   - 上記4つのNSレコードを設定
   - 反映まで数時間～48時間

### 8.4 カスタムドメインなしで進める場合

```
CloudFrontのデフォルトドメインを使用:
例: d1234567890.cloudfront.net

※後からカスタムドメインに切り替え可能
```

---

## 9. 準備完了チェックリスト

以下のすべてにチェックが入れば、Terraform実装を開始できます。

### 必須項目

```
□ AWSアカウント
  □ アカウント作成済み / 既存アカウント確認済み
  □ ルートユーザーでログイン可能
  □ アカウントがアクティブ状態

□ セキュリティ
  □ ルートユーザーのMFA有効化
  
□ IAMユーザー
  □ terraform-admin ユーザー作成
  □ 必要な権限を付与（AdministratorAccess等）
  □ アクセスキーID取得
  □ シークレットアクセスキー取得（安全に保存）

□ ローカル環境
  □ AWS CLI インストール済み
  □ Terraform インストール済み
  □ aws configure 設定済み
  □ aws sts get-caller-identity で認証確認OK

□ Terraformバックエンド
  □ S3バケット作成済み
  □ バージョニング有効化
  □ 暗号化有効化
  □ DynamoDBテーブル作成済み

□ コスト管理
  □ 予算アラート設定済み
```

### オプション項目

```
□ カスタムドメイン
  □ ドメイン取得 / 外部ドメイン準備
  □ Route53 Hosted Zone作成
  □ NS設定（外部の場合）
```

---

## 10. トラブルシューティング

### 10.1 AWS CLI の認証エラー

**症状:**
```
An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid.
```

**解決策:**
```powershell
# 認証情報を再設定
aws configure

# または認証情報ファイルを直接編集
notepad ~/.aws/credentials
```

### 10.2 S3バケット作成エラー

**症状:**
```
An error occurred (BucketAlreadyExists) when calling the CreateBucket operation
```

**解決策:**
- S3バケット名はグローバルで一意
- 別の名前を使用: `zedi-terraform-state-{random}-{account_id}`

### 10.3 リージョンエラー

**症状:**
```
An error occurred (IllegalLocationConstraintException)
```

**解決策:**
```powershell
# ap-northeast-1 以外のリージョンで作成する場合
aws s3api create-bucket `
  --bucket $BUCKET_NAME `
  --region us-east-1
# us-east-1 は LocationConstraint 不要
```

### 10.4 Terraform バージョンエラー

**症状:**
```
Error: Unsupported Terraform Core version
```

**解決策:**
```powershell
# Terraformを更新
winget upgrade Hashicorp.Terraform

# バージョン確認
terraform --version
```

### 10.5 権限不足エラー

**症状:**
```
Error: error creating VPC: UnauthorizedOperation
```

**解決策:**
- IAMユーザーの権限を確認
- AdministratorAccessをアタッチするか
- 必要なサービス権限を追加

---

## 次のステップ

すべての準備が完了したら、以下のドキュメントに従ってTerraformコードを実装します：

1. **[aws-terraform-implementation-plan.md](../specs/aws-terraform-implementation-plan.md)** - Terraform実装計画
2. **[realtime-collaboration-specification.md](../specs/realtime-collaboration-specification.md)** - リアルタイム同時編集仕様
3. **[application-implementation-plan.md](../specs/application-implementation-plan.md)** - アプリケーション実装計画

---

## 参考リンク

- [AWS CLI ドキュメント](https://docs.aws.amazon.com/cli/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS IAM ベストプラクティス](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS 料金計算ツール](https://calculator.aws/)
