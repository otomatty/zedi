/**
 * Zedi Hocuspocus Server - Minimal Implementation
 *
 * 最小限のリアルタイム同期サーバー
 * - 認証: COGNITO_USER_POOL_ID が設定されていれば Cognito JWT 検証、未設定なら開発用に全許可
 * - 永続化: メモリのみ（開発用）
 * - Redis: オプション（環境変数で有効化）
 */

import { Hocuspocus } from '@hocuspocus/server';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer } from 'ws';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const PORT = parseInt(process.env.PORT || '1234', 10);
const REDIS_URL = process.env.REDIS_URL;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || 'ap-northeast-1';

const cognitoVerifier =
  COGNITO_USER_POOL_ID
    ? CognitoJwtVerifier.create({
        userPoolId: COGNITO_USER_POOL_ID,
        tokenUse: 'id',
        clientId: null, // 署名・有効期限のみ検証（clientId は未チェック）
      })
    : null;

// Hocuspocusサーバー設定
const hocuspocus = new Hocuspocus({
  name: 'zedi-hocuspocus',

  // デバウンス設定（ドキュメント保存の頻度制御）
  debounce: 2000,
  maxDebounce: 10000,

  // タイムアウト設定
  timeout: 30000,

  async onAuthenticate({ token, documentName }) {
    console.log(`[Auth] Document: ${documentName}, Token: ${token ? 'provided' : 'none'}`);

    if (cognitoVerifier) {
      if (!token) {
        throw new Error('Authentication required');
      }
      try {
        const payload = await cognitoVerifier.verify(token);
        const sub = payload.sub as string;
        const name = (payload.name as string) || (payload['cognito:username'] as string) || sub;
        return {
          user: {
            id: sub,
            name,
          },
        };
      } catch (err) {
        console.warn('[Auth] Cognito JWT verification failed:', err);
        throw new Error('Invalid token');
      }
    }

    // 開発用: Cognito 未設定時は全許可
    return {
      user: {
        id: 'dev-user',
        name: 'Developer',
      },
    };
  },

  async onConnect({ documentName }) {
    console.log(`[Connect] Client connected to: ${documentName}`);
  },

  async onDisconnect({ documentName }) {
    console.log(`[Disconnect] Client disconnected from: ${documentName}`);
  },

  async onLoadDocument({ documentName }) {
    console.log(`[Load] Loading document: ${documentName}`);
    // 開発環境ではメモリのみ（永続化なし）
    // TODO: Aurora PostgreSQL永続化を実装
  },

  async onStoreDocument({ documentName }) {
    console.log(`[Store] Storing document: ${documentName}`);
    // 開発環境ではメモリのみ（永続化なし）
    // TODO: Aurora PostgreSQL永続化を実装
  },

  async onChange({ documentName }) {
    // ドキュメント変更時（デバウンス前）
  },
});

// カスタムHTTPサーバー（ヘルスチェック用）
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // ヘルスチェックエンドポイント
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'zedi-hocuspocus',
      timestamp: new Date().toISOString(),
      connections: hocuspocus.getConnectionsCount(),
      documents: hocuspocus.getDocumentsCount(),
    }));
    return;
  }

  // その他のリクエストは404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// WebSocketサーバーをHTTPサーバーにアタッチ
const wss = new WebSocketServer({ server: httpServer });

// WebSocket接続をHocuspocusに渡す
wss.on('connection', (socket, request) => {
  hocuspocus.handleConnection(socket, request);
});

// サーバー起動
httpServer.listen(PORT, () => {
  console.log('========================================');
  console.log('  Zedi Hocuspocus Server Started');
  console.log('========================================');
  console.log(`  Port:         ${PORT}`);
  console.log(`  Health:       http://localhost:${PORT}/health`);
  console.log(`  WebSocket:    ws://localhost:${PORT}`);
  console.log(`  Redis:        ${REDIS_URL ? 'Enabled' : 'Disabled'}`);
  console.log(`  Environment:  ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Shutdown] SIGTERM received, closing server...');
  await hocuspocus.destroy();
  httpServer.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Shutdown] SIGINT received, closing server...');
  await hocuspocus.destroy();
  httpServer.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});
