# AWS → Railway 移行仕様書

**プロジェクト:** Zedi - AIネイティブなナレッジアプリ
**作成日:** 2026-02-25
**ステータス:** ドラフト

---

## 1. 目的

AWS上の14以上のマネージドサービスで構成された現在のインフラを、Railwayを中心としたモダンなスタックに移行する。管理コストの削減、開発体験の向上、インフラのシンプル化を実現する。

## 2. 移行対象サマリー

| #   | 現在 (AWS)                             | 移行先                                  | 変更規模 |
| --- | -------------------------------------- | --------------------------------------- | -------- |
| 1   | Aurora Serverless v2 (PostgreSQL 15.8) | Railway PostgreSQL (標準テンプレート)   | 小       |
| 2   | ElastiCache Redis                      | Railway Redis                           | 小       |
| 3   | Lambda + API Gateway HTTP API (REST)   | Railway Service (Hono Node.js サーバー) | 大       |
| 4   | Lambda + API Gateway WebSocket (AI)    | Railway Service (上記APIに統合)         | 大       |
| 5   | ECS Fargate Spot (Hocuspocus)          | Railway Service (Docker)                | 小       |
| 6   | Cognito                                | Better Auth (API内蔵ライブラリ)         | 大       |
| 7   | S3 (メディア/サムネイル)               | Railway Storage Buckets                 | 中       |
| 8   | S3 + CloudFront (フロントエンド)       | Cloudflare Pages                        | 中       |
| 9   | DynamoDB (レート制限)                  | Redis (Railway)                         | 小       |
| 10  | Secrets Manager                        | Railway 環境変数                        | 小       |
| 11  | WAF                                    | Cloudflare (任意)                       | 小       |
| 12  | Route53 + ACM                          | Railway 自動SSL + 外部DNS               | 小       |
| 13  | Terraform                              | Railway Config as Code + CLI            | 大       |
| 14  | GitHub Actions (AWS用CI/CD)            | GitHub Actions (Railway/Cloudflare用)   | 中       |

---

## 3. ターゲットアーキテクチャ

### 3.1 サービス構成

```
Cloudflare
├── Pages (React SPA - フロントエンド配信)
└── DNS (任意)

Railway Project "zedi"
├── Environment: production
│   ├── Service: api
│   │   └── Hono + Better Auth + Drizzle ORM (Node.js)
│   ├── Service: hocuspocus
│   │   └── Y.js 共同編集サーバー (Docker)
│   ├── Database: postgres
│   │   └── Railway 標準テンプレート (pg_trgm)
│   ├── Database: redis
│   │   └── セッション / キャッシュ / レート制限
│   └── Storage Bucket: media
│       └── メディアファイル / サムネイル
└── Environment: development
    └── (同一構成)
```

### 3.2 ネットワーク構成

```
インターネット
    │
    ├── Cloudflare Pages (フロントエンド)
    │   └── https://zedi-note.app
    │
    └── Railway (バックエンド)
        ├── api.zedi-note.app (REST API + Auth)
        │   └── Public Domain
        ├── realtime.zedi-note.app (Hocuspocus WebSocket)
        │   └── Public Domain
        │
        └── Private Network (サービス間通信)
            ├── postgres.railway.internal:5432
            ├── redis.railway.internal:6379
            └── Storage Bucket (S3互換エンドポイント)
```

---

## 4. コンポーネント別移行仕様

### 4.1 REST API (Lambda → Railway Service)

#### 現在の構成

- **ランタイム:** AWS Lambda (Node.js 22.x)
- **フレームワーク:** Hono
- **エントリポイント:** `terraform/modules/api/lambda/src/index.ts`
- **アダプタ:** `hono/aws-lambda` の `handle(app)`
- **DB接続:** `drizzle-orm/aws-data-api/pg` (RDS Data API)
- **認証:** API Gateway JWT Authorizer → Lambda は claims を読むだけ

#### 移行後の構成

- **ランタイム:** Node.js 22.x (Railway Service)
- **フレームワーク:** Hono (`@hono/node-server`)
- **エントリポイント:** `server/api/src/index.ts` (新規)
- **アダプタ:** `@hono/node-server` の `serve()`
- **DB接続:** `drizzle-orm/node-postgres` (直接接続)
- **認証:** Better Auth (API内蔵)

#### コード変更

**エントリポイントの変更:**

