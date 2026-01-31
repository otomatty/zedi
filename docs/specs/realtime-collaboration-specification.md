# リアルタイム同時編集機能 仕様書

**Document Version:** 1.0  
**Created:** 2026-01-31  
**Status:** Draft  

---

## 1. 概要

### 1.1 目的

Zediにリアルタイム同時編集機能を実装し、複数ユーザーが同一ページを同時に編集できるようにする。また、オフライン時でも編集を継続でき、オンライン復帰時に自動的にクラウドと同期する仕組みを構築する。

### 1.2 設計思想

**「Online-First with Offline Resilience」**

| 優先度 | 機能 | 説明 |
|--------|------|------|
| 高 | リアルタイム同期 | WebSocketによる即座の変更反映 |
| 高 | 衝突解決 | CRDTによる自動マージ（データ損失なし） |
| 中 | オフライン対応 | ローカル保存と復帰時の自動同期 |
| 中 | プレゼンス | 編集中ユーザー・カーソル位置の表示 |

### 1.3 スコープ

#### In Scope
- ページ単位のリアルタイム同時編集
- Y.js (CRDT) による衝突解決
- IndexedDBによるオフライン対応
- カーソル位置・選択範囲の共有
- AWSへのインフラ移行（Terraform管理）

#### Out of Scope（将来対応）
- コメント・メンション機能
- バージョン履歴・復元
- リアルタイム音声/ビデオ通話
- 編集権限の細分化（閲覧のみ等）

---

## 2. システムアーキテクチャ

### 2.1 全体構成図

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              クライアント (Browser)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐    │
│   │                         Tiptap Editor                              │    │
│   │                    + Collaboration Extension                       │    │
│   │                    + CollaborationCursor Extension                 │    │
│   └───────────────────────────────┬───────────────────────────────────┘    │
│                                   │                                         │
│                                   ▼                                         │
│   ┌───────────────────────────────────────────────────────────────────┐    │
│   │                          Y.Doc (CRDT)                              │    │
│   │              ドキュメントの「Single Source of Truth」                │    │
│   └───────────┬───────────────────────────────────┬───────────────────┘    │
│               │                                   │                         │
│               ▼                                   ▼                         │
│   ┌─────────────────────┐             ┌─────────────────────┐              │
│   │   y-indexeddb       │             │   y-websocket       │              │
│   │   (ローカル永続化)    │             │   (リアルタイム同期)  │              │
│   └─────────────────────┘             └──────────┬──────────┘              │
│                                                  │                          │
│   ┌──────────────────────────────────────────────┴──────────────────────┐  │
│   │                      ConnectionManager                               │  │
│   │   • 接続状態監視 • 自動再接続 • オフライン検出 • 同期状態表示         │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                  │                          │
└──────────────────────────────────────────────────┼──────────────────────────┘
                                                   │ WSS (WebSocket Secure)
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS Cloud (コスト最適化構成)                         │
│                              ~$76/月 (小規模運用時)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                         Public Subnet                               │    │
│  │  ┌──────────────────┐      ┌──────────────────┐                    │    │
│  │  │   CloudFront     │      │   ALB            │                    │    │
│  │  │   (静的assets)    │      │   (WebSocket)    │                    │    │
│  │  └────────┬─────────┘      └────────┬─────────┘                    │    │
│  └───────────┼─────────────────────────┼──────────────────────────────┘    │
│              │                         │                                    │
│  ┌───────────┼─────────────────────────┼──────────────────────────────┐    │
│  │           │    Private Subnet       │                               │    │
│  │           ▼                         ▼                               │    │
│  │  ┌──────────────────┐   ┌─────────────────────────────────┐        │    │
│  │  │   S3 Bucket      │   │   ECS Fargate Spot (70%割引)    │        │    │
│  │  │   (Frontend)     │   │  ┌───────────┐ ┌───────────┐    │        │    │
│  │  └──────────────────┘   │  │Hocuspocus │ │Hocuspocus │    │        │    │
│  │                         │  │ (Spot)    │ │ (On-Demand)│    │        │    │
│  │  ┌──────────────────┐   │  └───────────┘ └───────────┘    │        │    │
│  │  │  VPC Endpoints   │   └──────────────┬──────────────────┘        │    │
│  │  │  (NAT Gateway代替)│                  │                           │    │
│  │  │  • ECR API/DKR   │   ┌──────────────┼────────────────────┐      │    │
│  │  │  • CloudWatch    │   ▼              ▼                    ▼      │    │
│  │  │  • Secrets Mgr   │                                              │    │
│  │  └──────────────────┘   ┌──────────────────┐   ┌──────────────┐   │    │
│  │  ┌──────────────────┐   │  Aurora          │   │  S3          │   │    │
│  │  │  ElastiCache     │   │  Serverless v2   │   │  (Snapshots) │   │    │
│  │  │  (t4g.micro)     │   │  (0.5-4 ACU)     │   │              │   │    │
│  │  │  Graviton2       │   │                  │   │              │   │    │
│  │  │  • Pub/Sub       │   │  • メタデータ     │   │  • Y.Doc履歴 │   │    │
│  │  │  • プレゼンス     │   │  • ユーザー      │   │  • バックアップ│   │    │
│  │  └──────────────────┘   └──────────────────┘   └──────────────┘   │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Supporting Services                                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │  Cognito    │  │  Lambda     │  │  CloudWatch │  │  WAF       │  │   │
│  │  │  (認証)      │  │  (REST API) │  │  (監視)      │  │  (保護)    │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 データフロー

