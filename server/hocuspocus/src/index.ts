/**
 * Zedi Hocuspocus Server - Minimal Implementation
 * 
 * 最小限のリアルタイム同期サーバー
 * - 認証: スキップ（開発用）
 * - 永続化: メモリのみ（開発用）
 * - Redis: オプション（環境変数で有効化）
 */

import { Hocuspocus } from '@hocuspocus/server';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.PORT || '1234', 10);
const REDIS_URL = process.env.REDIS_URL;

// Hocuspocusサーバー設定
const hocuspocus = new Hocuspocus({
  name: 'zedi-hocuspocus',
  
  // デバウンス設定（ドキュメント保存の頻度制御）
  debounce: 2000,
  maxDebounce: 10000,
  
  // タイムアウト設定
  timeout: 30000,
  
  // 開発用: 認証をスキップ
  async onAuthenticate({ token, documentName }) {
    console.log(`[Auth] Document: ${documentName}, Token: ${token ? 'provided' : 'none'}`);
    
    // 開発環境では全てのリクエストを許可
    // TODO: Cognito JWT検証を実装
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
