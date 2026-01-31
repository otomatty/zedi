# Hocuspocus サーバー実装ガイド

**作成日:** 2026-01-31  
**ステータス:** 未着手

---

## 1. 概要

このドキュメントでは、AWS ECS Fargate上で動作するHocuspocusリアルタイム同期サーバーの実装手順を説明します。

Terraformで以下のインフラは構築済みです：
- ✅ ECR Repository (`zedi-dev-hocuspocus`)
- ✅ ECS Cluster (`zedi-dev-cluster`)
- ✅ ECS Service (`zedi-dev-hocuspocus`)
- ✅ ALB (`zedi-dev-alb`)

**残りの作業（このドキュメントの範囲）:**
- Hocuspocusサーバーのコード実装
- Dockerイメージのビルドとプッシュ
- ECSサービスの更新

---

## 2. 前提条件

### 2.1 必要なツール

```bash
# Docker
docker --version

# AWS CLI v2
aws --version

# Node.js 20+
node --version
```

### 2.2 AWS認証情報

```bash
# AWSプロファイルの確認
aws sts get-caller-identity
```

---

## 3. プロジェクト構成

```
server/
├── hocuspocus/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # エントリーポイント
│       ├── server.ts         # Hocuspocusサーバー設定
│       ├── extensions/
│       │   ├── database.ts   # PostgreSQL永続化
│       │   ├── redis.ts      # Redis Pub/Sub
│       │   └── auth.ts       # Cognito認証
│       └── types/
│           └── index.ts
```

---

## 4. Hocuspocusサーバー実装

### 4.1 package.json

```json
{
  "name": "zedi-hocuspocus",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@hocuspocus/server": "^2.11.0",
    "@hocuspocus/extension-database": "^2.11.0",
    "@hocuspocus/extension-redis": "^2.11.0",
    "ioredis": "^5.3.2",
    "pg": "^8.11.3",
    "jsonwebtoken": "^9.0.2",
    "jwks-rsa": "^3.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/pg": "^8.10.9",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

### 4.2 src/index.ts

```typescript
import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { Redis } from '@hocuspocus/extension-redis';
import { createDatabaseExtension } from './extensions/database.js';
import { createRedisExtension } from './extensions/redis.js';
import { createAuthExtension } from './extensions/auth.js';

const PORT = parseInt(process.env.PORT || '1234', 10);

const server = Server.configure({
  port: PORT,
  
  extensions: [
    createAuthExtension(),
    createRedisExtension(),
    createDatabaseExtension(),
  ],

  async onConnect({ connection, documentName }) {
    console.log(`Client connected to document: ${documentName}`);
  },

  async onDisconnect({ documentName }) {
    console.log(`Client disconnected from document: ${documentName}`);
  },
});

