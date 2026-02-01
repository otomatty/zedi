# 作業ログ: Hocuspocus サーバー実装・デプロイ

**作業日:** 2026-02-01  
**作業者:** -  
**ステータス:** 完了 ✅

---

## 1. 作業サマリー

AWS ECS Fargate上で動作するHocuspocusリアルタイム同期サーバーの最小実装とデプロイを完了。

### 1.1 完了した作業

| # | 作業内容 | ステータス |
|---|----------|-----------|
| 1 | サーバーディレクトリ構成作成 | ✅ 完了 |
| 2 | Hocuspocusサーバー実装（最小版） | ✅ 完了 |
| 3 | Dockerfile作成 | ✅ 完了 |
| 4 | ECRへDockerイメージプッシュ | ✅ 完了 |
| 5 | ECSサービス更新・タスク起動確認 | ✅ 完了 |

### 1.2 作成したファイル

```
server/
└── hocuspocus/
    ├── package.json          # 依存関係定義
    ├── package-lock.json     # ロックファイル
    ├── tsconfig.json         # TypeScript設定
    ├── Dockerfile            # コンテナビルド定義
    ├── .dockerignore         # Docker除外設定
    └── src/
        └── index.ts          # サーバーエントリーポイント
```

---

## 2. 実装詳細

### 2.1 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| Runtime | Node.js | 20-alpine |
| Framework | @hocuspocus/server | ^3.4.4 |
| WebSocket | ws | ^8.x |
| Build | TypeScript | ^5.6.0 |
| Dev | tsx | ^4.19.0 |

### 2.2 サーバー機能（最小実装）

| 機能 | 実装状態 | 備考 |
|------|----------|------|
| WebSocket接続 | ✅ | Hocuspocus経由 |
| ヘルスチェック | ✅ | `/health` エンドポイント |
| 認証 | ⚠️ スキップ | 開発用（全リクエスト許可） |
| 永続化 | ⚠️ メモリのみ | 開発用（DB未接続） |
| Redis連携 | ❌ 未実装 | TODO |
| Cognito JWT検証 | ❌ 未実装 | TODO |

### 2.3 実装コードのポイント

```typescript
// カスタムHTTPサーバー + WebSocketサーバー構成
const httpServer = createServer((req, res) => {
  // ヘルスチェック処理
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket, request) => {
  hocuspocus.handleConnection(socket, request);
});
```

**注意点:**
- Hocuspocus v3では `handleUpgrade` ではなく `handleConnection` を使用
- `onRequest` フックでレスポンス送信するとヘッダー重複エラーが発生するため、カスタムHTTPサーバーを使用

---

## 3. デプロイ情報

### 3.1 ECRリポジトリ

```
590183877893.dkr.ecr.ap-northeast-1.amazonaws.com/zedi-dev-hocuspocus:latest
```

### 3.2 ECSサービス状態

```json
{
  "runningCount": 1,
  "desiredCount": 1,
  "status": "ACTIVE",
  "latestEvent": "(service zedi-dev-hocuspocus) has reached a steady state."
}
```

### 3.3 エンドポイント

| エンドポイント | URL |
|---------------|-----|
| Health Check | `http://zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com/health` |
| WebSocket | `ws://zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com` |

### 3.4 ヘルスチェック応答例

```json
{
  "status": "healthy",
  "service": "zedi-hocuspocus",
  "timestamp": "2026-01-31T22:31:11.215Z",
  "connections": 0,
  "documents": 0
}
```

---

## 4. デプロイ手順（再現用）

### 4.1 ビルド

```bash
cd server/hocuspocus
npm install
npm run build
```

### 4.2 Dockerイメージビルド

```bash
docker build -t zedi-hocuspocus .
```

### 4.3 ECRログイン・プッシュ

```bash
# ECRログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  590183877893.dkr.ecr.ap-northeast-1.amazonaws.com

# タグ付け
docker tag zedi-hocuspocus:latest \
  590183877893.dkr.ecr.ap-northeast-1.amazonaws.com/zedi-dev-hocuspocus:latest

# プッシュ
docker push 590183877893.dkr.ecr.ap-northeast-1.amazonaws.com/zedi-dev-hocuspocus:latest
```

### 4.4 ECSサービス更新

```bash
aws ecs update-service \
  --cluster zedi-dev-cluster \
  --service zedi-dev-hocuspocus \
  --force-new-deployment \
  --region ap-northeast-1
```

---

## 5. トラブルシューティング

### 5.1 発生した問題と解決策

| 問題 | 原因 | 解決策 |
|------|------|--------|
| `handleUpgrade` が存在しない | Hocuspocus v3 API変更 | `ws`パッケージを使用し`handleConnection`を呼び出す |
| `ERR_HTTP_HEADERS_SENT` | `onRequest`フック内でレスポンス送信後にHocuspocusが追加ヘッダー送信 | カスタムHTTPサーバーを作成しヘルスチェックを分離 |
| AWS CLI パスが通らない | winget経由インストール後のパス未反映 | フルパスで実行: `C:\Program Files\Amazon\AWSCLIV2\aws.exe` |