#### 2.2.1 リアルタイム編集フロー（オンライン時）

```
User A (Browser)                    AWS                         User B (Browser)
      │                              │                                │
      │ 1. キー入力                   │                                │
      ▼                              │                                │
┌─────────────┐                      │                                │
│ Y.Doc更新   │                      │                                │
└──────┬──────┘                      │                                │
       │                             │                                │
       ├──────────────────────────►  │                                │
       │ 2. WebSocket送信            │                                │
       │    (Y.js update binary)     │                                │
       │                      ┌──────▼──────┐                         │
       │                      │ Hocuspocus  │                         │
       │                      │ ・更新適用   │                         │
       │                      │ ・Redis配信  │                         │
       │                      └──────┬──────┘                         │
       │                             │                                │
       │                             ├───────────────────────────────►│
       │                             │ 3. WebSocket配信               │
       │                             │    (Y.js update binary)        │
       │                             │                         ┌──────▼──────┐
       │                             │                         │ Y.Doc更新   │
       │                             │                         │ (自動マージ) │
       │                             │                         └─────────────┘
       │                             │                                │
       │                      ┌──────▼──────┐                         │
       │                      │ Aurora保存  │                         │
       │                      │ (非同期)     │                         │
       │                      └─────────────┘                         │
       │                                                              │
  [~50ms]                       [~10ms]                          [~50ms]
       │◄────────────────────────────────────────────────────────────►│
                            合計レイテンシ: ~100-200ms
```

#### 2.2.2 オフライン→オンライン復帰フロー

```
┌─────────────────────────────────────────────────────────────────────┐
│                        状態遷移図                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐                      ┌──────────────┐            │
│   │              │    WebSocket接続     │              │            │
│   │   OFFLINE    │ ──────────────────► │   SYNCING    │            │
│   │              │                      │              │            │
│   └──────┬───────┘                      └──────┬───────┘            │
│          │                                     │                    │
│          │ ローカル編集継続                    │ 差分交換           │
│          │ (IndexedDB保存)                     │ (Y.js sync)        │
│          │                                     │                    │
│          ▼                                     ▼                    │
│   ┌──────────────┐                      ┌──────────────┐            │
│   │  IndexedDB   │                      │   ONLINE     │            │
│   │  に保存      │                      │   (通常稼働)  │            │
│   └──────────────┘                      └──────────────┘            │
│                                                │                    │
│                        切断検出                │                    │
│                 ◄──────────────────────────────┘                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

復帰時の同期詳細:
1. WebSocket再接続
2. クライアント: StateVector送信 (どこまで持っているか)
3. サーバー: 差分Update送信 (クライアントが持っていない部分)
4. クライアント: 差分Update送信 (オフライン中の編集)
5. 双方向マージ完了 (CRDTにより衝突なし)
```

