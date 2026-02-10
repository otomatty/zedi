import { Hocuspocus } from '@hocuspocus/server';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer } from 'ws';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Redis } from '@hocuspocus/extension-redis';
import { Pool, PoolClient } from 'pg';
import * as Y from 'yjs';

const PORT = parseInt(process.env.PORT || '1234', 10);
const REDIS_URL = process.env.REDIS_URL;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || 'ap-northeast-1';
const DATABASE_URL = process.env.DATABASE_URL;
const DB_CREDENTIALS_JSON = process.env.DB_CREDENTIALS_JSON;

type AuthenticatedUser = {
  id: string;
  name: string;
  email?: string;
  cognitoSub?: string;
};

type DbUser = {
  id: string;
  email: string;
};

type DbCredentialPayload = {
  username?: string;
  password?: string;
  host?: string;
  port?: number | string;
  dbname?: string;
};

const cognitoVerifier =
  COGNITO_USER_POOL_ID
    ? CognitoJwtVerifier.create({
        userPoolId: COGNITO_USER_POOL_ID,
        tokenUse: 'id',
        clientId: null, // 署名・有効期限のみ検証（clientId は未チェック）
      })
    : null;

let pgPool: Pool | null = null;
const documentConnectionCounts = new Map<string, number>();

function parsePageId(documentName: string): string | null {
  if (!documentName.startsWith('page-')) return null;
  const pageId = documentName.slice('page-'.length).trim();
  return pageId.length > 0 ? pageId : null;
}

function parseDbCredentialsFromSecret(): string | null {
  if (!DB_CREDENTIALS_JSON) return null;
  try {
    const payload = JSON.parse(DB_CREDENTIALS_JSON) as DbCredentialPayload;
    if (!payload.host || !payload.username || !payload.password || !payload.dbname) {
      return null;
    }
    const port = Number(payload.port || 5432);
    const user = encodeURIComponent(payload.username);
    const pass = encodeURIComponent(payload.password);
    const db = encodeURIComponent(payload.dbname);
    return `postgresql://${user}:${pass}@${payload.host}:${port}/${db}`;
  } catch (error) {
    console.error('[DB] Failed to parse DB_CREDENTIALS_JSON:', error);
    return null;
  }
}

function resolveDatabaseUrl(): string | null {
  if (DATABASE_URL && DATABASE_URL.includes('://')) {
    return DATABASE_URL;
  }
  return parseDbCredentialsFromSecret();
}

function getPool(): Pool {
  if (pgPool) return pgPool;
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      'Database connection is not configured. Set DATABASE_URL (postgres URL) or DB_CREDENTIALS_JSON (Secrets Manager JSON).'
    );
  }
  pgPool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  return pgPool;
}

async function getCurrentUserBySub(client: PoolClient, cognitoSub: string): Promise<DbUser | null> {
  const result = await client.query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE cognito_sub = $1 LIMIT 1',
    [cognitoSub]
  );
  const row = result.rows[0];
  if (!row?.id || !row?.email) return null;
  return { id: row.id, email: String(row.email).trim().toLowerCase() };
}

async function canEditNotePage(client: PoolClient, pageId: string, user: DbUser): Promise<boolean> {
  const result = await client.query(
    `
      SELECT 1
      FROM note_pages np
      JOIN notes n
        ON n.id = np.note_id
       AND n.is_deleted = FALSE
      LEFT JOIN note_members nm
        ON nm.note_id = np.note_id
       AND nm.member_email = $3
       AND nm.is_deleted = FALSE
      WHERE np.page_id = $1
        AND np.is_deleted = FALSE
        AND (n.owner_id = $2 OR nm.role = 'editor')
      LIMIT 1
    `,
    [pageId, user.id, user.email]
  );
  return result.rows.length > 0;
}

async function pageBelongsToAnyNote(client: PoolClient, pageId: string): Promise<boolean> {
  const result = await client.query('SELECT 1 FROM note_pages WHERE page_id = $1 AND is_deleted = FALSE LIMIT 1', [
    pageId,
  ]);
  return result.rows.length > 0;
}

async function isPersonalPageOwner(client: PoolClient, pageId: string, userId: string): Promise<boolean> {
  const result = await client.query('SELECT 1 FROM pages WHERE id = $1 AND owner_id = $2 AND is_deleted = FALSE LIMIT 1', [
    pageId,
    userId,
  ]);
  return result.rows.length > 0;
}

async function assertEditPermission(pageId: string, cognitoSub: string): Promise<void> {
  const client = await getPool().connect();
  try {
    const currentUser = await getCurrentUserBySub(client, cognitoSub);
    if (!currentUser) {
      throw new Error('User not found');
    }

    if (await canEditNotePage(client, pageId, currentUser)) {
      return;
    }

    const isShared = await pageBelongsToAnyNote(client, pageId);
    if (isShared) {
      throw new Error('Forbidden');
    }

    if (await isPersonalPageOwner(client, pageId, currentUser.id)) {
      return;
    }

    throw new Error('Forbidden');
  } finally {
    client.release();
  }
}

