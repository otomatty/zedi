import { Server as HocuspocusServer } from "@hocuspocus/server";
import { IncomingMessage, ServerResponse } from "http";
import { Redis } from "@hocuspocus/extension-redis";
import { Pool, PoolClient } from "pg";
import * as Y from "yjs";
import {
  decideAuthWhenApiInternalUrlMissing,
  isTruthyEnvFlag,
  warnDevAuthBypassOnce,
} from "./dev-auth-bypass.js";
import { buildContentPreview, extractTextFromYXml } from "./extractPlainTextFromYXml.js";
import {
  canEditFromRole,
  resolveNoteRole,
  type DomainFacts,
  type MemberFact,
  type NoteAccessFacts,
} from "./pageEditPermission.js";
import { maybeCreateSnapshot } from "./snapshotUtils.js";
import { applyWikiLinkMarksToYDoc } from "./ydocWikiLinkNormalizer.js";

const PORT = parseInt(process.env.PORT || "1234", 10);
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const API_INTERNAL_URL = process.env.API_INTERNAL_URL;
const INTERNAL_SECRET = process.env.BETTER_AUTH_SECRET?.trim();

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

function isAuthorizedInternalRequest(req: IncomingMessage): boolean {
  if (!INTERNAL_SECRET) return false;
  return req.headers["x-internal-secret"] === INTERNAL_SECRET;
}