---

## 3. 技術仕様

### 3.1 使用技術スタック

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| **CRDT** | Y.js | ^13.6.0 | ドキュメント同期の基盤 |
| **エディタ** | Tiptap | ^2.x | リッチテキストエディタ |
| **同期(Client)** | y-websocket | ^1.5.0 | WebSocket通信 |
| **永続化(Client)** | y-indexeddb | ^9.0.0 | ローカル保存 |
| **同期(Server)** | Hocuspocus | ^2.x | Y.js WebSocketサーバー |
| **Pub/Sub** | Redis (ElastiCache) | 7.x | マルチインスタンス同期 |
| **Database** | Aurora PostgreSQL | 15.x | メタデータ・検索 |
| **IaC** | Terraform | ^1.6.0 | インフラ管理 |
| **Container** | ECS Fargate | - | サーバーレスコンテナ |
| **認証** | Amazon Cognito | - | ユーザー認証・JWT |

### 3.2 Y.Docスキーマ設計

```typescript
// Y.Docの構造定義
interface ZediYDoc {
  // Tiptap/ProseMirrorのXMLフラグメント
  prosemirror: Y.XmlFragment;
  
  // メタデータ（タイトル等）
  meta: Y.Map<string | number | boolean>;
  
  // 将来拡張用
  // comments: Y.Array<Comment>;
  // history: Y.Array<HistoryEntry>;
}

// メタデータの型
interface DocumentMeta {
  title: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}
```

### 3.3 プレゼンス情報

```typescript
// Awarenessで共有する情報
interface UserPresence {
  // ユーザー識別
  userId: string;
  userName: string;
  userColor: string;  // カーソル色 (自動割り当て)
  
  // カーソル位置
  cursor: {
    anchor: number;
    head: number;
  } | null;
  
  // 選択範囲
  selection: {
    from: number;
    to: number;
  } | null;
  
  // ステータス
  status: 'active' | 'idle' | 'away';
  lastActivity: number;
}
```

### 3.4 API仕様

#### 3.4.1 WebSocket API (Hocuspocus)

```
Endpoint: wss://realtime.zedi-note.app/

Connection Parameters:
  - token: JWT認証トークン (required)

Document Name Format:
  - page-{pageId}  (例: page-abc123def456)

Protocol: Y.js WebSocket Protocol
  - Awareness updates
  - Document sync
  - Authentication
```

#### 3.4.2 REST API (Lambda + API Gateway)

```yaml
# ページ一覧取得
GET /api/pages
  Query:
    - limit: number (default: 50)
    - cursor: string (pagination)
  Response:
    - pages: PageSummary[]
    - nextCursor: string | null

# ページ作成
POST /api/pages
  Body:
    - title?: string
  Response:
    - page: Page

# ページ削除
DELETE /api/pages/{pageId}
  Response:
    - success: boolean

# 全文検索
GET /api/search
  Query:
    - q: string (検索クエリ)
    - limit: number
  Response:
    - results: SearchResult[]
```

---

## 4. データベース設計

### 4.1 Aurora PostgreSQL スキーマ

```sql
-- ユーザー情報 (Cognitoと同期)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    cognito_sub TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ドキュメント (ページ)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    
    -- Y.Doc状態 (バイナリ)
    ydoc_state BYTEA NOT NULL,
    ydoc_version BIGINT NOT NULL DEFAULT 0,
    
    -- 検索・表示用 (Y.Docから派生)
    title TEXT,
    content_text TEXT,
    content_preview TEXT,
    thumbnail_url TEXT,
    
    -- メタデータ
    source_url TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 全文検索インデックス
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(content_text, '')), 'B')
    ) STORED
);

CREATE INDEX idx_documents_owner ON documents(owner_id);
CREATE INDEX idx_documents_updated ON documents(updated_at DESC);
CREATE INDEX idx_documents_search ON documents USING GIN(search_vector);

-- リンク関係
CREATE TABLE links (
    source_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_id, target_id)
);

CREATE INDEX idx_links_source ON links(source_id);
CREATE INDEX idx_links_target ON links(target_id);

-- ゴーストリンク (未作成ページへのリンク)
CREATE TABLE ghost_links (
    link_text TEXT NOT NULL,
    source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (link_text, source_document_id)
);

CREATE INDEX idx_ghost_links_text ON ghost_links(link_text);

-- ドキュメント共有
CREATE TABLE document_shares (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    shared_with_email TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'view', -- 'view' | 'edit'
    invited_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_id, shared_with_email)
);

-- Y.Doc履歴スナップショット (S3参照)
CREATE TABLE document_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    s3_key TEXT NOT NULL,
    version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_document ON document_snapshots(document_id, version DESC);
```

