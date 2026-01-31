# 作業ログ: AWS インフラ構築 Phase 5 - Realtime

**作業日:** 2026-01-31  
**作業者:** -  
**ステータス:** 完了 ✅

---

## 1. 作業サマリー

### 1.1 完了した作業

| # | 作業内容 | ステータス |
|---|----------|-----------|
| 1 | Realtime モジュール作成 | ✅ 完了 |
| 2 | ECR Repository 作成 | ✅ 完了 |
| 3 | ECS Cluster デプロイ | ✅ 完了 |
| 4 | ECS Service (Fargate Spot) デプロイ | ✅ 完了 |
| 5 | Application Load Balancer デプロイ | ✅ 完了 |
| 6 | Security Groups 作成 | ✅ 完了 |

### 1.2 作成したファイル

```
terraform/modules/realtime/
├── main.tf          # ECS Cluster, Service, Task Definition, ALB, ECR
├── variables.tf     # モジュール変数
└── outputs.tf       # ALB DNS name, WebSocket URL など
```

---

## 2. デプロイ済みリソース

| リソースタイプ | 名前/ID | 詳細 |
|---------------|---------|------|
| ECR Repository | `zedi-dev-hocuspocus` | Hocuspocus Dockerイメージ用 |
| ECS Cluster | `zedi-dev-cluster` | Fargate Spot対応 |
| ECS Service | `zedi-dev-hocuspocus` | Fargate Spot, 1タスク |
| ECS Task Definition | `zedi-dev-hocuspocus` | 256 CPU, 512MB Memory |
| ALB | `zedi-dev-alb` | WebSocket用 |
| Target Group | `zedi-dev-hocuspocus-tg` | Port 1234 |
| ALB Listener | HTTP:80 | Forwardリスナー (開発環境) |
| Security Group | `sg-005d15fa364266625` | ALB用 (Port 80, 443) |
| Security Group | `sg-0c1a9c8f33540cf05` | ECS Tasks用 (Port 1234) |
| CloudWatch Log Group | `/aws/ecs/zedi-dev/hocuspocus` | ECSログ (7日保持) |

---

## 3. Terraform 出力値

```hcl
alb_dns_name               = "zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com"
websocket_url              = "ws://zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com"
ecr_repository_url         = "590183877893.dkr.ecr.ap-northeast-1.amazonaws.com/zedi-dev-hocuspocus"
ecs_cluster_name           = "zedi-dev-cluster"
ecs_service_name           = "zedi-dev-hocuspocus"
```

---

## 4. 設定詳細

### 4.1 ECS Fargate Spot 設定

| 設定項目 | 値 |
|----------|-----|
| クラスター名 | zedi-dev-cluster |
| サービス名 | zedi-dev-hocuspocus |
| キャパシティプロバイダー | FARGATE_SPOT (100%) |
| タスクCPU | 256 (0.25 vCPU) |
| タスクメモリ | 512 MB |
| 希望タスク数 | 1 |
| コンテナポート | 1234 |
| ネットワークモード | awsvpc |
| ログ保持期間 | 7日 (開発環境) |
| Circuit Breaker | 有効 (ロールバック有効) |
| オートスケーリング | 無効 (開発環境) |

### 4.2 ALB 設定

| 設定項目 | 値 |
|----------|-----|
| 名前 | zedi-dev-alb |
| タイプ | Application Load Balancer |
| スキーム | Internet-facing |
| HTTP/2 | 有効 |
| リスナー | HTTP:80 → Target Group |
| ターゲットタイプ | IP |
| ヘルスチェックパス | /health |
| ヘルスチェック間隔 | 30秒 |
| スティッキネス | 有効 (24時間, lb_cookie) |
| 削除保護 | 無効 (開発環境) |

---

## 5. 次のステップ（Terraform以外の作業）

⚠️ **重要:** ECSサービスはDockerイメージがECRにプッシュされるまでタスクが起動しません。

以下の作業が必要です:
1. Hocuspocusサーバーの実装
2. Dockerイメージのビルド
3. ECRへのプッシュ
4. ECSサービスの更新

詳細は [hocuspocus-server-implementation.md](./hocuspocus-server-implementation.md) を参照してください。

---

## 6. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Phase 4 作業ログ | [aws-infrastructure-phase4-cache.md](./aws-infrastructure-phase4-cache.md) |
| Hocuspocus実装ガイド | [hocuspocus-server-implementation.md](./hocuspocus-server-implementation.md) |
| リアルタイム同時編集仕様 | [../../specs/realtime-collaboration-specification.md](../../specs/realtime-collaboration-specification.md) |

---

*作成日: 2026-01-31*