async function verifySession(
  token: string,
): Promise<{ userId: string; email?: string; name?: string } | null> {
  if (!token.trim()) return null;
  const client = await getPool().connect();
  try {
    const result = await client.query<{
      user_id: string;
      email: string | null;
      name: string | null;
    }>(
      `
        SELECT s.user_id, u.email, u.name
        FROM "session" s
        JOIN "user" u ON u.id = s.user_id
        WHERE s.token = $1
          AND s.expires_at > NOW()
        LIMIT 1
      `,
      [token],
    );
    const row = result.rows[0];
    if (!row?.user_id) return null;
    return { userId: row.user_id, email: row.email ?? undefined, name: row.name ?? undefined };
  } catch (err) {
    console.error("[Auth] Session verification failed:", err);
    return null;
  } finally {
    client.release();
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

/**
 * `email` のドメイン部を小文字で返す。形式が不正な場合は `null`。
 * `note_domain_access` 突合用なので、API 側 `extractEmailDomain` と同じく
 * 末尾の `@` 以降だけを抽出し、空ドメインや `@` の位置不正は弾く。
 *
 * Lower-cased email domain (after the last `@`), or `null` for malformed
 * inputs. Mirrors the API's `extractEmailDomain` so domain-rule lookups
 * agree with REST endpoints.
 */
function extractEmailDomain(email: string | undefined | null): string | null {
  if (typeof email !== "string") return null;
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) return null;
  const domain = email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  return domain.length === 0 ? null : domain;
}

interface PageNoteRow {
  pageDeleted: boolean;
  noteId: string | null;
  noteFound: boolean;
  note: NoteAccessFacts | null;
}

/**
 * `pages` 行と所属ノートを 1 クエリで取得する。Issue #823 以降ページは必ず
 * `note_id` を持つので、`pages` を起点に `notes` を LEFT JOIN し、ページ削除済み
 * 状態とノートの基本属性を一度に拾う。
 *
 * Fetch the page row and its owning note in one round-trip. After issue #823
 * every `pages` row carries a `note_id`, so we start from `pages` and
 * `LEFT JOIN notes` to surface both the soft-delete flag and the note's
 * authorization fields together.
 */
async function fetchPageNoteState(client: PoolClient, pageId: string): Promise<PageNoteRow | null> {
  const result = await client.query<{
    page_deleted: boolean;
    note_id: string | null;
    note_deleted: boolean | null;
    owner_id: string | null;
    visibility: string | null;
    edit_permission: string | null;
  }>(
    `
      SELECT
        p.is_deleted        AS page_deleted,
        n.id                AS note_id,
        n.is_deleted        AS note_deleted,
        n.owner_id,
        n.visibility,
        n.edit_permission
      FROM pages p
      LEFT JOIN notes n ON n.id = p.note_id
      WHERE p.id = $1
      LIMIT 1
    `,
    [pageId],
  );
  const row = result.rows[0];
  if (!row) return null;

  if (
    row.note_id === null ||
    row.note_deleted === null ||
    row.note_deleted === true ||
    row.owner_id === null ||
    row.visibility === null ||
    row.edit_permission === null
  ) {
    return {
      pageDeleted: row.page_deleted,
      noteId: row.note_id,
      noteFound: false,
      note: null,
    };
  }

  return {
    pageDeleted: row.page_deleted,
    noteId: row.note_id,
    noteFound: true,
    note: {
      ownerId: row.owner_id,
      visibility: row.visibility as NoteAccessFacts["visibility"],
      editPermission: row.edit_permission as NoteAccessFacts["editPermission"],
    },
  };
}

async function fetchAcceptedMember(
  client: PoolClient,
  noteId: string,
  emailLower: string,
): Promise<MemberFact> {
  const result = await client.query<{ role: "viewer" | "editor" }>(
    `
      SELECT role
      FROM note_members
      WHERE note_id = $1
        AND LOWER(member_email) = $2
        AND is_deleted = FALSE
        AND status = 'accepted'
      LIMIT 1
    `,
    [noteId, emailLower],
  );
  const row = result.rows[0];
  return row ? { role: row.role } : null;
}

async function fetchDomainRules(
  client: PoolClient,
  noteId: string,
  emailLower: string,
): Promise<DomainFacts> {
  const domain = extractEmailDomain(emailLower);
  if (!domain) return { rules: [] };
  const result = await client.query<{ role: "viewer" | "editor" }>(
    `
      SELECT role
      FROM note_domain_access
      WHERE note_id = $1
        AND domain = $2
        AND is_deleted = FALSE
    `,
    [noteId, domain],
  );
  return { rules: result.rows.map((r) => ({ role: r.role })) };
}

/**
 * Hocuspocus 認証用の編集権限チェック。すべてのページが `pages.note_id` で
 * ちょうど 1 件のノートに所属する前提（Issue #823 / migration `0023`）で、
 * API 側 `assertPageEditAccess` と同じ意味論（owner → member → domain rule →
 * guest）でロールを解決し、`canEdit` で編集可否を判定する。
 *
 * Permission gate for the Hocuspocus `onAuthenticate` hook. After
 * issue #823 every page is anchored to exactly one note via `pages.note_id`,
 * so we resolve the role on that note (owner → member → domain → guest) and
 * call `canEditFromRole`, matching the REST `assertPageEditAccess` contract.
 */
async function assertEditPermission(pageId: string, userId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    const currentUser = await getCurrentUserById(client, userId);
    if (!currentUser) {
      throw new Error("User not found");
    }

    const pageNote = await fetchPageNoteState(client, pageId);
    if (!pageNote || pageNote.pageDeleted) {
      throw new Error("Page not found");
    }
    if (!pageNote.noteFound || !pageNote.note || !pageNote.noteId) {
      throw new Error("Note not found");
    }

    const note = pageNote.note;
    const noteId = pageNote.noteId;

    // owner はそれだけで編集可。owner 判定で短絡することで、member / domain の
    // 追加クエリを大半のケースでスキップできる（自分のデフォルトノート上では
    // この経路を必ず通る）。
    // Owner shortcut keeps the common case (editing in your own default note)
    // down to a single round-trip.
    if (note.ownerId === currentUser.id) return;

    const [member, domain] = await Promise.all([
      fetchAcceptedMember(client, noteId, currentUser.email),
      fetchDomainRules(client, noteId, currentUser.email),
    ]);

    const role = resolveNoteRole(
      note,
      { userId: currentUser.id, emailLower: currentUser.email },
      member,
      domain,
    );
    if (!canEditFromRole(role, note)) {
      throw new Error("Forbidden");
    }
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

    // Issue #880 Phase B リグレッション対応: 未 mark の `[[Title]]` プレーンテキスト
    // を本サーバ側で `wikiLink` mark に昇格させる。クライアント側で同等処理を
    // 行っていた `applyWikiLinkMarksToEditor` を撤去し、y-prosemirror の同期
    // 境界条件（lib0 `unexpectedCase`）を二度と踏まないようにする。
    // `marksApplied > 0` のときは Hocuspocus の onStoreDocument が自然に拾って
    // 保存するので、ここでは Y.Doc を変更するだけで永続化はトリガしない。
    // 失敗してもベストエフォートでログに残し、ロード自体は継続する。
    //
    // Issue #880 Phase B regression fix: promote unmarked `[[Title]]` plain
    // text to `wikiLink` marks server-side so the client never triggers the
    // y-prosemirror `unexpectedCase` boundary case via `addMark` on synced
    // docs. When `marksApplied > 0` the resulting Y.Doc update flows through
    // Hocuspocus' normal save path. Best-effort: load proceeds even on error.
    try {
      const { marksApplied } = applyWikiLinkMarksToYDoc(doc);
      if (marksApplied > 0) {
        console.log(`[WikiLinkNormalize] page=${pageId} marksApplied=${marksApplied}`);
      }
    } catch (error) {
      console.error(`[WikiLinkNormalize] Failed for page=${pageId}:`, error);
    }

    return doc;
  } finally {
    client.release();
  }
}