```typescript
// 移行前: terraform/modules/api/lambda/src/index.ts
import { handle } from "hono/aws-lambda";
import { app } from "./app";
export const handler = handle(app);

// 移行後: server/api/src/index.ts
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = parseInt(process.env.PORT || "3000", 10);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API server running on port ${info.port}`);
});
```

**DB クライアントの変更:**

```typescript
// 移行前: drizzle-orm/aws-data-api/pg
import { drizzle } from "drizzle-orm/aws-data-api/pg";
import { RDSDataClient } from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({});
const db = drizzle(client, {
  database: process.env.AURORA_DATABASE_NAME || "zedi",
  secretArn: process.env.DB_CREDENTIALS_SECRET!,
  resourceArn: process.env.AURORA_CLUSTER_ARN!,
  schema,
});

// 移行後: drizzle-orm/node-postgres
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});
const db = drizzle(pool, { schema });
```

**認証ミドルウェアの変更:**

```typescript
// 移行前: API Gateway JWT claims を読む
import type { LambdaEvent } from "hono/aws-lambda";

export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  const event = c.env?.event as LambdaEvent;
  const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub as string;
  // ...
});

// 移行後: Better Auth セッション検証
import { auth } from "../auth";

export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  c.set("userId", session.user.id);
  c.set("userEmail", session.user.email);
  await next();
});
```

#### ディレクトリ構造

```
server/api/
├── src/
│   ├── index.ts          # Node.js サーバー起動
│   ├── app.ts            # Hono アプリ定義 (既存ロジック移植)
│   ├── auth.ts            # Better Auth 設定
│   ├── db/
│   │   └── client.ts     # Drizzle + node-postgres
│   ├── schema/           # Drizzle スキーマ (既存移植)
│   ├── middleware/
│   │   ├── auth.ts       # Better Auth ミドルウェア
│   │   └── rateLimit.ts  # Redis ベースレート制限
│   ├── routes/           # 既存ルート移植
│   │   ├── users.ts
│   │   ├── pages.ts
│   │   ├── notes.ts
│   │   ├── search.ts
│   │   ├── media.ts
│   │   ├── clip.ts
│   │   ├── ai/           # AI API 統合
│   │   │   ├── chat.ts
│   │   │   ├── models.ts
│   │   │   ├── usage.ts
│   │   │   └── subscription.ts
│   │   └── thumbnail/
│   │       ├── imageSearch.ts
│   │       ├── imageGenerate.ts
│   │       └── commit.ts
│   ├── services/         # ビジネスロジック
│   └── lib/              # ユーティリティ
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.json
└── drizzle.config.ts
```

#### railway.json

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "server/api/Dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/index.js",
    "healthcheckPath": "/api",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

#### Dockerfile

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER app
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

#### 環境変数

| 変数名                 | 説明                            | 値の例                                   |
| ---------------------- | ------------------------------- | ---------------------------------------- |
| `PORT`                 | APIサーバーポート               | `3000`                                   |
| `DATABASE_URL`         | PostgreSQL接続文字列            | `${{postgres.DATABASE_URL}}`             |
| `REDIS_URL`            | Redis接続文字列                 | `${{redis.REDIS_URL}}`                   |
| `BETTER_AUTH_SECRET`   | Better Auth暗号化キー           | ランダム文字列                           |
| `BETTER_AUTH_URL`      | Auth ベースURL                  | `https://api.zedi-note.app`              |
| `GOOGLE_CLIENT_ID`     | Google OAuth                    | Google Cloud Console                     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth                    | Google Cloud Console                     |
| `GITHUB_CLIENT_ID`     | GitHub OAuth                    | GitHub Developer Settings                |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth                    | GitHub Developer Settings                |
| `CORS_ORIGIN`          | フロントエンドURL               | `https://zedi-note.app`                  |
| `OPENAI_API_KEY`       | OpenAI API                      | OpenAI Dashboard                         |
| `ANTHROPIC_API_KEY`    | Anthropic API                   | Anthropic Console                        |
| `GOOGLE_AI_API_KEY`    | Google AI API                   | Google AI Studio                         |
| `POLAR_ACCESS_TOKEN`   | Polar 課金                      | Polar Dashboard                          |
| `POLAR_WEBHOOK_SECRET` | Polar Webhook                   | Polar Dashboard                          |
| `STORAGE_ENDPOINT`     | Railway Bucket S3エンドポイント | `${{media.RAILWAY_STORAGE_ENDPOINT}}`    |
| `STORAGE_ACCESS_KEY`   | Railway Bucket アクセスキー     | `${{media.RAILWAY_STORAGE_ACCESS_KEY}}`  |
| `STORAGE_SECRET_KEY`   | Railway Bucket シークレットキー | `${{media.RAILWAY_STORAGE_SECRET_KEY}}`  |
| `STORAGE_BUCKET_NAME`  | Railway Bucket名                | `${{media.RAILWAY_STORAGE_BUCKET_NAME}}` |