### 5.2 Hocuspocus v3 API変更について

#### 背景

Hocuspocus v2からv3へのメジャーアップデートで、サーバーAPIに重要な変更がありました。

#### 公式ドキュメント引用

**Usage（https://tiptap.dev/docs/hocuspocus/server/usage）より:**

> There are two ways on how you can use hocuspocus. Either with the built-in server. Or with another framework, for example with Express.

**Hocuspocus クラスのメソッド:**

| メソッド | 説明 |
|---------|------|
| `configure(configuration)` | カスタム設定を渡す |
| `handleConnection(incoming, request, context)` | 既存のサーバーインスタンスにバインド |
| `getDocumentsCount()` | アクティブなドキュメント数を取得 |
| `getConnectionsCount()` | アクティブな接続数を取得 |
| `closeConnections(documentName?)` | 全接続または特定ドキュメントの接続を閉じる |
| `openDirectConnection(documentName, context)` | ドキュメントへのローカル接続を作成 |

#### 正しい実装パターン（Express例）

公式ドキュメント（https://tiptap.dev/docs/hocuspocus/server/examples）より：

```typescript
import express from 'express'
import expressWebsockets from 'express-ws'
import { Hocuspocus } from '@hocuspocus/server'

// Configure Hocuspocus
const hocuspocus = new Hocuspocus({
  // ...
})

// Setup your express instance using the express-ws extension
const { app } = expressWebsockets(express())

// A basic http route
app.get('/', (request, response) => {
  response.send('Hello World!')
})

// Add a websocket route for Hocuspocus
app.ws('/collaboration', (websocket, request) => {
  const context = {
    user: {
      id: 1234,
      name: 'Jane',
    },
  }

  hocuspocus.handleConnection(websocket, request, context)
})

// Start the server
app.listen(1234, () => console.log('Listening on http://127.0.0.1:1234'))
```

#### 重要な注意事項

公式ドキュメントより：

> **IMPORTANT!** Some extensions use the `onRequest`, `onUpgrade` and `onListen` hooks, which will not be fired in this scenario.

カスタムHTTPサーバーを使用する場合、これらのフックは自動的には呼び出されないため、必要に応じて手動で処理する必要があります。

### 5.3 発生したエラーログ

#### ERR_HTTP_HEADERS_SENT エラー

`onRequest`フックを使用してヘルスチェックを実装した際に発生：

```
node:_http_server:344
    throw new ERR_HTTP_HEADERS_SENT('write');
          ^
Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client
    at ServerResponse.writeHead (node:_http_server:344:11)
    at Server$1.requestHandler (file:///app/node_modules/@hocuspocus/server/dist/hocuspocus-server.esm.js:1998:26)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5) {
  code: 'ERR_HTTP_HEADERS_SENT'
}
```

**原因**: `onRequest`フック内でレスポンスを送信した後、Hocuspocusの内部処理が追加のヘッダーを書き込もうとしたため。

**解決策**: カスタムHTTPサーバー + `ws`パッケージを使用し、Hocuspocusの組み込みHTTPサーバーを使用しない構成に変更。

### 5.4 参考リンク

| リソース | URL |
|---------|-----|
| Hocuspocus 公式ドキュメント | https://tiptap.dev/docs/hocuspocus/introduction |
| サーバー設定 | https://tiptap.dev/docs/hocuspocus/server/configuration |
| フック一覧 | https://tiptap.dev/docs/hocuspocus/server/hooks |
| 使用方法・メソッド | https://tiptap.dev/docs/hocuspocus/server/usage |
| サーバー例（Express/Koa等） | https://tiptap.dev/docs/hocuspocus/server/examples |
| GitHub リポジトリ | https://github.com/ueberdosis/hocuspocus |
| 最新バージョン | v3.4.4 (2026年1月時点) |

---

## 6. 次のステップ（Phase B）

### 6.1 サーバーサイド拡張

- [ ] Cognito JWT検証の実装
- [ ] Redis連携（マルチインスタンス同期）
- [ ] Aurora PostgreSQL永続化

### 6.2 クライアントサイド実装

- [ ] Y.js関連パッケージインストール（`yjs`, `y-websocket`, `y-indexeddb`）
- [ ] Tiptap Collaboration拡張追加
- [ ] CollaborationManager実装
- [ ] 接続状態UI・プレゼンス表示

---

## 7. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Hocuspocus実装ガイド（参考） | [../20260131/hocuspocus-server-implementation.md](../20260131/hocuspocus-server-implementation.md) |
| Phase 5 インフラ作業ログ | [../20260131/aws-infrastructure-phase5-realtime.md](../20260131/aws-infrastructure-phase5-realtime.md) |
| リアルタイム同時編集仕様 | [../../specs/realtime-collaboration-specification.md](../../specs/realtime-collaboration-specification.md) |
| アプリケーション実装計画 | [../../specs/application-implementation-plan.md](../../specs/application-implementation-plan.md) |

---

*作成日: 2026-02-01*
