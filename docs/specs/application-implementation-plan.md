# クライアント・サーバー アプリケーション実装計画書

**Document Version:** 1.0  
**Created:** 2026-01-31  
**Status:** Draft  

---

## 1. 概要

本ドキュメントでは、AWSインフラ構築完了後に実施するアプリケーションレベルの実装計画を定義する。

---

## 2. 実装範囲

### 2.1 サーバーサイド（新規）

```
server/
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
│
└── src/
    ├── index.ts                 # エントリーポイント
    ├── config/
    │   ├── index.ts             # 環境変数読み込み
    │   └── database.ts          # DB接続設定
    │
    ├── hocuspocus/
    │   ├── server.ts            # Hocuspocusサーバー設定
    │   ├── extensions/
    │   │   ├── redis.ts         # Redis拡張
    │   │   ├── database.ts      # Aurora永続化拡張
    │   │   └── logger.ts        # ログ拡張
    │   └── hooks/
    │       ├── onAuthenticate.ts
    │       ├── onConnect.ts
    │       ├── onDisconnect.ts
    │       └── onLoadDocument.ts
    │
    ├── services/
    │   ├── auth.ts              # JWT検証
    │   ├── document.ts          # ドキュメント操作
    │   └── user.ts              # ユーザー操作
    │
    ├── db/
    │   ├── client.ts            # PostgreSQL接続
    │   ├── migrations/
    │   │   └── 001_initial.sql
    │   └── queries/
    │       ├── documents.ts
    │       └── users.ts
    │
    └── utils/
        ├── yjs.ts               # Y.jsユーティリティ
        └── metrics.ts           # CloudWatch metrics
```

### 2.2 クライアントサイド（変更）

```
src/
├── lib/
│   ├── collaboration/           # 新規ディレクトリ
│   │   ├── CollaborationManager.ts
│   │   ├── ConnectionManager.ts
│   │   ├── PresenceManager.ts
│   │   ├── OfflineManager.ts
│   │   └── types.ts
│   │
│   ├── auth/                    # 変更: Clerk → Cognito
│   │   ├── cognitoClient.ts
│   │   └── authProvider.tsx
│   │
│   └── turso.ts                 # 削除予定（Aurora移行後）
│
├── hooks/
│   ├── useCollaboration.ts      # 新規
│   ├── usePresence.ts           # 新規
│   ├── useConnectionStatus.ts   # 新規
│   └── useAuth.ts               # 変更: Cognito対応
│
├── components/
│   ├── editor/
│   │   ├── CollaborativeEditor.tsx  # 新規
│   │   ├── PresenceCursors.tsx      # 新規
│   │   └── ConnectionIndicator.tsx   # 新規
│   │
│   └── presence/
│       ├── UserAvatars.tsx          # 新規
│       └── ActiveUsersList.tsx      # 新規
│
└── pages/
    └── PageEditor.tsx           # 変更: Collaboration統合
```

---

## 3. サーバーサイド実装

### 3.1 Hocuspocus サーバー

```typescript
// server/src/hocuspocus/server.ts

import { Hocuspocus } from '@hocuspocus/server';
import { Logger } from '@hocuspocus/extension-logger';
import { Redis } from '@hocuspocus/extension-redis';
import { config } from '../config';
import { databaseExtension } from './extensions/database';
import { onAuthenticate } from './hooks/onAuthenticate';
import { onConnect } from './hooks/onConnect';
import { onDisconnect } from './hooks/onDisconnect';
import { onLoadDocument } from './hooks/onLoadDocument';
import { metricsExtension } from './extensions/metrics';

export function createHocuspocusServer() {
  const server = new Hocuspocus({
    name: config.serverName,
    port: config.port,
    timeout: 30000,
    debounce: 2000,
    maxDebounce: 10000,
    quiet: config.environment === 'production',

    extensions: [
      // ログ
      new Logger({
        log: (message) => {
          console.log(`[Hocuspocus] ${message}`);
        },
        onLoadDocument: true,
        onConnect: true,
        onDisconnect: true,
        onUpgrade: false,
        onRequest: false,
        onChange: false,
        onConfigure: false,
        onListen: true,
        onDestroy: true,
      }),

      // Redis (マルチインスタンス同期)
      new Redis({
        host: config.redis.host,
        port: config.redis.port,
        options: {
          password: config.redis.password,
          tls: config.redis.tls ? {} : undefined,
        },
      }),

      // Database (Aurora永続化)
      databaseExtension,

      // CloudWatch Metrics
      metricsExtension,
    ],

    // フック
    onAuthenticate,
    onConnect,
    onDisconnect,
    onLoadDocument,

    // ドキュメント変更時
    async onChange({ documentName, document }) {
      // 変更はdatabaseExtensionで自動保存
    },

    // エラーハンドリング
    onError({ error, message }) {
      console.error(`[Hocuspocus Error] ${message}:`, error);
    },
  });

  return server;
}
```