---

### 4.2 AI API (別Lambda → API統合)

#### 現在の構成

- 独立したLambda関数 (`terraform/modules/ai-api/lambda/`)
- WebSocket API Gateway でストリーミング対応
- DynamoDB でレート制限
- 独自のJWT検証ロジック

#### 移行方針

REST API サービスに統合する。WebSocket API Gateway でのストリーミングは **SSE (Server-Sent Events)** に変更する。

#### 理由

- Hono は SSE をネイティブサポート (`hono/streaming`)
- SSEは HTTP/1.1 上で動作し、Railway のプロキシと完全互換
- WebSocket API Gateway の複雑さ（$connect/$disconnect ルーティング）が不要になる
- フロントエンドの `EventSource` API でシンプルに受信可能
- AI API (OpenAI, Anthropic, Google) はすべて SSE でストリーミングを返すため、自然な構成

#### コード変更

```typescript
// 移行後: SSE ストリーミング
import { streamSSE } from "hono/streaming";

app.post("/api/ai/chat", authRequired, rateLimit, async (c) => {
  const body = await c.req.json();

  return streamSSE(c, async (stream) => {
    const aiStream = await getAIStream(body);
    for await (const chunk of aiStream) {
      await stream.writeSSE({ data: JSON.stringify(chunk) });
    }
  });
});
```

#### レート制限の変更

```typescript
// 移行前: DynamoDB
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

// 移行後: Redis
import { Redis } from "ioredis";

export async function checkRateLimit(
  redis: Redis,
  userId: string,
  tier: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate_limit:${userId}:${currentMinute()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  const limit = TIER_LIMITS[tier];
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
```

---

### 4.3 認証 (Cognito → Better Auth)

#### 現在の構成

- **バックエンド:** Cognito User Pool + API Gateway JWT Authorizer
- **フロントエンド:** OAuth 2.0 Authorization Code Flow (Cognito Hosted UI)
- **Hocuspocus:** `aws-jwt-verify` による Cognito JWT 検証
- **ソーシャルログイン:** Google OAuth, GitHub OAuth (Lambdaプロキシ経由)
- **トークン保存:** localStorage (`zedi_cognito_auth`)

#### 移行後の構成

- **バックエンド:** Better Auth ライブラリ (Hono API に内蔵)
- **フロントエンド:** Better Auth React クライアント
- **Hocuspocus:** Better Auth セッション検証 (API 経由)
- **ソーシャルログイン:** Better Auth プラグイン (Google, GitHub)
- **トークン保存:** Cookie (httpOnly, secure, sameSite)

#### Better Auth サーバー設定

```typescript
// server/api/src/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: false,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  trustedOrigins: [process.env.CORS_ORIGIN!],
});
```

#### Better Auth Hono マウント

```typescript
// server/api/src/app.ts
import { auth } from "./auth";

app.on(["POST", "GET"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});
```

#### Better Auth が自動生成するDBテーブル

```sql
-- Better Auth が管理するテーブル (Drizzle スキーマから自動生成)
CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "session" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "account" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  scope TEXT,
  id_token TEXT,
  password TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### フロントエンド認証クライアント

```typescript
// src/lib/auth/authClient.ts (cognitoAuth.ts を置き換え)
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

export const { signIn, signOut, signUp, useSession } = authClient;
```

#### フロントエンド認証フック

```typescript
// src/hooks/useAuth.ts (書き換え)
import { useSession, signIn, signOut } from "../lib/auth/authClient";

export function useAuth() {
  const { data: session, isPending } = useSession();

  return {
    isSignedIn: !!session,
    isLoaded: !isPending,
    user: session?.user ?? null,
    signIn: {
      google: () => signIn.social({ provider: "google" }),
      github: () => signIn.social({ provider: "github" }),
    },
    signOut: () => signOut(),
  };
}
```

#### Hocuspocus 認証の変更

```typescript
// 移行前: aws-jwt-verify
import { CognitoJwtVerifier } from "aws-jwt-verify";
const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "id" });
const payload = await verifier.verify(token);

