import { Hocuspocus } from "@hocuspocus/server";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer } from "ws";
import { Redis } from "@hocuspocus/extension-redis";
import { Pool, PoolClient } from "pg";
import * as Y from "yjs";
import {
  decideAuthWhenApiInternalUrlMissing,
  isTruthyEnvFlag,
  warnDevAuthBypassOnce,
} from "./dev-auth-bypass.js";

const PORT = parseInt(process.env.PORT || "1234", 10);
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const API_INTERNAL_URL = process.env.API_INTERNAL_URL;
/** Cached env reads for auth paths (avoid repeated `process.env` lookups). / 認証経路用に env を一度だけ読む */
const NODE_ENV = process.env.NODE_ENV;
const HOCUSPOCUS_DEV_MODE = process.env.HOCUSPOCUS_DEV_MODE;

type AuthenticatedUser = {
  id: string;
  name: string;
  email?: string;
};

type DbUser = {
  id: string;
  email: string;
};

let pgPool: Pool | null = null;
const documentConnectionCounts = new Map<string, number>();

function parsePageId(documentName: string): string | null {
  if (!documentName.startsWith("page-")) return null;
  const pageId = documentName.slice("page-".length).trim();
  return pageId.length > 0 ? pageId : null;
}

function getPool(): Pool {
  if (pgPool) return pgPool;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  return pgPool;
}

async function verifySession(
  token: string,
): Promise<{ userId: string; email?: string; name?: string } | null> {
  if (!API_INTERNAL_URL) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${API_INTERNAL_URL}/api/auth/get-session`, {
      headers: { cookie: `better-auth.session_token=${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      user?: { id: string; email?: string; name?: string };
    };
    if (!data.user?.id) return null;
    return { userId: data.user.id, email: data.user.email, name: data.user.name };
  } catch (err) {
    console.error("[Auth] Session verification failed:", err);
    return null;
  }
}