// Health check endpoint
import http from 'http';

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(PORT, () => {
  console.log(`Hocuspocus server running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});

server.listen();
```

### 4.3 src/extensions/auth.ts

```typescript
import { Extension } from '@hocuspocus/server';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const COGNITO_REGION = process.env.COGNITO_REGION || 'ap-northeast-1';

const client = jwksClient({
  jwksUri: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export function createAuthExtension(): Extension {
  return {
    async onAuthenticate({ token, documentName }) {
      if (!token) {
        throw new Error('Authentication required');
      }

      return new Promise((resolve, reject) => {
        jwt.verify(token, getKey, {
          algorithms: ['RS256'],
          issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
        }, (err, decoded) => {
          if (err) {
            reject(new Error('Invalid token'));
            return;
          }
          
          const payload = decoded as { sub: string; email: string };
          resolve({
            user: {
              id: payload.sub,
              email: payload.email,
            },
          });
        });
      });
    },
  };
}
```

### 4.4 src/extensions/redis.ts

```typescript
import { Redis } from '@hocuspocus/extension-redis';
import IORedis from 'ioredis';

export function createRedisExtension() {
  const REDIS_URL = process.env.REDIS_URL!;
  
  return new Redis({
    redis: new IORedis(REDIS_URL, {
      tls: {},
      maxRetriesPerRequest: 3,
    }),
  });
}
```

### 4.5 src/extensions/database.ts

```typescript
import { Database } from '@hocuspocus/extension-database';
import pg from 'pg';

const { Pool } = pg;

export function createDatabaseExtension() {
  const pool = new Pool({
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME || 'zedi',
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    port: 5432,
    ssl: { rejectUnauthorized: false },
  });

  return new Database({
    fetch: async ({ documentName }) => {
      const result = await pool.query(
        'SELECT content FROM documents WHERE name = $1',
        [documentName]
      );
      return result.rows[0]?.content || null;
    },
    
    store: async ({ documentName, state }) => {
      await pool.query(
        `INSERT INTO documents (name, content, updated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (name) DO UPDATE SET content = $2, updated_at = NOW()`,
        [documentName, state]
      );
    },
  });
}
```

---

## 5. Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=1234

EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:1234/health || exit 1

CMD ["node", "dist/index.js"]
```

---

## 6. ビルドとデプロイ

### 6.1 ECRログイン

```bash
# AWS Account ID
AWS_ACCOUNT_ID=590183877893
AWS_REGION=ap-northeast-1

# ECRへログイン
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

### 6.2 Dockerイメージのビルドとプッシュ

```bash
# プロジェクトディレクトリに移動
cd server/hocuspocus

# イメージのビルド
docker build -t zedi-hocuspocus .

# タグ付け
docker tag zedi-hocuspocus:latest \
  590183877893.dkr.ecr.ap-northeast-1.amazonaws.com/zedi-dev-hocuspocus:latest

# プッシュ
docker push 590183877893.dkr.ecr.ap-northeast-1.amazonaws.com/zedi-dev-hocuspocus:latest
```

### 6.3 ECSサービスの更新

```bash
# 新しいイメージでタスクを再起動
aws ecs update-service \
  --cluster zedi-dev-cluster \
  --service zedi-dev-hocuspocus \
  --force-new-deployment
```

---

## 7. 動作確認

### 7.1 ECSタスクの状態確認

```bash
# タスクの状態を確認
aws ecs describe-services \
  --cluster zedi-dev-cluster \
  --services zedi-dev-hocuspocus \
  --query 'services[0].{runningCount:runningCount,desiredCount:desiredCount,status:status}'
```

### 7.2 ヘルスチェック

```bash
# ALB経由でヘルスチェック
curl http://zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com/health
```

### 7.3 CloudWatchログの確認

```bash
# 最新のログを確認
aws logs tail /aws/ecs/zedi-dev/hocuspocus --follow
```

---

## 8. 環境変数一覧

ECSタスク定義で設定済みの環境変数:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| PORT | 1234 | サーバーポート |
| NODE_ENV | development | 実行環境 |
| REDIS_URL | rediss://master.zedi-dev-redis... | Redis接続文字列 |
| COGNITO_USER_POOL_ID | ap-northeast-1_Q5fQJZkgd | Cognito User Pool ID |
| COGNITO_REGION | ap-northeast-1 | Cognitoリージョン |
| AWS_REGION | ap-northeast-1 | AWSリージョン |
| DATABASE_URL | Secrets Manager経由 | DB接続情報 |

---

## 9. トラブルシューティング

### 9.1 タスクが起動しない

```bash
# 停止理由を確認
aws ecs describe-tasks \
  --cluster zedi-dev-cluster \
  --tasks $(aws ecs list-tasks --cluster zedi-dev-cluster --service-name zedi-dev-hocuspocus --query 'taskArns[0]' --output text) \
  --query 'tasks[0].stoppedReason'
```

### 9.2 ヘルスチェック失敗

1. コンテナが起動しているか確認
2. `/health` エンドポイントが正しく実装されているか確認
3. セキュリティグループでポート1234が許可されているか確認

### 9.3 Redis接続エラー

- TLS接続 (`rediss://`) を使用していることを確認
- VPC内からのアクセスであることを確認
- セキュリティグループで6379ポートが許可されているか確認

---

## 10. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Phase 5 作業ログ | [aws-infrastructure-phase5-realtime.md](./aws-infrastructure-phase5-realtime.md) |
| リアルタイム同時編集仕様 | [../../specs/realtime-collaboration-specification.md](../../specs/realtime-collaboration-specification.md) |
| AWS接続情報サマリー | [aws-connection-summary.md](./aws-connection-summary.md) |

---

*このドキュメントは Terraform 以外で実施が必要な作業をまとめています。*