async function loadDocumentFromDb(pageId: string): Promise<Y.Doc> {
  const client = await getPool().connect();
  try {
    const result = await client.query<{ ydoc_state: Buffer }>(
      'SELECT ydoc_state FROM page_contents WHERE page_id = $1 LIMIT 1',
      [pageId]
    );
    const doc = new Y.Doc();
    const row = result.rows[0];
    if (row?.ydoc_state) {
      Y.applyUpdate(doc, new Uint8Array(row.ydoc_state));
    }
    return doc;
  } finally {
    client.release();
  }
}

async function saveDocumentToDb(pageId: string, document: Y.Doc): Promise<void> {
  const encodedState = Buffer.from(Y.encodeStateAsUpdate(document));
  const client = await getPool().connect();
  try {
    await client.query(
      `
        INSERT INTO page_contents (page_id, ydoc_state, version, content_text, updated_at)
        VALUES ($1, $2, 1, '', NOW())
        ON CONFLICT (page_id) DO UPDATE
          SET ydoc_state = EXCLUDED.ydoc_state,
              version = page_contents.version + 1,
              updated_at = NOW()
      `,
      [pageId, encodedState]
    );
  } finally {
    client.release();
  }
}

function parseRedisOptions(redisUrl: string): Record<string, unknown> {
  const parsed = new URL(redisUrl);
  const options: Record<string, unknown> = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }
  if (parsed.protocol === 'rediss:') {
    options.tls = {};
  }
  return options;
}

const extensions = [];
if (REDIS_URL) {
  try {
    const redisOptions = parseRedisOptions(REDIS_URL);
    extensions.push(new Redis(redisOptions as never));
    console.log('[Redis] Extension enabled');
  } catch (error) {
    console.error('[Redis] Invalid REDIS_URL; Redis extension disabled:', error);
  }
}

const hocuspocus = new Hocuspocus({
  name: 'zedi-hocuspocus',
  extensions,

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
      let payload: Record<string, unknown>;
      try {
        payload = (await cognitoVerifier.verify(token)) as Record<string, unknown>;
      } catch (err) {
        console.warn('[Auth] Cognito JWT verification failed:', err);
        throw new Error('Invalid token');
      }

      const sub = payload.sub as string;
      const name = (payload.name as string) || (payload['cognito:username'] as string) || sub;
      const pageId = parsePageId(documentName);
      if (!pageId) {
        throw new Error('Invalid document name');
      }
      await assertEditPermission(pageId, sub);
      const email = typeof payload.email === 'string' ? payload.email : undefined;
      const user: AuthenticatedUser = {
        id: sub,
        name,
        email,
        cognitoSub: sub,
      };
      return { user };
    }

    // 開発用: Cognito 未設定時は全許可
    return { user: { id: 'dev-user', name: 'Developer' } };
  },

  async onConnect({ documentName }) {
    const current = documentConnectionCounts.get(documentName) ?? 0;
    documentConnectionCounts.set(documentName, current + 1);
    console.log(`[Connect] Client connected to: ${documentName}`);
  },

  async onDisconnect({ documentName }) {
    const current = documentConnectionCounts.get(documentName) ?? 0;
    const remaining = Math.max(0, current - 1);
    if (remaining === 0) {
      documentConnectionCounts.delete(documentName);
    } else {
      documentConnectionCounts.set(documentName, remaining);
    }

    if (remaining === 0) {
      const pageId = parsePageId(documentName);
      const liveDoc = hocuspocus.documents.get(documentName);
      if (pageId && liveDoc) {
        try {
          await saveDocumentToDb(pageId, liveDoc as Y.Doc);
          console.log(`[Store] Persisted on last disconnect: ${documentName}`);
        } catch (error) {
          console.error(`[Store] Failed on last disconnect for ${documentName}:`, error);
        }
      }
    }
    console.log(`[Disconnect] Client disconnected from: ${documentName}`);
  },

  async onLoadDocument({ documentName }) {
    console.log(`[Load] Loading document: ${documentName}`);
    const pageId = parsePageId(documentName);
    if (!pageId) {
      return new Y.Doc();
    }
    return loadDocumentFromDb(pageId);
  },

  async onStoreDocument({ documentName, document }) {
    console.log(`[Store] Storing document: ${documentName}`);
    const pageId = parsePageId(documentName);
    if (!pageId) {
      return;
    }
    await saveDocumentToDb(pageId, document as Y.Doc);
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
  hocuspocus.closeConnections();
  if (pgPool) {
    await pgPool.end();
  }
  httpServer.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Shutdown] SIGINT received, closing server...');
  hocuspocus.closeConnections();
  if (pgPool) {
    await pgPool.end();
  }
  httpServer.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});
