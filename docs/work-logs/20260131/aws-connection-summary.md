# AWS 接続情報サマリー

**更新日:** 2026-01-31  
**環境:** Development (dev)

---

## 1. 接続情報一覧

### 1.1 Cognito (認証)

| 項目 | 値 |
|------|-----|
| User Pool ID | `ap-northeast-1_Q5fQJZkgd` |
| Client ID | `3oace2ln47tv6btvftfkkt5qm1` |
| Endpoint | `cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_Q5fQJZkgd` |
| Hosted UI | `https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com` |

### 1.2 Aurora PostgreSQL (データベース)

| 項目 | 値 |
|------|-----|
| Cluster Endpoint (Writer) | `zedi-dev-cluster.cluster-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com` |
| Reader Endpoint | `zedi-dev-cluster.cluster-ro-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com` |
| Database Name | `zedi` |
| Port | `5432` |
| Credentials Secret | `zedi-dev-db-credentials` |

### 1.3 ElastiCache Redis (キャッシュ/Pub-Sub)

| 項目 | 値 |
|------|-----|
| Primary Endpoint | `master.zedi-dev-redis.rllaew.apne1.cache.amazonaws.com` |
| Port | `6379` |
| Connection String | `rediss://master.zedi-dev-redis.rllaew.apne1.cache.amazonaws.com:6379` |
| TLS | 有効 |

### 1.4 ECS/ALB (WebSocket)

| 項目 | 値 |
|------|-----|
| ALB DNS Name | `zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com` |
| WebSocket URL | `ws://zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com` |
| ECR Repository | `590183877893.dkr.ecr.ap-northeast-1.amazonaws.com/zedi-dev-hocuspocus` |
| ECS Cluster | `zedi-dev-cluster` |
| ECS Service | `zedi-dev-hocuspocus` |

### 1.5 VPC/ネットワーク

| 項目 | 値 |
|------|-----|
| VPC ID | `vpc-04acab2235ceb032e` |
| Public Subnets | `subnet-0ab16cd5ece570673`, `subnet-0dcc13c16c391f1bb` |
| Private Subnets | `subnet-01deac6f1dfdbc4c8`, `subnet-01ba74846537d514f` |

---

## 2. フロントエンド環境変数 (.env)

```env
# AWS Region
VITE_AWS_REGION=ap-northeast-1

# Cognito
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_Q5fQJZkgd
VITE_COGNITO_CLIENT_ID=3oace2ln47tv6btvftfkkt5qm1

# WebSocket (Hocuspocus)
VITE_WEBSOCKET_URL=ws://zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com
```

---

## 3. バックエンド環境変数

```env
# Server
PORT=1234
NODE_ENV=development

# AWS
AWS_REGION=ap-northeast-1

# Cognito
COGNITO_USER_POOL_ID=ap-northeast-1_Q5fQJZkgd
COGNITO_REGION=ap-northeast-1

# Redis
REDIS_URL=rediss://master.zedi-dev-redis.rllaew.apne1.cache.amazonaws.com:6379

# Database (Secrets Managerから取得するか、直接指定)
DATABASE_HOST=zedi-dev-cluster.cluster-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com
DATABASE_NAME=zedi
DATABASE_PORT=5432
# DATABASE_USER と DATABASE_PASSWORD は Secrets Manager から取得
```

---

## 4. DB認証情報の取得

```bash
# Secrets Managerから認証情報を取得
aws secretsmanager get-secret-value \
  --secret-id zedi-dev-db-credentials \
  --query SecretString \
  --output text | jq .
```

レスポンス例:
```json
{
  "username": "zedi_admin",
  "password": "...",
  "engine": "postgres",
  "host": "zedi-dev-cluster.cluster-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com",
  "port": 5432,
  "dbname": "zedi"
}
```

---

## 5. IAM Roles

| Role | ARN | 用途 |
|------|-----|------|
| ECS Execution Role | `arn:aws:iam::590183877893:role/zedi-dev-ecs-execution-role` | タスク起動時の権限 |
| ECS Task Role | `arn:aws:iam::590183877893:role/zedi-dev-ecs-task-role` | タスク実行中の権限 |

---

## 6. 接続テスト

### 6.1 Redis接続テスト

```bash
# VPC内から実行（EC2やCloud9など）
redis-cli -h master.zedi-dev-redis.rllaew.apne1.cache.amazonaws.com -p 6379 --tls PING
```

### 6.2 PostgreSQL接続テスト

```bash
# Secrets Managerから認証情報を取得して接続
psql "host=zedi-dev-cluster.cluster-cbmk8ggimo75.ap-northeast-1.rds.amazonaws.com \
      port=5432 \
      dbname=zedi \
      user=zedi_admin \
      sslmode=require"
```

### 6.3 ALB ヘルスチェック

```bash
curl http://zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com/health
```

---

## 7. セキュリティグループ

| 名前 | ID | 用途 | インバウンドルール |
|------|-----|------|-----------------|
| Aurora SG | `sg-0f5413e30ba3c6def` | PostgreSQL | 5432 from VPC |
| Redis SG | `sg-001777c1d2975c56b` | ElastiCache | 6379 from VPC |
| ALB SG | `sg-005d15fa364266625` | Load Balancer | 80, 443 from 0.0.0.0/0 |
| ECS Tasks SG | `sg-0c1a9c8f33540cf05` | Fargate Tasks | 1234 from ALB SG |

---

## 8. 月額コスト概算

| サービス | リソース | 月額コスト |
|----------|----------|-----------|
| VPC Endpoints | Interface型 x 4 | ~$14 |
| Aurora Serverless v2 | 0.5-4 ACU | ~$25-30 |
| ElastiCache | cache.t4g.micro | ~$12 |
| ECS Fargate Spot | 256 CPU, 512MB | ~$8 |
| ALB | Application LB | ~$16 |
| Cognito | User Pool | 無料 |
| Secrets Manager | 1シークレット | ~$0.40 |
| **合計** | | **~$76/月** |

---

## 9. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Phase 1 (Networking) | [aws-infrastructure-phase1.md](./aws-infrastructure-phase1.md) |
| Phase 2 (Security) | [aws-infrastructure-phase2-security.md](./aws-infrastructure-phase2-security.md) |
| Phase 3 (Database) | [aws-infrastructure-phase3-database.md](./aws-infrastructure-phase3-database.md) |
| Phase 4 (Cache) | [aws-infrastructure-phase4-cache.md](./aws-infrastructure-phase4-cache.md) |
| Phase 5 (Realtime) | [aws-infrastructure-phase5-realtime.md](./aws-infrastructure-phase5-realtime.md) |
| Hocuspocus実装ガイド | [hocuspocus-server-implementation.md](./hocuspocus-server-implementation.md) |

---

*このドキュメントはAWSリソースへの接続情報をまとめたクイックリファレンスです。*