### 4.2 Redis データ構造

```
# プレゼンス情報 (Hash)
presence:{documentId}:{connectionId}
  userId: string
  userName: string
  userColor: string
  cursor: JSON
  lastActivity: timestamp
  TTL: 30秒 (自動更新)

# ドキュメント購読者 (Set)
subscribers:{documentId}
  {connectionId1}
  {connectionId2}
  ...

# 接続情報 (Hash)
connection:{connectionId}
  userId: string
  documentId: string
  instanceId: string (ECSタスクID)
  connectedAt: timestamp

# Pub/Sub チャンネル
channel:document:{documentId}  # ドキュメント更新通知
channel:presence:{documentId}  # プレゼンス更新通知
```

---

## 5. セキュリティ設計

### 5.1 認証・認可

```
┌─────────────────────────────────────────────────────────────────────┐
│                        認証フロー                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. ログイン                                                        │
│     User ──► Cognito ──► ID Token + Access Token                   │
│                                                                     │
│  2. API呼び出し                                                     │
│     User ──► API Gateway ──► Lambda                                │
│              │                                                      │
│              └─► Cognito Authorizer (JWT検証)                       │
│                                                                     │
│  3. WebSocket接続                                                   │
│     User ──► ALB ──► Hocuspocus                                    │
│                       │                                             │
│                       └─► JWT検証 (onAuthenticate)                  │
│                       └─► ドキュメントアクセス権確認                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 アクセス制御

```typescript
// ドキュメントアクセス権の判定
async function checkDocumentAccess(
  userId: string,
  documentId: string,
  requiredPermission: 'view' | 'edit'
): Promise<boolean> {
  // 1. オーナーチェック
  const doc = await getDocument(documentId);
  if (doc.ownerId === userId) return true;
  
  // 2. 共有設定チェック
  const share = await getDocumentShare(documentId, userId);
  if (!share) return false;
  
  // 3. 権限レベルチェック
  if (requiredPermission === 'view') {
    return share.permission === 'view' || share.permission === 'edit';
  }
  return share.permission === 'edit';
}
```

### 5.3 ネットワークセキュリティ

| レイヤー | 対策 |
|---------|------|
| Edge | CloudFront + WAF (DDoS/Bot対策) |
| Transport | TLS 1.3 (HTTPS/WSS) |
| VPC | Private Subnet + NAT Gateway |
| Database | Security Group (ECSからのみ) |
| Secrets | AWS Secrets Manager |

---

## 6. 監視・運用設計

### 6.1 メトリクス

| メトリクス | 閾値 | アラート |
|-----------|------|---------|
| WebSocket接続数 | 10,000/instance | Warning |
| 同期レイテンシ | P99 > 500ms | Warning |
| エラー率 | > 1% | Critical |
| CPU使用率 | > 80% | Auto Scale |
| メモリ使用率 | > 80% | Auto Scale |
| Redis接続数 | > 80% of max | Warning |
| Aurora接続数 | > 80% of max | Warning |

### 6.2 ログ

```
# 構造化ログフォーマット
{
  "timestamp": "2026-01-31T12:00:00.000Z",
  "level": "info",
  "service": "hocuspocus",
  "traceId": "abc123",
  "userId": "user_xxx",
  "documentId": "doc_yyy",
  "event": "document.sync",
  "duration": 45,
  "metadata": {
    "updateSize": 1024,
    "connectedUsers": 3
  }
}
```

### 6.3 CloudWatch Dashboard

- 同時接続ユーザー数
- アクティブドキュメント数
- 同期操作数/秒
- レイテンシ分布
- エラー率推移

---

## 7. 移行計画

### 7.1 データ移行戦略

```
┌─────────────────────────────────────────────────────────────────────┐
│                     データ移行フロー                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1: 並行運用                                                  │
│  ┌─────────────┐                      ┌─────────────┐              │
│  │   Turso     │ ───── 読み取り ─────► │   Client    │              │
│  │  (既存DB)   │                      │             │              │
│  └─────────────┘                      └─────────────┘              │
│                                                                     │
│  Phase 2: 移行実行                                                  │
│  ┌─────────────┐     バッチ移行      ┌─────────────┐              │
│  │   Turso     │ ─────────────────► │   Aurora    │              │
│  │             │                     │             │              │
│  └─────────────┘                     └─────────────┘              │
│       │                                    │                        │
│       │ Tiptap JSON → Y.Doc変換            │                        │
│       └────────────────────────────────────┘                        │
│                                                                     │
│  Phase 3: 切り替え                                                  │
│  ┌─────────────┐                      ┌─────────────┐              │
│  │   Aurora    │ ◄──── 読み書き ────► │   Client    │              │
│  │  (新DB)     │                      │  (新実装)   │              │
│  └─────────────┘                      └─────────────┘              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Tiptap JSON → Y.Doc 変換