async function saveDocumentToDb(pageId: string, document: Y.Doc): Promise<void> {
  const encodedState = Buffer.from(Y.encodeStateAsUpdate(document));
  // Y.Doc からプレーンテキストを抽出（HTML タグなし・toDelta() ベース）
  // Extract plain text from Y.Doc (without HTML tags, using toDelta())
  const contentText = extractTextFromYXml(document.getXmlFragment("default"));
  const contentPreview = buildContentPreview(contentText);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO page_contents (page_id, ydoc_state, version, content_text, updated_at)
        VALUES ($1, $2, 1, $3, NOW())
        ON CONFLICT (page_id) DO UPDATE
          SET ydoc_state = EXCLUDED.ydoc_state,
              content_text = EXCLUDED.content_text,
              version = page_contents.version + 1,
              updated_at = NOW()
      `,
      [pageId, encodedState, contentText],
    );
    // ページ一覧用のプレビューを pages テーブルにも同期
    // Sync content preview to the pages table for page list display
    await client.query(`UPDATE pages SET content_preview = $1, updated_at = NOW() WHERE id = $2`, [
      contentPreview,
      pageId,
    ]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // 自動スナップショット判定（ベストエフォート: 失敗してもドキュメント保存に影響させない）
  // Auto-snapshot check (best-effort: failures do not affect document save)
  const snapshotClient = await getPool().connect();
  try {
    await maybeCreateSnapshot(snapshotClient, pageId, encodedState, contentText);
  } catch (error) {
    console.error(`[Snapshot] Failed to create auto-snapshot for page ${pageId}:`, error);
  } finally {
    snapshotClient.release();
  }

  // Issue #880 Phase C: 本文保存後に API 経由でリンクグラフ (links / ghost_links)
  // を再構築する。本処理は内部 HTTP 呼び出しのベストエフォートで、失敗しても
  // 本文保存の成功には影響させない。
  // Issue #880 Phase C: rebuild outgoing edges (links / ghost_links) via the
  // API's internal endpoint after persisting the document. Best-effort — a
  // failure does not roll back the content save.
  void triggerGraphSync(pageId).catch((error) => {
    console.error(`[GraphSync] Failed to trigger graph sync for page ${pageId}:`, error);
  });
}

/**
 * `API_INTERNAL_URL` の末尾スラッシュを取り除いた origin を返す。
 * Resolves the API origin used for internal calls. Returns `null` when the
 * variable is unset so the caller can skip silently in dev.
 */
function getApiInternalOrigin(): string | null {
  const raw = process.env.API_INTERNAL_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** HTTP timeout for the API graph-sync call (ms). / API グラフ同期 HTTP のタイムアウト (ms) */
const API_GRAPH_SYNC_TIMEOUT_MS = 2500;

/**
 * `POST /api/internal/pages/:id/graph-sync` を呼び出して、保存済み Y.Doc から
 * リンクグラフを再構築させる。ネットワーク失敗・タイムアウトは握りつぶす
 * （呼び出し元はベストエフォートで呼ぶ）。
 *
 * Call the API's internal graph-sync endpoint so it rebuilds outgoing edges
 * from the just-persisted Y.Doc. Network failures / timeouts are swallowed
 * because the caller treats this as best-effort.
 */
async function triggerGraphSync(pageId: string): Promise<void> {
  const baseUrl = getApiInternalOrigin();
  const secret = INTERNAL_SECRET;
  if (!baseUrl || !secret) {
    // dev: ログだけ残してスキップ。production では起動時に API_INTERNAL_URL
    // が未設定だと起動拒否しているため、ここに来るのは dev か設定ミス。
    // Dev: log + skip. In production the server already refuses to start
    // without `API_INTERNAL_URL`, so this branch is dev-only or misconfig.
    const missing = [baseUrl ? null : "API_INTERNAL_URL", secret ? null : "BETTER_AUTH_SECRET"]
      .filter((v): v is string => v !== null)
      .join(", ");
    console.warn(`[GraphSync] Skipped for page ${pageId}: missing env var(s): ${missing}`);
    return;
  }

  const url = `${baseUrl}/api/internal/pages/${encodeURIComponent(pageId)}/graph-sync`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_GRAPH_SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "x-internal-secret": secret },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      console.warn(`[GraphSync] HTTP ${response.status} for page ${pageId}`);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") {
      console.warn(`[GraphSync] Timed out for page ${pageId}`);
      return;
    }
    console.warn(`[GraphSync] Request failed for page ${pageId}:`, error);
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

const hocuspocusServer = new HocuspocusServer({
  port: PORT,
  stopOnSignals: false,
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
const hocuspocus = hocuspocusServer.hocuspocus;

async function invalidateLiveDocument(documentName: string): Promise<boolean> {
  if (!hocuspocus.documents.has(documentName)) {
    return false;
  }

  // closeConnections(documentName) は documents マップを走査するため、delete より先に呼ぶ。
  // Pass documentName so only that document's WebSocket connections close (not server-wide).
  hocuspocus.closeConnections(documentName);
  hocuspocus.documents.delete(documentName);
  return true;
}

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "POST") {
    const match = requestUrl.pathname.match(/^\/internal\/documents\/([^/]+)\/invalidate$/);
    if (match) {
      if (!isAuthorizedInternalRequest(req)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const pageId = decodeURIComponent(match[1] ?? "");
      const documentName = `page-${pageId}`;
      const invalidated = await invalidateLiveDocument(documentName);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, documentName, invalidated }));
      return;
    }
  }

  await handleHttpRequestFallback(requestUrl, res);
}

// Hocuspocus v4 owns WebSocket upgrades; keep our health/internal HTTP routes.
// WebSocket upgrade は Hocuspocus v4 に任せ、health/internal の HTTP ルートだけ差し替える。
hocuspocusServer.httpServer.removeAllListeners("request");
hocuspocusServer.httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
  void handleHttpRequest(req, res).catch((error) => {
    console.error("[HTTP] Request handling failed:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  });
});

async function handleHttpRequestFallback(requestUrl: URL, res: ServerResponse): Promise<void> {
  // ヘルスチェックエンドポイント
  if (requestUrl.pathname === "/health" || requestUrl.pathname === "/") {
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
}

if (NODE_ENV === "production" && !API_INTERNAL_URL) {
  console.error(
    "[Auth] CRITICAL: API_INTERNAL_URL is unset in production. Refusing to start. / " +
      "本番で内部 API URL が未設定です。起動を中止します。",
  );
  process.exit(1);
}

// サーバー起動
hocuspocusServer
  .listen(PORT, () => {
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
  })
  .catch((error) => {
    // Fail loudly on startup errors (port in use, onListen hook reject, etc.)
    // 起動時エラー（ポート競合・onListen フック失敗など）を握り潰さず即座に終了する
    console.error("[Startup] Failed to start hocuspocus server:", error);
    process.exit(1);
  });

// Graceful shutdown
async function gracefulShutdown(signal: "SIGTERM" | "SIGINT"): Promise<void> {
  console.log(`[Shutdown] ${signal} received, closing server...`);
  try {
    await hocuspocusServer.destroy();
    if (pgPool) {
      await pgPool.end();
    }
    console.log("[Shutdown] Server closed");
    process.exit(0);
  } catch (error) {
    console.error("[Shutdown] Failed to close server cleanly:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});