// 移行後: Better Auth API 経由でセッション検証
async function verifySession(token: string): Promise<{ userId: string } | null> {
  const response = await fetch(`${process.env.API_INTERNAL_URL}/api/auth/get-session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const session = await response.json();
  return { userId: session.user.id };
}
```

#### ユーザーデータ移行

現在の `users` テーブルを Better Auth の `user` テーブルにマッピングする。

```sql
-- マイグレーションスクリプト
INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at)
SELECT
  id,
  COALESCE(display_name, email),
  email,
  true,
  avatar_url,
  created_at,
  updated_at
FROM users;

-- Cognito の社会ログインアカウントを account テーブルに移行
INSERT INTO "account" (id, user_id, account_id, provider_id, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id,
  cognito_sub,
  'google',  -- or 'github' (Cognito の identity provider に応じて)
  created_at,
  updated_at
FROM users
WHERE cognito_sub IS NOT NULL;
```

---

### 4.4 データベース (Aurora → Railway PostgreSQL)

#### 現在の構成

- Aurora Serverless v2 (PostgreSQL 15.8)
- RDS Data API 経由のアクセス
- `pg_bigm` 拡張 (日本語全文検索)
- 自動スケーリング (0-8 ACU)
- スケールトゥゼロ (auto-pause)

#### 移行後の構成

- Railway PostgreSQL (標準テンプレート)
- `pg` ドライバーによる直接接続
- `pg_trgm` 拡張 (PostgreSQL 標準同梱) で全文検索
- Railway の垂直オートスケーリング

#### pg_bigm → pg_trgm への変更理由

- `pg_bigm` はカスタム Docker イメージのビルドが必要で、Railway のセットアップが複雑になる
- `pg_trgm` は PostgreSQL に標準同梱されており、Railway の標準テンプレートで即座に利用可能
- Zedi は個人ノートアプリであり、1ユーザーあたり数千ページ規模。1-2文字の検索語でインデックスが効かない場合もフルスキャンで十分高速
- 検索クエリは `ILIKE` + アプリケーション側のエスケープに変更済み

#### 初期化スクリプト

```sql
-- docker/postgres/initdb.d/01_extensions.sql (ローカル開発用)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

#### マイグレーション戦略

Drizzle Kit を正式なマイグレーションツールとして採用する。

```typescript
// server/api/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

```bash
# マイグレーション生成
npx drizzle-kit generate

# マイグレーション適用
npx drizzle-kit migrate

# スキーマの視覚化
npx drizzle-kit studio
```

#### データ移行手順

1. Aurora のデータを `pg_dump` でエクスポート
2. Railway PostgreSQL を標準テンプレートでデプロイ
3. `pg_trgm` 拡張を有効化
4. `pg_restore` でデータをインポート
5. Better Auth テーブルのマイグレーション実行
6. ユーザーデータのマッピング (§4.3 参照)

---

### 4.5 Hocuspocus (ECS Fargate → Railway Service)

#### 変更点

変更は最小限。以下のみ対応：

1. Cognito JWT 検証 → Better Auth セッション検証
2. `aws-jwt-verify` 依存の削除
3. `railway.json` の追加

#### 環境変数の変更

| 現在                   | 移行後                                  |
| ---------------------- | --------------------------------------- |
| `COGNITO_USER_POOL_ID` | (削除)                                  |
| `DB_CREDENTIALS_JSON`  | `DATABASE_URL`                          |
| `REDIS_URL`            | `REDIS_URL` (変更なし)                  |
| (なし)                 | `API_INTERNAL_URL` (Better Auth 検証用) |

#### railway.json

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "server/hocuspocus/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

---

### 4.6 ストレージ (S3 → Railway Storage Buckets)

#### 現在の構成

- S3 バケット: メディアアップロード、サムネイル画像
- `@aws-sdk/client-s3` によるプリサインドURL生成
- CloudFront によるサムネイル配信

#### 移行後の構成

- Railway Storage Buckets (S3互換API)
- `@aws-sdk/client-s3` はそのまま使用可能 (S3互換のため)
- エンドポイントとクレデンシャルの変更のみ

#### コード変更

```typescript
// 移行前
import { S3Client } from "@aws-sdk/client-s3";
const s3 = new S3Client({ region: "ap-northeast-1" });

// 移行後
import { S3Client } from "@aws-sdk/client-s3";
const s3 = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT,
  region: "auto",
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.STORAGE_SECRET_KEY!,
  },
  forcePathStyle: true,
});
```

プリサインドURL の生成コードは変更不要（S3互換のため）。

---

### 4.7 フロントエンド (S3 + CloudFront → Cloudflare Pages)

#### 現在の構成

- Vite ビルド → S3 アップロード → CloudFront 配信
- `scripts/deploy/deploy-to-aws.ts` による手動デプロイ
- GitHub Actions `deploy-prod.yml` による自動デプロイ

#### 移行後の構成

- Vite ビルド → Cloudflare Pages デプロイ
- GitHub連携による自動デプロイ or GitHub Actions

#### 環境変数の変更

| 現在                               | 移行後                                       |
| ---------------------------------- | -------------------------------------------- |
| `VITE_COGNITO_DOMAIN`              | (削除)                                       |
| `VITE_COGNITO_CLIENT_ID`           | (削除)                                       |
| `VITE_COGNITO_REDIRECT_URI`        | (削除)                                       |
| `VITE_COGNITO_LOGOUT_REDIRECT_URI` | (削除)                                       |
| `VITE_ZEDI_API_BASE_URL`           | `VITE_API_BASE_URL`                          |
| `VITE_AI_WS_URL`                   | (削除 - SSEに変更のため)                     |
| `VITE_REALTIME_URL`                | `VITE_REALTIME_URL` (変更なし)               |
| (なし)                             | `VITE_API_BASE_URL` (Better Auth + REST API) |

---

### 4.8 レート制限 (DynamoDB → Redis)

#### 移行後の実装

```typescript
// server/api/src/middleware/rateLimit.ts
import { Redis } from "ioredis";
import { createMiddleware } from "hono/factory";

const TIER_LIMITS: Record<string, number> = {
  free: 10,
  pro: 100,
};

function currentWindow(): string {
  return new Date().toISOString().slice(0, 16); // per-minute window
}

export function rateLimit(tier: string = "free") {
  return createMiddleware(async (c, next) => {
    const redis = c.get("redis") as Redis;
    const userId = c.get("userId");
    const key = `ratelimit:${userId}:${currentWindow()}`;

    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 120);

    const limit = TIER_LIMITS[tier] || TIER_LIMITS.free;
    if (count > limit) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
    await next();
  });
}
```

---

## 5. ディレクトリ構造の変更

### 移行前

```
zedi/
├── terraform/              # Terraform IaC (削除)
│   └── modules/
│       ├── api/lambda/     # REST API Lambda
│       ├── ai-api/lambda/  # AI API Lambda
│       ├── security/       # Cognito
│       ├── cdn/            # CloudFront
│       └── ...
├── server/
│   └── hocuspocus/         # Hocuspocus (変更小)
├── src/                    # React フロントエンド
├── scripts/deploy/         # AWS デプロイスクリプト
└── .github/workflows/      # AWS用 CI/CD
```

### 移行後

```
zedi/
├── server/
│   ├── api/                # 統合 REST API (新規)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts
│   │   │   ├── auth.ts
│   │   │   ├── db/
│   │   │   ├── schema/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── lib/
│   │   ├── drizzle/        # マイグレーションファイル
│   │   ├── drizzle.config.ts
│   │   ├── Dockerfile
│   │   ├── railway.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── hocuspocus/         # リアルタイムサーバー (変更小)
│       ├── src/
│       ├── Dockerfile
│       ├── railway.json    # 新規追加
│       └── package.json
├── docker/
│   └── postgres/           # ローカル開発用 PostgreSQL 設定
│       ├── Dockerfile       # ローカル用 (標準 postgres イメージ)
│       └── initdb.d/
│           └── 01_extensions.sql
├── src/                    # React フロントエンド (認証部分変更)
│   ├── lib/auth/
│   │   └── authClient.ts   # Better Auth クライアント (新規)
│   └── hooks/
│       └── useAuth.ts      # 認証フック (書き換え)
├── .github/workflows/
│   ├── ci.yml              # CI (更新)
│   ├── deploy-prod.yml     # 本番デプロイ (書き換え)
│   └── deploy-dev.yml      # 開発デプロイ (書き換え)
├── db/
│   └── migrations/         # Drizzle マイグレーション
└── scripts/
    └── migrate-users.ts    # ユーザーデータ移行スクリプト
```

---

## 6. CI/CD パイプライン

### 6.1 本番デプロイ (`deploy-prod.yml`)

```yaml
name: Deploy Production

on:
  push:
    branches: [main]

jobs:
  migrate:
    name: Run Database Migrations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install dependencies
        working-directory: server/api
        run: npm ci
      - name: Run migrations
        working-directory: server/api
        run: npx drizzle-kit migrate
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}

  deploy-api:
    name: Deploy API
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: railwayapp/cli-action@v1
        with:
          token: ${{ secrets.RAILWAY_TOKEN }}
          command: up --service api --environment production -d

  deploy-hocuspocus:
    name: Deploy Hocuspocus
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: railwayapp/cli-action@v1
        with:
          token: ${{ secrets.RAILWAY_TOKEN }}
          command: up --service hocuspocus --environment production -d

  deploy-frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install & Build
        run: npm ci && npm run build
        env:
          VITE_API_BASE_URL: ${{ vars.PROD_API_BASE_URL }}
          VITE_REALTIME_URL: ${{ vars.PROD_REALTIME_URL }}
          VITE_POLAR_PRO_MONTHLY_PRODUCT_ID: ${{ vars.POLAR_MONTHLY_ID }}
          VITE_POLAR_PRO_YEARLY_PRODUCT_ID: ${{ vars.POLAR_YEARLY_ID }}
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=zedi
```

### 6.2 開発デプロイ (`deploy-dev.yml`)

```yaml
name: Deploy Development

on:
  push:
    branches: [develop]

jobs:
  migrate:
    name: Run Database Migrations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - working-directory: server/api
        run: npm ci && npx drizzle-kit migrate
        env:
          DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}

  deploy-api:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: railwayapp/cli-action@v1
        with:
          token: ${{ secrets.RAILWAY_TOKEN }}
          command: up --service api --environment development -d

  deploy-hocuspocus:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: railwayapp/cli-action@v1
        with:
          token: ${{ secrets.RAILWAY_TOKEN }}
          command: up --service hocuspocus --environment development -d
```

### 6.3 CI (`ci.yml`)

```yaml
name: CI

on:
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - run: npm run test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - run: npm run build
```

---

## 7. 移行フェーズ

### Phase 1: 基盤準備 (推定: 1-2日)

1. Railway プロジェクト作成 (production / development 環境)
2. Railway PostgreSQL デプロイ (標準テンプレート + pg_trgm)
3. Railway Redis デプロイ
4. Railway Storage Bucket 作成
5. Cloudflare Pages プロジェクト作成
6. `server/api/` ディレクトリ構造の作成

### Phase 2: API 移行 (推定: 3-5日)

1. Hono アプリを `@hono/node-server` に変換
2. DB クライアントを `node-postgres` アダプタに変更
3. Better Auth の設定と認証テーブル作成
4. 認証ミドルウェアの書き換え
5. AI API の統合 (WebSocket → SSE)
6. レート制限の Redis 化
7. S3 クライアントのエンドポイント変更 (Railway Buckets)
8. Secrets Manager → 環境変数直接参照への変更
9. ローカルでの動作確認

### Phase 3: フロントエンド移行 (推定: 1-2日)

1. Cognito Auth → Better Auth クライアントへの変更
2. `useAuth` フックの書き換え
3. `AuthCallback` コンポーネントの削除/変更
4. WebSocket AI → SSE への変更
5. 環境変数の更新
6. ローカルでの動作確認

### Phase 4: Hocuspocus 移行 (推定: 0.5-1日)

1. Cognito JWT 検証 → Better Auth セッション検証
2. `aws-jwt-verify` 依存の削除
3. DB 接続の確認 (既に直接接続のため変更小)
4. `railway.json` の追加

### Phase 5: データ移行 (推定: 1日)

1. Aurora → Railway PostgreSQL へのデータ移行
2. ユーザーデータの Better Auth テーブルへのマッピング
3. S3 → Railway Storage Buckets へのファイル移行
4. データ整合性の検証

### Phase 6: CI/CD & デプロイ (推定: 1日)

1. GitHub Actions ワークフローの書き換え
2. GitHub Secrets の設定
3. デプロイの動作確認
4. DNS 切り替え

### Phase 7: クリーンアップ (推定: 0.5日)

1. `terraform/` ディレクトリの削除
2. `scripts/deploy/deploy-to-aws.ts` の削除
3. AWS SDK 依存の削除 (RDS Data API, Secrets Manager, DynamoDB)
4. 不要な環境変数の整理
5. ドキュメントの更新

**合計推定: 8-12日**

---

## 8. 削除対象

### ディレクトリ

- `terraform/` (全体)
- `scripts/deploy/deploy-to-aws.ts`
- `scripts/sync/` (Aurora固有スクリプト)
- `scripts/migration/transform-for-aurora/`
- `db/aurora/` (Drizzle Kit に移行)

### ファイル

- `.github/workflows/deploy-prod.yml` (書き換え)
- `.github/workflows/deploy-dev.yml` (書き換え)
- `.github/workflows/terraform-plan.yml` (削除)
- `src/lib/auth/cognitoAuth.ts` (Better Auth に置き換え)
- `src/components/auth/CognitoAuthProvider.tsx` (Better Auth に置き換え)
- `docker-compose.dev.yml` (必要に応じて更新)
- `.env.production.example` (更新)

### npm 依存の削除

- `@aws-sdk/client-rds-data`
- `@aws-sdk/client-secrets-manager`
- `@aws-sdk/client-dynamodb`
- `aws-jwt-verify`

### npm 依存の追加

- `better-auth`
- `@better-auth/cli`
- `@hono/node-server`
- `pg` (server/api)
- `drizzle-orm` (node-postgres アダプタ追加)

---

## 9. リスクと対策

| リスク                                     | 影響度 | 対策                                                                                   |
| ------------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| 日本語全文検索の精度 (1-2文字)             | 低     | pg_trgm は3文字未満でインデックスが効かないが、Zedi の規模ではフルスキャンでも問題なし |
| Better Auth のソーシャルログインで問題発生 | 高     | 十分なテスト期間を確保、OAuth リダイレクトURL の事前登録                               |
| データ移行でデータ欠損                     | 高     | 移行前にフルバックアップ、移行後にカウント比較検証                                     |
| Railway WebSocket の 60秒タイムアウト      | 中     | Hocuspocus の ping 間隔を 30秒に設定                                                   |
| Railway の障害/メンテナンス                | 中     | Cloudflare Pages はRailway非依存、DB定期バックアップ                                   |
| 既存ユーザーの再ログインが必要             | 中     | 移行告知、ソーシャルログインで再認証は容易                                             |

---

## 10. ローカル開発環境

### docker-compose.dev.yml (更新)

```yaml
services:
  postgres:
    build:
      context: .
      dockerfile: docker/postgres/Dockerfile
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: zedi
      POSTGRES_USER: zedi
      POSTGRES_PASSWORD: zedi_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      dockerfile: server/api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
      DATABASE_URL: postgres://zedi:zedi_dev@postgres:5432/zedi
      REDIS_URL: redis://redis:6379
      BETTER_AUTH_SECRET: dev-secret-change-in-production
      BETTER_AUTH_URL: http://localhost:3000
      CORS_ORIGIN: http://localhost:5173
    depends_on:
      - postgres
      - redis

  hocuspocus:
    build:
      context: .
      dockerfile: server/hocuspocus/Dockerfile
    ports:
      - "1234:1234"
    environment:
      PORT: "1234"
      DATABASE_URL: postgres://zedi:zedi_dev@postgres:5432/zedi
      REDIS_URL: redis://redis:6379
      API_INTERNAL_URL: http://api:3000
    depends_on:
      - postgres
      - redis
      - api

volumes:
  postgres_data:
  redis_data:
```

---

## 11. 完了条件

- [ ] Railway 上で API が正常に動作する
- [ ] Railway 上で Hocuspocus が正常に動作する
- [ ] Better Auth でGoogle/GitHubソーシャルログインが機能する
- [ ] Drizzle Kit によるマイグレーションが動作する
- [ ] pg_trgm + ILIKE による日本語全文検索が動作する
- [ ] SSE による AI チャットストリーミングが動作する
- [ ] Railway Storage Buckets でメディアアップロードが動作する
- [ ] Cloudflare Pages でフロントエンドが配信される
- [ ] Redis によるレート制限が動作する
- [ ] CI/CD パイプラインが正常に動作する
- [ ] 既存データが正しく移行される
- [ ] Terraform ディレクトリが削除される
- [ ] AWS 固有の依存が削除される