```typescript
import * as Y from 'yjs';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import { schema } from './tiptapSchema';

async function migratePageToYDoc(page: OldPage): Promise<Uint8Array> {
  const ydoc = new Y.Doc();
  
  // Tiptap JSONをパース
  const tiptapContent = JSON.parse(page.content);
  
  // ProseMirror DocumentをY.XmlFragmentに変換
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');
  prosemirrorJSONToYDoc(schema, tiptapContent, yXmlFragment);
  
  // メタデータを設定
  const meta = ydoc.getMap('meta');
  meta.set('title', page.title);
  meta.set('createdAt', page.createdAt);
  meta.set('updatedAt', page.updatedAt);
  
  // バイナリにエンコード
  return Y.encodeStateAsUpdate(ydoc);
}
```

---

## 8. 実装フェーズ

### Phase 1: AWS基盤構築 (2週間)

| タスク | 詳細 | 成果物 |
|--------|------|--------|
| 1.1 | Terraformプロジェクト初期化 | terraform/ 構造 |
| 1.2 | VPC・ネットワーク構築 | VPC, Subnets, NAT |
| 1.3 | Aurora PostgreSQL構築 | DBクラスター, Schema |
| 1.4 | ElastiCache Redis構築 | Redisクラスター |
| 1.5 | ECS Fargate構築 | クラスター, タスク定義 |
| 1.6 | ALB + CloudFront構築 | ロードバランサー, CDN |
| 1.7 | Cognito構築 | ユーザープール |
| 1.8 | 監視・ログ設定 | CloudWatch |

### Phase 2: サーバーサイド実装 (2週間)

| タスク | 詳細 | 成果物 |
|--------|------|--------|
| 2.1 | Hocuspocusサーバー実装 | server/ プロジェクト |
| 2.2 | 認証・認可実装 | JWT検証, アクセス制御 |
| 2.3 | Redis連携実装 | Pub/Sub, プレゼンス |
| 2.4 | Aurora連携実装 | 永続化, 検索 |
| 2.5 | Dockerイメージ作成 | Dockerfile, CI/CD |
| 2.6 | REST API実装 (Lambda) | API Gateway + Lambda |

### Phase 3: クライアントサイド実装 (2週間)

| タスク | 詳細 | 成果物 |
|--------|------|--------|
| 3.1 | Y.js統合 | y-websocket, y-indexeddb |
| 3.2 | Tiptap Collaboration拡張 | エディタ設定更新 |
| 3.3 | ConnectionManager実装 | 接続状態管理 |
| 3.4 | プレゼンスUI実装 | カーソル, ユーザー表示 |
| 3.5 | オフライン対応実装 | IndexedDB, 同期UI |
| 3.6 | Cognito認証統合 | Clerk → Cognito移行 |

### Phase 4: 移行・テスト (1週間)