### 3.2 認証フック

```typescript
// server/src/hocuspocus/hooks/onAuthenticate.ts

import {
  onAuthenticatePayload,
  Forbidden,
  Unauthorized,
} from '@hocuspocus/server';
import { verifyJWT, JWTPayload } from '../../services/auth';
import { checkDocumentAccess } from '../../services/document';

export async function onAuthenticate({
  documentName,
  token,
}: onAuthenticatePayload): Promise<{ user: JWTPayload }> {
  // トークン検証
  if (!token) {
    throw new Unauthorized('Token required');
  }

  let user: JWTPayload;
  try {
    user = await verifyJWT(token);
  } catch (error) {
    console.error('[Auth] JWT verification failed:', error);
    throw new Unauthorized('Invalid token');
  }

  // ドキュメントアクセス権確認
  const [, pageId] = documentName.split('-');
  if (!pageId) {
    throw new Forbidden('Invalid document name');
  }

  const hasAccess = await checkDocumentAccess(user.sub, pageId, 'edit');
  if (!hasAccess) {
    throw new Forbidden('Access denied');
  }

  return { user };
}
```

### 3.3 Database拡張

```typescript
// server/src/hocuspocus/extensions/database.ts

import { Extension, onLoadDocumentPayload, onStoreDocumentPayload } from '@hocuspocus/server';
import * as Y from 'yjs';
import { db } from '../../db/client';
import { extractTextFromYDoc, extractTitleFromYDoc } from '../../utils/yjs';

class DatabaseExtension implements Extension {
  /**
   * ドキュメント読み込み時
   */
  async onLoadDocument({ documentName, document }: onLoadDocumentPayload): Promise<void> {
    const [, pageId] = documentName.split('-');
    if (!pageId) return;

    console.log(`[DB] Loading document: ${pageId}`);

    const result = await db.query(
      'SELECT ydoc_state FROM documents WHERE id = $1 AND is_deleted = FALSE',
      [pageId]
    );

    if (result.rows.length > 0 && result.rows[0].ydoc_state) {
      const state = result.rows[0].ydoc_state as Buffer;
      Y.applyUpdate(document, new Uint8Array(state));
      console.log(`[DB] Loaded document: ${pageId} (${state.length} bytes)`);
    } else {
      console.log(`[DB] No existing document found: ${pageId}`);
    }
  }

  /**
   * ドキュメント保存時（デバウンス後）
   */
  async onStoreDocument({ documentName, document, state }: onStoreDocumentPayload): Promise<void> {
    const [, pageId] = documentName.split('-');
    if (!pageId) return;

    // Y.Docからテキスト抽出（検索用）
    const title = extractTitleFromYDoc(document);
    const contentText = extractTextFromYDoc(document);
    const contentPreview = contentText.substring(0, 200);

    console.log(`[DB] Storing document: ${pageId} (${state.length} bytes)`);

    await db.query(
      `
      INSERT INTO documents (id, ydoc_state, title, content_text, content_preview, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (id) DO UPDATE SET
        ydoc_state = $2,
        title = $3,
        content_text = $4,
        content_preview = $5,
        ydoc_version = documents.ydoc_version + 1,
        updated_at = NOW()
      `,
      [pageId, Buffer.from(state), title, contentText, contentPreview]
    );

    console.log(`[DB] Stored document: ${pageId}`);
  }

  async onConfigure() {}
  async onListen() {}
  async onDestroy() {}
  async onConnect() {}
  async onDisconnect() {}
  async onRequest() {}
  async onUpgrade() {}
  async onChange() {}
  async onStateless() {}
  async afterLoadDocument() {}
  async afterStoreDocument() {}
}

export const databaseExtension = new DatabaseExtension();
```

### 3.4 Dockerfile

```dockerfile
# server/Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# 依存関係インストール
COPY package*.json ./
RUN npm ci

# ソースコピー & ビルド
COPY . .
RUN npm run build

# 本番イメージ
FROM node:20-alpine

WORKDIR /app

# 本番依存関係のみ
COPY package*.json ./
RUN npm ci --only=production

# ビルド成果物
COPY --from=builder /app/dist ./dist

# ヘルスチェック用
RUN apk add --no-cache curl

# 非rootユーザー
RUN addgroup -g 1001 -S nodejs && \
    adduser -S hocuspocus -u 1001
USER hocuspocus

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

---

## 4. クライアントサイド実装

### 4.1 CollaborationManager

```typescript
// src/lib/collaboration/CollaborationManager.ts

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import type { UserPresence, ConnectionStatus, CollaborationState } from './types';

export class CollaborationManager {
  private ydoc: Y.Doc;
  private wsProvider: WebsocketProvider | null = null;
  private idbProvider: IndexeddbPersistence;
  private awareness: Awareness | null = null;
  private pageId: string;
  private userId: string;
  private listeners: Set<(state: CollaborationState) => void> = new Set();
  private state: CollaborationState;

  constructor(
    pageId: string,
    userId: string,
    private getAuthToken: () => Promise<string | null>
  ) {
    this.pageId = pageId;
    this.userId = userId;
    this.ydoc = new Y.Doc();

    this.state = {
      status: 'connecting',
      isSynced: false,
      onlineUsers: [],
      pendingChanges: 0,
    };

    // Layer 2: IndexedDB永続化（常時有効）
    this.idbProvider = new IndexeddbPersistence(
      `zedi-doc-${pageId}`,
      this.ydoc
    );

    this.idbProvider.on('synced', () => {
      console.log('[Collab] IndexedDB synced');
      // ローカル同期完了後にWebSocket接続
      this.connectWebSocket();
    });
  }

  private async connectWebSocket() {
    const token = await this.getAuthToken();
    if (!token) {
      console.warn('[Collab] No auth token, staying offline');
      this.updateState({ status: 'disconnected' });
      return;
    }

    const wsUrl = import.meta.env.VITE_REALTIME_URL || 'wss://realtime.zedi-note.app';
    
    this.wsProvider = new WebsocketProvider(
      wsUrl,
      `page-${this.pageId}`,
      this.ydoc,
      {
        params: { token },
        connect: true,
        awareness: new Awareness(this.ydoc),
        resyncInterval: 10000,
        maxBackoffTime: 30000,
      }
    );

    this.awareness = this.wsProvider.awareness;

    // 接続状態監視
    this.wsProvider.on('status', ({ status }: { status: string }) => {
      console.log(`[Collab] WebSocket status: ${status}`);
      this.updateState({
        status: status as ConnectionStatus,
      });
    });

    // 同期完了
    this.wsProvider.on('sync', (isSynced: boolean) => {
      console.log(`[Collab] Sync status: ${isSynced}`);
      this.updateState({ isSynced });
    });

    // プレゼンス変更
    this.awareness.on('change', () => {
      this.updatePresence();
    });

    // ローカルプレゼンス設定
    this.setLocalPresence({
      status: 'active',
      cursor: null,
      selection: null,
    });
  }

  /**
   * ローカルプレゼンス情報を設定
   */
  setLocalPresence(presence: Partial<UserPresence>) {
    if (!this.awareness) return;

    const current = this.awareness.getLocalState() || {};
    this.awareness.setLocalState({
      ...current,
      ...presence,
      userId: this.userId,
      lastActivity: Date.now(),
    });
  }

  /**
   * カーソル位置を更新
   */
  updateCursor(anchor: number, head: number) {
    this.setLocalPresence({
      cursor: { anchor, head },
    });
  }

  /**
   * 選択範囲を更新
   */
  updateSelection(from: number, to: number) {
    this.setLocalPresence({
      selection: from === to ? null : { from, to },
    });
  }

  private updatePresence() {
    if (!this.awareness) return;

    const states = this.awareness.getStates();
    const onlineUsers: UserPresence[] = [];

    states.forEach((state, clientId) => {
      if (clientId !== this.awareness!.clientID && state.userId) {
        onlineUsers.push(state as UserPresence);
      }
    });

    this.updateState({ onlineUsers });
  }

  private updateState(partial: Partial<CollaborationState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }

  /**
   * 状態変更を購読
   */
  subscribe(listener: (state: CollaborationState) => void): () => void {
    this.listeners.add(listener);
    // 現在の状態を即座に通知
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Y.Docを取得
   */
  get document(): Y.Doc {
    return this.ydoc;
  }

  /**
   * XmlFragmentを取得（Tiptap用）
   */
  get xmlFragment(): Y.XmlFragment {
    return this.ydoc.getXmlFragment('prosemirror');
  }

  /**
   * Awarenessを取得
   */
  getAwareness(): Awareness | null {
    return this.awareness;
  }

  /**
   * 接続状態を取得
   */
  get isConnected(): boolean {
    return this.wsProvider?.wsconnected ?? false;
  }

  /**
   * 手動再接続
   */
  reconnect() {
    if (this.wsProvider && !this.wsProvider.wsconnected) {
      this.wsProvider.connect();
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    // プレゼンスをクリア
    if (this.awareness) {
      this.awareness.setLocalState(null);
    }

    // 接続を閉じる
    this.wsProvider?.destroy();
    this.idbProvider.destroy();
    this.ydoc.destroy();

    this.listeners.clear();
  }
}
```

### 4.2 useCollaboration フック

```typescript
// src/hooks/useCollaboration.ts

import { useEffect, useState, useCallback, useRef } from 'react';
import { CollaborationManager } from '@/lib/collaboration/CollaborationManager';
import type { CollaborationState } from '@/lib/collaboration/types';
import { useAuth } from '@/hooks/useAuth';

interface UseCollaborationOptions {
  pageId: string;
  enabled?: boolean;
}

export function useCollaboration({ pageId, enabled = true }: UseCollaborationOptions) {
  const { userId, getToken } = useAuth();
  const [state, setState] = useState<CollaborationState>({
    status: 'connecting',
    isSynced: false,
    onlineUsers: [],
    pendingChanges: 0,
  });
  const managerRef = useRef<CollaborationManager | null>(null);

  // Manager初期化
  useEffect(() => {
    if (!enabled || !pageId || !userId) return;

    const manager = new CollaborationManager(
      pageId,
      userId,
      async () => {
        const token = await getToken();
        return token;
      }
    );

    managerRef.current = manager;

    const unsubscribe = manager.subscribe(setState);

    return () => {
      unsubscribe();
      manager.destroy();
      managerRef.current = null;
    };
  }, [pageId, userId, enabled, getToken]);

  // カーソル位置更新
  const updateCursor = useCallback((anchor: number, head: number) => {
    managerRef.current?.updateCursor(anchor, head);
  }, []);

  // 選択範囲更新
  const updateSelection = useCallback((from: number, to: number) => {
    managerRef.current?.updateSelection(from, to);
  }, []);

  // 手動再接続
  const reconnect = useCallback(() => {
    managerRef.current?.reconnect();
  }, []);

  return {
    ...state,
    manager: managerRef.current,
    ydoc: managerRef.current?.document,
    xmlFragment: managerRef.current?.xmlFragment,
    awareness: managerRef.current?.getAwareness(),
    updateCursor,
    updateSelection,
    reconnect,
  };
}
```

### 4.3 CollaborativeEditor コンポーネント

```typescript
// src/components/editor/CollaborativeEditor.tsx

import { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { useCollaboration } from '@/hooks/useCollaboration';
import { PresenceCursors } from './PresenceCursors';
import { ConnectionIndicator } from './ConnectionIndicator';
import { UserAvatars } from '@/components/presence/UserAvatars';
import { getUserColor } from '@/lib/collaboration/colors';

interface CollaborativeEditorProps {
  pageId: string;
  placeholder?: string;
  onTitleChange?: (title: string) => void;
}

export function CollaborativeEditor({
  pageId,
  placeholder = 'Start writing...',
  onTitleChange,
}: CollaborativeEditorProps) {
  const {
    status,
    isSynced,
    onlineUsers,
    ydoc,
    xmlFragment,
    awareness,
    updateCursor,
    updateSelection,
    reconnect,
  } = useCollaboration({ pageId });

  // ユーザーカラー
  const userColor = useMemo(() => getUserColor(), []);

  // Tiptapエディタ
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          history: false, // Y.jsが履歴を管理
        }),
        Placeholder.configure({
          placeholder,
        }),
        Link.configure({
          openOnClick: false,
        }),
        Image,
        // Y.js Collaboration
        ...(xmlFragment && awareness
          ? [
              Collaboration.configure({
                document: ydoc,
                field: 'prosemirror',
              }),
              CollaborationCursor.configure({
                provider: { awareness },
                user: {
                  name: 'You', // TODO: ユーザー名を取得
                  color: userColor,
                },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class:
            'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none',
        },
      },
      onSelectionUpdate: ({ editor }) => {
        const { from, to } = editor.state.selection;
        updateSelection(from, to);
      },
      onUpdate: ({ editor }) => {
        // タイトル抽出（最初のheading）
        const firstNode = editor.state.doc.firstChild;
        if (firstNode?.type.name === 'heading') {
          const title = firstNode.textContent;
          onTitleChange?.(title);
        }
      },
    },
    [xmlFragment, awareness]
  );

  // エディタがマウントされたらカーソル位置を同期
  useEffect(() => {
    if (!editor || !awareness) return;

    const updateHandler = () => {
      const { anchor, head } = editor.state.selection;
      updateCursor(anchor, head);
    };

    editor.on('selectionUpdate', updateHandler);
    return () => {
      editor.off('selectionUpdate', updateHandler);
    };
  }, [editor, awareness, updateCursor]);

  return (
    <div className="relative min-h-[500px]">
      {/* 接続状態インジケーター */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <UserAvatars users={onlineUsers} />
        <ConnectionIndicator
          status={status}
          isSynced={isSynced}
          onReconnect={reconnect}
        />
      </div>

      {/* エディタ */}
      <div className="pt-12">
        {!xmlFragment ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      {/* 他ユーザーのカーソル表示（CollaborationCursorが処理） */}
    </div>
  );
}
```

### 4.4 ConnectionIndicator コンポーネント

```typescript
// src/components/editor/ConnectionIndicator.tsx

import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ConnectionStatus } from '@/lib/collaboration/types';
import { cn } from '@/lib/utils';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  isSynced: boolean;
  onReconnect: () => void;
}

export function ConnectionIndicator({
  status,
  isSynced,
  onReconnect,
}: ConnectionIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: isSynced ? Cloud : RefreshCw,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          label: isSynced ? 'Synced' : 'Syncing...',
          animate: !isSynced,
        };
      case 'connecting':
        return {
          icon: RefreshCw,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          label: 'Connecting...',
          animate: true,
        };
      case 'disconnected':
        return {
          icon: CloudOff,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          label: 'Offline',
          animate: false,
        };
      default:
        return {
          icon: WifiOff,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          label: 'Unknown',
          animate: false,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-2 gap-1.5',
            config.bgColor,
            status === 'disconnected' && 'cursor-pointer'
          )}
          onClick={status === 'disconnected' ? onReconnect : undefined}
        >
          <Icon
            className={cn(
              'h-4 w-4',
              config.color,
              config.animate && 'animate-spin'
            )}
          />
          <span className={cn('text-xs', config.color)}>{config.label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {status === 'disconnected' ? (
          <p>Click to reconnect</p>
        ) : status === 'connected' && isSynced ? (
          <p>All changes saved</p>
        ) : (
          <p>Syncing changes...</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
```

### 4.5 Cognito認証への移行

```typescript
// src/lib/auth/cognitoClient.ts

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';

const config = {
  region: import.meta.env.VITE_AWS_REGION || 'ap-northeast-1',
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
};

const cognitoClient = new CognitoIdentityProviderClient({
  region: config.region,
});

const identityClient = new CognitoIdentityClient({
  region: config.region,
});

interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthState {
  tokens: AuthTokens | null;
  user: CognitoUser | null;
}

interface CognitoUser {
  sub: string;
  email: string;
  displayName?: string;
}

class CognitoAuthClient {
  private state: AuthState = {
    tokens: null,
    user: null,
  };
  private listeners: Set<(state: AuthState) => void> = new Set();

  constructor() {
    // ローカルストレージからトークン復元
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const stored = localStorage.getItem('zedi_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.tokens && parsed.tokens.expiresAt > Date.now()) {
          this.state = parsed;
        }
      } catch {
        localStorage.removeItem('zedi_auth');
      }
    }
  }

  private saveToStorage() {
    if (this.state.tokens) {
      localStorage.setItem('zedi_auth', JSON.stringify(this.state));
    } else {
      localStorage.removeItem('zedi_auth');
    }
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  /**
   * メール/パスワードでサインイン
   */
  async signIn(email: string, password: string): Promise<void> {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const response = await cognitoClient.send(command);

    if (!response.AuthenticationResult) {
      throw new Error('Authentication failed');
    }

    const { AccessToken, IdToken, RefreshToken, ExpiresIn } =
      response.AuthenticationResult;

    this.state.tokens = {
      accessToken: AccessToken!,
      idToken: IdToken!,
      refreshToken: RefreshToken!,
      expiresAt: Date.now() + (ExpiresIn || 3600) * 1000,
    };

    // ユーザー情報取得
    await this.fetchUser();

    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * サインアウト
   */
  async signOut(): Promise<void> {
    if (this.state.tokens) {
      try {
        await cognitoClient.send(
          new GlobalSignOutCommand({
            AccessToken: this.state.tokens.accessToken,
          })
        );
      } catch (error) {
        console.error('Sign out error:', error);
      }
    }

    this.state = { tokens: null, user: null };
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * ユーザー情報取得
   */
  private async fetchUser(): Promise<void> {
    if (!this.state.tokens) return;

    const command = new GetUserCommand({
      AccessToken: this.state.tokens.accessToken,
    });

    const response = await cognitoClient.send(command);

    const getAttribute = (name: string) =>
      response.UserAttributes?.find((attr) => attr.Name === name)?.Value;

    this.state.user = {
      sub: getAttribute('sub')!,
      email: getAttribute('email')!,
      displayName: getAttribute('custom:display_name'),
    };
  }

  /**
   * トークンをリフレッシュ
   */
  async refreshTokens(): Promise<void> {
    if (!this.state.tokens?.refreshToken) {
      throw new Error('No refresh token');
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        REFRESH_TOKEN: this.state.tokens.refreshToken,
      },
    });

    const response = await cognitoClient.send(command);

    if (!response.AuthenticationResult) {
      throw new Error('Token refresh failed');
    }

    const { AccessToken, IdToken, ExpiresIn } = response.AuthenticationResult;

    this.state.tokens = {
      ...this.state.tokens,
      accessToken: AccessToken!,
      idToken: IdToken!,
      expiresAt: Date.now() + (ExpiresIn || 3600) * 1000,
    };

    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * 有効なIDトークンを取得（必要に応じてリフレッシュ）
   */
  async getIdToken(): Promise<string | null> {
    if (!this.state.tokens) return null;

    // 有効期限5分前にリフレッシュ
    if (this.state.tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
      try {
        await this.refreshTokens();
      } catch (error) {
        console.error('Token refresh failed:', error);
        await this.signOut();
        return null;
      }
    }

    return this.state.tokens.idToken;
  }

  /**
   * 現在のユーザーを取得
   */
  getUser(): CognitoUser | null {
    return this.state.user;
  }

  /**
   * サインイン状態かどうか
   */
  isSignedIn(): boolean {
    return !!this.state.tokens && this.state.tokens.expiresAt > Date.now();
  }

  /**
   * 状態変更を購読
   */
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const cognitoClient = new CognitoAuthClient();
```

---

## 5. データ移行スクリプト

```typescript
// scripts/migration/turso-to-aurora.ts

import { createClient } from '@libsql/client';
import { Pool } from 'pg';
import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
import { schema } from '../../server/src/utils/tiptapSchema';

const tursoClient = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const auroraPool = new Pool({
  connectionString: process.env.AURORA_DATABASE_URL!,
});

async function migrateUsers() {
  console.log('Migrating users...');

  // Tursoからユーザー取得（Clerkのuser_id）
  const result = await tursoClient.execute(
    'SELECT DISTINCT user_id FROM pages'
  );

  for (const row of result.rows) {
    const userId = row.user_id as string;

    // Auroraにユーザー作成（Cognito移行後に更新）
    await auroraPool.query(
      `
      INSERT INTO users (id, cognito_sub, email, created_at)
      VALUES ($1, $1, $1 || '@migrated.local', NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [userId]
    );
  }

  console.log(`Migrated ${result.rows.length} users`);
}

async function migratePages() {
  console.log('Migrating pages...');

  const result = await tursoClient.execute(`
    SELECT id, user_id, title, content, content_preview, thumbnail_url, 
           source_url, created_at, updated_at, is_deleted
    FROM pages
  `);

  let migrated = 0;
  let failed = 0;

  for (const row of result.rows) {
    try {
      // Tiptap JSON → Y.Doc変換
      const ydoc = new Y.Doc();
      
      if (row.content) {
        try {
          const tiptapContent = JSON.parse(row.content as string);
          const yXmlFragment = ydoc.getXmlFragment('prosemirror');
          prosemirrorJSONToYXmlFragment(schema, tiptapContent, yXmlFragment);
        } catch (parseError) {
          console.warn(`Failed to parse content for page ${row.id}:`, parseError);
          // 空のドキュメントとして保存
        }
      }

      // メタデータ設定
      const meta = ydoc.getMap('meta');
      meta.set('title', row.title || '');
      meta.set('createdAt', row.created_at);
      meta.set('updatedAt', row.updated_at);

      // Y.Docをバイナリにエンコード
      const ydocState = Y.encodeStateAsUpdate(ydoc);

      // Auroraに保存
      await auroraPool.query(
        `
        INSERT INTO documents (
          id, owner_id, ydoc_state, title, content_preview, 
          thumbnail_url, source_url, is_deleted, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          ydoc_state = $3,
          title = $4,
          updated_at = $10
        `,
        [
          row.id,
          row.user_id,
          Buffer.from(ydocState),
          row.title,
          row.content_preview,
          row.thumbnail_url,
          row.source_url,
          row.is_deleted === 1,
          new Date(row.created_at as number),
          new Date(row.updated_at as number),
        ]
      );

      migrated++;
      if (migrated % 100 === 0) {
        console.log(`Migrated ${migrated} pages...`);
      }
    } catch (error) {
      console.error(`Failed to migrate page ${row.id}:`, error);
      failed++;
    }
  }

  console.log(`Migration complete: ${migrated} migrated, ${failed} failed`);
}

async function migrateLinks() {
  console.log('Migrating links...');

  const result = await tursoClient.execute('SELECT * FROM links');

  for (const row of result.rows) {
    await auroraPool.query(
      `
      INSERT INTO links (source_id, target_id, created_at)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
      `,
      [row.source_id, row.target_id, new Date(row.created_at as number)]
    );
  }

  console.log(`Migrated ${result.rows.length} links`);
}

async function migrateGhostLinks() {
  console.log('Migrating ghost links...');

  const result = await tursoClient.execute('SELECT * FROM ghost_links');

  for (const row of result.rows) {
    await auroraPool.query(
      `
      INSERT INTO ghost_links (link_text, source_document_id, created_at)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
      `,
      [row.link_text, row.source_page_id, new Date(row.created_at as number)]
    );
  }

  console.log(`Migrated ${result.rows.length} ghost links`);
}

async function main() {
  console.log('Starting migration from Turso to Aurora...\n');

  try {
    await migrateUsers();
    await migratePages();
    await migrateLinks();
    await migrateGhostLinks();

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await auroraPool.end();
  }
}

main();
```

---

## 6. 実装タスク一覧

### Phase 2: サーバーサイド実装 (Week 3-4)

| # | タスク | 優先度 | 見積時間 |
|---|--------|--------|----------|
| 2.1 | server/ プロジェクト初期化 | 高 | 2h |
| 2.2 | Hocuspocusサーバー基本実装 | 高 | 4h |
| 2.3 | 認証フック (onAuthenticate) | 高 | 4h |
| 2.4 | Redis拡張実装 | 高 | 4h |
| 2.5 | Database拡張実装 | 高 | 6h |
| 2.6 | CloudWatch Metrics実装 | 中 | 3h |
| 2.7 | Dockerfile作成 | 高 | 2h |
| 2.8 | ECRプッシュ・ECSデプロイ | 高 | 4h |
| 2.9 | 動作確認・デバッグ | 高 | 8h |

### Phase 3: クライアントサイド実装 (Week 5-6)

| # | タスク | 優先度 | 見積時間 |
|---|--------|--------|----------|
| 3.1 | CollaborationManager実装 | 高 | 8h |
| 3.2 | useCollaborationフック | 高 | 4h |
| 3.3 | CollaborativeEditor実装 | 高 | 8h |
| 3.4 | PresenceCursors実装 | 中 | 4h |
| 3.5 | ConnectionIndicator実装 | 中 | 2h |
| 3.6 | UserAvatars実装 | 中 | 2h |
| 3.7 | Cognito認証クライアント | 高 | 6h |
| 3.8 | useAuthフック移行 | 高 | 4h |
| 3.9 | PageEditor統合 | 高 | 6h |
| 3.10 | オフライン対応テスト | 高 | 4h |

### Phase 4: 移行・テスト (Week 7)

| # | タスク | 優先度 | 見積時間 |
|---|--------|--------|----------|
| 4.1 | データ移行スクリプト作成 | 高 | 6h |
| 4.2 | 開発環境でのテスト移行 | 高 | 4h |
| 4.3 | E2Eテスト更新 | 中 | 8h |
| 4.4 | 負荷テスト実施 | 中 | 4h |
| 4.5 | バグ修正・最適化 | 高 | 8h |

### Phase 5: 本番移行 (Week 8)

| # | タスク | 優先度 | 見積時間 |
|---|--------|--------|----------|
| 5.1 | 本番データ移行 | 高 | 4h |
| 5.2 | DNS切り替え | 高 | 2h |
| 5.3 | 監視・アラート確認 | 高 | 4h |
| 5.4 | ロールバック計画確認 | 高 | 2h |
| 5.5 | 旧環境停止 | 低 | 2h |

---

## 7. テスト計画

### 7.1 ユニットテスト

```typescript
// CollaborationManager.test.ts

describe('CollaborationManager', () => {
  it('should initialize with IndexedDB persistence', async () => {
    const manager = new CollaborationManager('test-page', 'user-1', async () => null);
    expect(manager.document).toBeDefined();
    manager.destroy();
  });

  it('should handle offline mode when no token', async () => {
    const manager = new CollaborationManager('test-page', 'user-1', async () => null);
    // 状態がdisconnectedになることを確認
    manager.destroy();
  });

  it('should sync changes when reconnected', async () => {
    // オフライン→オンライン遷移のテスト
  });
});
```

### 7.2 E2Eテスト

```typescript
// e2e/collaboration.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Realtime Collaboration', () => {
  test('two users can edit simultaneously', async ({ browser }) => {
    // 2つのブラウザコンテキストを作成
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // 同じページを開く
    await page1.goto('/page/test-page');
    await page2.goto('/page/test-page');

    // User1が入力
    await page1.locator('.ProseMirror').type('Hello from User 1');

    // User2に反映されることを確認
    await expect(page2.locator('.ProseMirror')).toContainText('Hello from User 1');

    // User2が入力
    await page2.locator('.ProseMirror').type(' and User 2');

    // User1に反映されることを確認
    await expect(page1.locator('.ProseMirror')).toContainText('Hello from User 1 and User 2');
  });

  test('changes persist after offline period', async ({ page }) => {
    await page.goto('/page/test-page');

    // ネットワークをオフラインに
    await page.context().setOffline(true);

    // オフライン中に編集
    await page.locator('.ProseMirror').type('Offline edit');

    // オンラインに復帰
    await page.context().setOffline(false);

    // 同期を待機
    await expect(page.locator('[data-status="synced"]')).toBeVisible();

    // ページをリロードしても内容が保持されていることを確認
    await page.reload();
    await expect(page.locator('.ProseMirror')).toContainText('Offline edit');
  });
});
```

---

## 8. ロールバック計画

移行に問題が発生した場合のロールバック手順：

1. **DNS切り戻し**: Route 53でCloudflare Pagesに戻す
2. **旧Turso DBの有効化**: 移行完了まで旧DBは読み取り専用で維持
3. **Clerkの再有効化**: Cognito → Clerk切り替え
4. **クライアントロールバック**: 旧バージョンをデプロイ

```bash
# ロールバックスクリプト例
#!/bin/bash
set -e

echo "Rolling back to previous version..."

# 1. CDNを旧バージョンに切り替え
aws cloudfront create-invalidation --distribution-id $CF_DIST_ID --paths "/*"

# 2. ECSを旧タスク定義に戻す
aws ecs update-service \
  --cluster zedi-prod-realtime \
  --service hocuspocus \
  --task-definition zedi-prod-hocuspocus:PREVIOUS_VERSION

# 3. DNS切り戻し（手動確認後）
echo "Manually update Route 53 to point to Cloudflare Pages"

echo "Rollback initiated. Monitor for issues."
```