async function getCurrentUserById(client: PoolClient, userId: string): Promise<DbUser | null> {
  const result = await client.query<{ id: string; email: string }>(
    'SELECT id, email FROM "user" WHERE id = $1 LIMIT 1',
    [userId],
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
        AND (
          n.owner_id = $2
          OR nm.role = 'editor'
          OR (
            COALESCE(n.edit_permission, 'owner_only') = 'any_logged_in'
            AND n.visibility IN ('public', 'unlisted')
          )
        )
      LIMIT 1
    `,
    [pageId, user.id, user.email],
  );
  return result.rows.length > 0;
}

async function pageBelongsToAnyNote(client: PoolClient, pageId: string): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM note_pages WHERE page_id = $1 AND is_deleted = FALSE LIMIT 1",
    [pageId],
  );
  return result.rows.length > 0;
}

async function isPersonalPageOwner(
  client: PoolClient,
  pageId: string,
  userId: string,
): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM pages WHERE id = $1 AND owner_id = $2 AND is_deleted = FALSE LIMIT 1",
    [pageId, userId],
  );
  return result.rows.length > 0;
}

async function assertEditPermission(pageId: string, userId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    const currentUser = await getCurrentUserById(client, userId);
    if (!currentUser) {
      throw new Error("User not found");
    }

    if (await canEditNotePage(client, pageId, currentUser)) {
      return;
    }

    const isShared = await pageBelongsToAnyNote(client, pageId);
    if (isShared) {
      throw new Error("Forbidden");
    }

    if (await isPersonalPageOwner(client, pageId, currentUser.id)) {
      return;
    }

    throw new Error("Forbidden");
  } finally {
    client.release();
  }
}

async function loadDocumentFromDb(pageId: string): Promise<Y.Doc> {
  const client = await getPool().connect();
  try {
    const result = await client.query<{ ydoc_state: Buffer }>(
      "SELECT ydoc_state FROM page_contents WHERE page_id = $1 LIMIT 1",
      [pageId],
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
      [pageId, encodedState],
    );
  } finally {
    client.release();
  }
}

function parseRedisOptions(redisUrl: string): Record<string, unknown> {
  const parsed = new URL(redisUrl);
  const ioredisOptions: Record<string, unknown> = {};
  if (parsed.username) {
    ioredisOptions.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    ioredisOptions.password = decodeURIComponent(parsed.password);
  }
  if (parsed.protocol === "rediss:") {
    ioredisOptions.tls = {};
  }
  const dbMatch = parsed.pathname?.match(/^\/(\d+)$/);
  if (dbMatch) {
    ioredisOptions.db = Number(dbMatch[1]);
  }
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    options: ioredisOptions,
  };
}

const extensions = [];
if (REDIS_URL) {
  try {
    const redisOptions = parseRedisOptions(REDIS_URL);
    extensions.push(new Redis(redisOptions as never));
    console.log("[Redis] Extension enabled");
  } catch (error) {
    console.error("[Redis] Invalid REDIS_URL; Redis extension disabled:", error);
  }
}

const hocuspocus = new Hocuspocus({
  name: "zedi-hocuspocus",
  extensions,

  // デバウンス設定（ドキュメント保存の頻度制御）
  debounce: 2000,
  maxDebounce: 10000,

  // タイムアウト設定
  timeout: 30000,

  async onAuthenticate({ token, documentName }) {
    console.log(`[Auth] Document: ${documentName}, Token: ${token ? "provided" : "none"}`);

    if (!API_INTERNAL_URL) {
      const decision = decideAuthWhenApiInternalUrlMissing(NODE_ENV, HOCUSPOCUS_DEV_MODE);
      if (decision.action === "throw") {
        throw new Error(decision.message);
      }
      warnDevAuthBypassOnce();
      return { user: { id: "dev-user", name: "Developer" } };
    }

    if (!token) {
      throw new Error("Authentication required");
    }

    const sessionData = await verifySession(token);
    if (!sessionData) {
      throw new Error("Invalid session");
    }

    const pageId = parsePageId(documentName);
    if (!pageId) {
      throw new Error("Invalid document name");
    }

    await assertEditPermission(pageId, sessionData.userId);

    const user: AuthenticatedUser = {
      id: sessionData.userId,
      name: sessionData.name || sessionData.userId,
      email: sessionData.email,
    };
    return { user };
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

  async onChange({ documentName: _documentName }) {
    // ドキュメント変更時（デバウンス前）
  },
});

// カスタムHTTPサーバー（ヘルスチェック用）
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // ヘルスチェックエンドポイント
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        service: "zedi-hocuspocus",
        timestamp: new Date().toISOString(),
        connections: hocuspocus.getConnectionsCount(),
        documents: hocuspocus.getDocumentsCount(),
      }),
    );
    return;
  }

  // その他のリクエストは404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

// WebSocketサーバーをHTTPサーバーにアタッチ
const wss = new WebSocketServer({ server: httpServer });

// WebSocket接続をHocuspocusに渡す
wss.on("connection", (socket, request) => {
  hocuspocus.handleConnection(socket, request);
});

if (NODE_ENV === "production" && !API_INTERNAL_URL) {
  console.error(
    "[Auth] CRITICAL: API_INTERNAL_URL is unset in production. Refusing to start. / " +
      "本番で内部 API URL が未設定です。起動を中止します。",
  );
  process.exit(1);
}

// サーバー起動
httpServer.listen(PORT, () => {
  console.log("========================================");
  console.log("  Zedi Hocuspocus Server Started");
  console.log("========================================");
  console.log(`  Port:         ${PORT}`);
  console.log(`  Health:       http://localhost:${PORT}/health`);
  console.log(`  WebSocket:    ws://localhost:${PORT}`);
  console.log(`  Redis:        ${REDIS_URL ? "Enabled" : "Disabled"}`);
  console.log(`  Environment:  ${NODE_ENV || "development"}`);
  if (!API_INTERNAL_URL && NODE_ENV !== "production") {
    if (isTruthyEnvFlag(HOCUSPOCUS_DEV_MODE)) {
      console.warn(
        "[Auth] API_INTERNAL_URL is unset; HOCUSPOCUS_DEV_MODE allows unauthenticated collaboration. / " +
          "内部 API URL 未設定のため開発バイパスが有効です。",
      );
    } else {
      console.warn(
        "[Auth] API_INTERNAL_URL is unset; WebSocket auth will fail until it is set or HOCUSPOCUS_DEV_MODE=true (local dev only). / " +
          "内部 API URL 未設定のため接続は拒否されます（ローカル検証のみ HOCUSPOCUS_DEV_MODE=true）。",
      );
    }
  }
  console.log("========================================");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Shutdown] SIGTERM received, closing server...");
  hocuspocus.closeConnections();
  if (pgPool) {
    await pgPool.end();
  }
  httpServer.close(() => {
    console.log("[Shutdown] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("[Shutdown] SIGINT received, closing server...");
  hocuspocus.closeConnections();
  if (pgPool) {
    await pgPool.end();
  }
  httpServer.close(() => {
    console.log("[Shutdown] Server closed");
    process.exit(0);
  });
});