| タスク | 詳細 | 成果物 |
|--------|------|--------|
| 4.1 | データ移行スクリプト | Turso → Aurora |
| 4.2 | E2Eテスト | Playwright |
| 4.3 | 負荷テスト | k6 / Artillery |
| 4.4 | 段階的ロールアウト | Feature Flag |

### Phase 5: 本番移行 (1週間)

| タスク | 詳細 | 成果物 |
|--------|------|--------|
| 5.1 | 本番データ移行 | Migration実行 |
| 5.2 | DNS切り替え | Route 53 |
| 5.3 | 監視強化 | アラート設定 |
| 5.4 | 旧環境停止 | Turso, Cloudflare Workers |

---

## 9. リスクと対策

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|---------|------|
| WebSocket接続断 | 高 | 中 | 自動再接続 + ローカル保存 |
| Y.Doc肥大化 | 中 | 低 | 定期的なガベージコレクション |
| Redis障害 | 高 | 低 | Multi-AZ + フェイルオーバー |
| Aurora障害 | 高 | 低 | Multi-AZ + 自動フェイルオーバー |
| 同時編集衝突 | 低 | 高 | CRDTにより自動解決 |
| 認証トークン期限切れ | 中 | 中 | 自動リフレッシュ |

---

## 10. 成功指標 (KPI)

| 指標 | 目標値 | 測定方法 |
|------|--------|---------|
| 同期レイテンシ | P99 < 300ms | CloudWatch |
| 同時編集成功率 | > 99.9% | ログ分析 |
| オフライン復帰成功率 | > 99% | クライアントログ |
| 接続エラー率 | < 0.1% | CloudWatch |
| ユーザー満足度 | > 4.5/5 | フィードバック |

---

## 11. コスト見積もり（最適化構成）

### 設計方針

以下のコスト削減策を適用:
- **NAT Gateway → VPC Endpoint**: $32/月 → $14/月 (約55%削減)
- **Fargate → Fargate Spot**: 約70%削減
- **Graviton2インスタンス**: 約20%削減
- **Aurora最小ACU**: アイドル時のコスト最小化

### 小規模運用（数名ユーザー）

| サービス | スペック | 月額コスト | 備考 |
|---------|---------|-----------|------|
| Aurora Serverless v2 | 0.5 ACU (最小) | ~$25 | アイドル時は最小課金 |
| ElastiCache | cache.t4g.micro x 1 | ~$12 | Graviton2 |
| ECS Fargate Spot | 0.25 vCPU, 0.5GB x 1 | ~$3 | Spot割引 |
| VPC Endpoints | Interface x 4 | ~$15 | NAT Gateway代替 |
| ALB | 1台 | ~$16 | |
| CloudFront | 最小 | ~$1 | |
| S3 | ~1GB | ~$0.03 | |
| CloudWatch | 基本 | ~$3 | |
| Route 53 | 1ゾーン | ~$0.50 | |
| Secrets Manager | 2シークレット | ~$0.80 | |
| **合計** | | **~$76/月** | **約11,400円/月** |

### スケールアップ時の参考コスト

| ユーザー規模 | 月額コスト | 主な変更点 |
|-------------|-----------|------------|
| ~5名 | ~$76/月 | 現構成 |
| ~50名 | ~$120/月 | Aurora 2ACU, ECS x2 |
| ~500名 | ~$300/月 | Aurora 4ACU, Redis large, ECS x3 |
| ~1000名以上 | ~$500/月〜 | Multi-AZ, Reserved Capacity検討 |

---

## 付録

### A. 参考資料

- [Y.js Documentation](https://docs.yjs.dev/)
- [Hocuspocus Documentation](https://tiptap.dev/hocuspocus)
- [Tiptap Collaboration](https://tiptap.dev/docs/editor/extensions/functionality/collaboration)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

### B. 用語集

| 用語 | 説明 |
|------|------|
| CRDT | Conflict-free Replicated Data Type - 衝突のない複製データ型 |
| Y.Doc | Y.jsのドキュメントオブジェクト |
| Awareness | Y.jsのプレゼンス情報共有機能 |
| StateVector | Y.jsの状態バージョン管理構造 |
| Hocuspocus | Y.js用のWebSocketサーバー実装 |
