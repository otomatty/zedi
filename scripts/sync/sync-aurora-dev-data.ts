#!/usr/bin/env bun
/**
 * Aurora 開発・本番 特定ユーザーデータ同期スクリプト
 *
 * 本番 Aurora と開発 Aurora の間で、設定で指定したユーザーのデータのみを同期する。
 * RDS Data API を使用（VPC 不要）。
 *
 * 仕様: docs/plans/aurora-sync-script-spec.md
 *
 * Usage:
 *   bun run scripts/sync/sync-aurora-dev-data.ts [options]
 *
 * Options:
 *   --dry-run      変更せず対象件数のみ表示
 *   --verbose      詳細ログ
 *   --direction     prod-to-dev | dev-to-prod | bidirectional
 *   --config <path> マッピング設定ファイル（既定: dev-user-mapping-aurora.json）
 */

import { RDSDataClient, ExecuteStatementCommand, type Field, type SqlParameter } from "@aws-sdk/client-rds-data";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RESUME_ERROR_NAME = "DatabaseResumingException";
const RESUME_MAX_RETRIES = 4;
const BATCH_PAGES = 100;const BATCH_PAGE_CONTENTS = 10; // RDS Data API response limit 1 MB; ydoc_state BYTEA can be large
const REGION = process.env.AWS_REGION || "ap-northeast-1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuroraConfig {
  clusterArn: string;
  secretArn: string;
  database: string;
}

interface DeveloperEntry {
  email: string;
  productionCognitoSub?: string;
  developmentCognitoSub?: string;
  description?: string;
}

type Direction = "prod-to-dev" | "dev-to-prod" | "bidirectional";
type ConflictResolution = "production-wins" | "development-wins" | "latest-wins";

interface SyncOptions {
  direction: Direction;
  conflictResolution: ConflictResolution;
  syncDeleted: boolean;
}

interface MappingConfig {
  developers: DeveloperEntry[];
  syncOptions?: Partial<SyncOptions>;
}

interface UserRow {
  id: string;
  cognito_sub: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface PageRow {
  id: string;
  owner_id: string;
  source_page_id: string | null;
  title: string | null;
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

interface PageContentRow {
  page_id: string;
  ydoc_state: string; // base64 in JSON response
  version: number;
  content_text: string | null;
  updated_at: string;
}

interface NoteRow {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

interface LinkRow {
  source_id: string;
  target_id: string;
  created_at: string;
}

interface GhostLinkRow {
  link_text: string;
  source_page_id: string;
  created_at: string;
  original_target_page_id: string | null;
  original_note_id: string | null;
}

interface NotePageRow {
  note_id: string;
  page_id: string;
  added_by_user_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

interface NoteMemberRow {
  note_id: string;
  member_email: string;
  role: string;
  invited_by_user_id: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

interface MediaRow {
  id: string;
  owner_id: string;
  page_id: string | null;
  s3_key: string;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const directionArg = args.find((_, i) => args[i - 1] === "--direction") as Direction | undefined;
const configArg = args.find((_, i) => args[i - 1] === "--config");

function log(msg: string, level: "info" | "verbose" | "error" = "info") {
  if (level === "verbose" && !verbose) return;
  if (level === "error") console.error(`❌ ${msg}`);
  else console.log(`${level === "verbose" ? "  " : ""}${msg}`);
}

// ---------------------------------------------------------------------------
// RDS Data API helper
// ---------------------------------------------------------------------------

function toParamValue(v: unknown): Field {
  if (v === null || v === undefined) return { isNull: true };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return { longValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  return { stringValue: String(v) };
}

function toParam(name: string, value: unknown): SqlParameter {
  const param: SqlParameter = {
    name,
    value: toParamValue(value),
  };
  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    param.typeHint = "UUID";
  }
  return param;
}

function buildParams(params: Record<string, unknown>): SqlParameter[] {
  return Object.entries(params).map(([name, value]) => toParam(name, value));
}

function createConnection(config: AuroraConfig) {
  const client = new RDSDataClient({ region: REGION });

  async function executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < RESUME_MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        const name = err && typeof err === "object" && "name" in err ? (err as { name: string }).name : "";
        if (name !== RESUME_ERROR_NAME || attempt === RESUME_MAX_RETRIES - 1) throw err;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    throw new Error("Unreachable");
  }

  return {
    async query(sql: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
      return executeWithRetry(async () => {
        const cmd = new ExecuteStatementCommand({
          resourceArn: config.clusterArn,
          secretArn: config.secretArn,
          database: config.database,
          sql,
          parameters: Object.keys(params).length ? buildParams(params) : undefined,
          formatRecordsAs: "JSON",
        });
        const res = await client.send(cmd);
        if (!res.formattedRecords) return [];
        return JSON.parse(res.formattedRecords) as Record<string, unknown>[];
      });
    },

    async run(sql: string, params: Record<string, unknown> = {}): Promise<void> {
      return executeWithRetry(async () => {
        const cmd = new ExecuteStatementCommand({
          resourceArn: config.clusterArn,
          secretArn: config.secretArn,
          database: config.database,
          sql,
          parameters: Object.keys(params).length ? buildParams(params) : undefined,
        });
        await client.send(cmd);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Config & env
// ---------------------------------------------------------------------------

function loadAuroraConfig(role: "prod" | "dev"): AuroraConfig {
  const prefix = role === "prod" ? "PROD_AURORA" : "DEV_AURORA";
  const clusterArn = process.env[`${prefix}_CLUSTER_ARN`];
  const secretArn = process.env[`${prefix}_SECRET_ARN`];
  if (!clusterArn || !secretArn) {
    throw new Error(
      `Missing ${prefix}_CLUSTER_ARN or ${prefix}_SECRET_ARN. Set env for ${role} Aurora (e.g. terraform output -raw db_credentials_secret_arn for dev).`
    );
  }
  return {
    clusterArn,
    secretArn,
    database: process.env[`${prefix}_DATABASE`] || "zedi",
  };
}

function loadMappingConfig(): MappingConfig {
  const configPath = configArg || resolve(__dirname, "dev-user-mapping-aurora.json");
  if (!existsSync(configPath)) {
    console.error(`
❌ Config not found: ${configPath}

Create it from the example:
  cp scripts/sync/dev-user-mapping-aurora.example.json scripts/sync/dev-user-mapping-aurora.json
Then edit developers and set PROD_AURORA_* / DEV_AURORA_* environment variables.
`);
    process.exit(1);
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as MappingConfig;
    if (!Array.isArray(raw.developers) || raw.developers.length === 0) {
      console.error("❌ config.developers must be a non-empty array.");
      process.exit(1);
    }
    return raw;
  } catch (e) {
    console.error("❌ Failed to parse config:", e);
    process.exit(1);
  }
}

const defaultSyncOptions: SyncOptions = {
  direction: "dev-to-prod",
  conflictResolution: "development-wins",
  syncDeleted: true,
};

// ---------------------------------------------------------------------------
// User resolution
// ---------------------------------------------------------------------------

async function findUserByEmail(
  conn: ReturnType<typeof createConnection>,
  email: string
): Promise<UserRow | null> {
  const rows = await conn.query(
    "SELECT id, cognito_sub, email, display_name, avatar_url, created_at, updated_at FROM users WHERE email = :email LIMIT 1",
    { email }
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    cognito_sub: r.cognito_sub as string,
    email: r.email as string,
    display_name: (r.display_name as string) ?? null,
    avatar_url: (r.avatar_url as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

async function findUserByCognitoSub(
  conn: ReturnType<typeof createConnection>,
  cognitoSub: string
): Promise<UserRow | null> {
  const rows = await conn.query(
    "SELECT id, cognito_sub, email, display_name, avatar_url, created_at, updated_at FROM users WHERE cognito_sub = :cognito_sub LIMIT 1",
    { cognito_sub: cognitoSub }
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    cognito_sub: r.cognito_sub as string,
    email: r.email as string,
    display_name: (r.display_name as string) ?? null,
    avatar_url: (r.avatar_url as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

/** Resolve user on the given "side" (prod or dev). Uses productionCognitoSub for prod, developmentCognitoSub for dev; else email. */
async function resolveUser(
  conn: ReturnType<typeof createConnection>,
  entry: DeveloperEntry,
  side: "prod" | "dev"
): Promise<UserRow | null> {
  const cognitoSub = side === "prod" ? entry.productionCognitoSub : entry.developmentCognitoSub;
  if (cognitoSub) return findUserByCognitoSub(conn, cognitoSub);
  return findUserByEmail(conn, entry.email);
}

async function resolveSourceUser(
  conn: ReturnType<typeof createConnection>,
  entry: DeveloperEntry,
  direction: "prod-to-dev" | "dev-to-prod"
): Promise<UserRow | null> {
  return resolveUser(conn, entry, direction === "prod-to-dev" ? "prod" : "dev");
}

async function resolveTargetUser(
  conn: ReturnType<typeof createConnection>,
  entry: DeveloperEntry,
  direction: "prod-to-dev" | "dev-to-prod"
): Promise<UserRow | null> {
  return resolveUser(conn, entry, direction === "prod-to-dev" ? "dev" : "prod");
}

async function ensureTargetUser(
  sourceConn: ReturnType<typeof createConnection>,
  targetConn: ReturnType<typeof createConnection>,
  sourceUser: UserRow,
  entry: DeveloperEntry,
  direction: "prod-to-dev" | "dev-to-prod"
): Promise<UserRow> {
  let target = await resolveTargetUser(targetConn, entry, direction);
  if (target) return target;

  if (dryRun) {
    log("  [DRY-RUN] Would upsert user into target", "verbose");
    return { ...sourceUser, id: "(dry-run)" };
  }

  await targetConn.run(
    `INSERT INTO users (id, cognito_sub, email, display_name, avatar_url, created_at, updated_at)
     VALUES (CAST(:id AS uuid), :cognito_sub, :email, :display_name, :avatar_url, CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz))
     ON CONFLICT (cognito_sub) DO NOTHING`,
    {
      id: sourceUser.id,
      cognito_sub: sourceUser.cognito_sub,
      email: sourceUser.email,
      display_name: sourceUser.display_name,
      avatar_url: sourceUser.avatar_url,
      created_at: sourceUser.created_at,
      updated_at: sourceUser.updated_at,
    }
  );

  target = await resolveTargetUser(targetConn, entry, direction);
  if (!target) {
    target = (await findUserByCognitoSub(targetConn, sourceUser.cognito_sub)) ?? (await findUserByEmail(targetConn, sourceUser.email)) ?? null;
  }
  if (!target) throw new Error(`Failed to create or find target user for ${entry.email}`);
  return target;
}

// ---------------------------------------------------------------------------
// Sync: pages
// ---------------------------------------------------------------------------

async function fetchPages(
  conn: ReturnType<typeof createConnection>,
  ownerId: string,
  syncDeleted: boolean
): Promise<PageRow[]> {
  const sql = syncDeleted
    ? "SELECT id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted FROM pages WHERE owner_id = CAST(:owner_id AS uuid) ORDER BY updated_at"
    : "SELECT id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted FROM pages WHERE owner_id = CAST(:owner_id AS uuid) AND NOT is_deleted ORDER BY updated_at";
  const rows = await conn.query(sql, { owner_id: ownerId });
  return rows.map((r) => ({
    id: r.id as string,
    owner_id: r.owner_id as string,
    source_page_id: (r.source_page_id as string) ?? null,
    title: (r.title as string) ?? null,
    content_preview: (r.content_preview as string) ?? null,
    thumbnail_url: (r.thumbnail_url as string) ?? null,
    source_url: (r.source_url as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    is_deleted: Boolean(r.is_deleted),
  }));
}

function shouldOverwritePage(
  existing: PageRow | null,
  source: PageRow,
  direction: Direction,
  conflictResolution: ConflictResolution
): boolean {
  if (!existing) return true;
  switch (conflictResolution) {
    case "latest-wins":
      return new Date(source.updated_at).getTime() > new Date(existing.updated_at).getTime();
    case "production-wins":
      return direction === "prod-to-dev";
    case "development-wins":
      return direction === "dev-to-prod";
    default:
      return false;
  }
}

async function syncPages(
  sourceConn: ReturnType<typeof createConnection>,
  targetConn: ReturnType<typeof createConnection>,
  sourceUserId: string,
  targetUserId: string,
  direction: Direction,
  conflictResolution: ConflictResolution,
  syncDeleted: boolean
): Promise<{ synced: number; skipped: number }> {
  const sourcePages = await fetchPages(sourceConn, sourceUserId, syncDeleted);
  const existingPages = await fetchPages(targetConn, targetUserId, true);
  const existingMap = new Map(existingPages.map((p) => [p.id, p]));

  let synced = 0;
  let skipped = 0;

  for (const page of sourcePages) {
    const existing = existingMap.get(page.id);
    if (!shouldOverwritePage(existing ?? null, page, direction, conflictResolution)) {
      skipped++;
      if (verbose) log(`    skip page ${page.id} (${page.title || "untitled"})`, "verbose");
      continue;
    }

    if (!dryRun) {
      await targetConn.run(
        `INSERT INTO pages (id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted)
         VALUES (CAST(:id AS uuid), CAST(:owner_id AS uuid), CAST(:source_page_id AS uuid), :title, :content_preview, :thumbnail_url, :source_url, CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz), :is_deleted)
         ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, source_page_id = EXCLUDED.source_page_id, title = EXCLUDED.title, content_preview = EXCLUDED.content_preview, thumbnail_url = EXCLUDED.thumbnail_url, source_url = EXCLUDED.source_url, updated_at = EXCLUDED.updated_at, is_deleted = EXCLUDED.is_deleted`,
        {
          id: page.id,
          owner_id: targetUserId,
          source_page_id: page.source_page_id,
          title: page.title,
          content_preview: page.content_preview,
          thumbnail_url: page.thumbnail_url,
          source_url: page.source_url,
          created_at: page.created_at,
          updated_at: page.updated_at,
          is_deleted: page.is_deleted,
        }
      );
    }
    synced++;
  }

  return { synced, skipped };
}

// ---------------------------------------------------------------------------
// Sync: page_contents
// ---------------------------------------------------------------------------

async function fetchPageContents(
  conn: ReturnType<typeof createConnection>,
  pageIds: string[]
): Promise<PageContentRow[]> {
  if (pageIds.length === 0) return [];
  const out: PageContentRow[] = [];
  for (let i = 0; i < pageIds.length; i += BATCH_PAGE_CONTENTS) {
    const batch = pageIds.slice(i, i + BATCH_PAGE_CONTENTS);
    const placeholders = batch.map((_, j) => `:id${j}`).join(",");
    const params: Record<string, unknown> = {};
    batch.forEach((id, j) => (params[`id${j}`] = id));
    const sql = `SELECT page_id, ydoc_state, version, content_text, updated_at FROM page_contents WHERE page_id IN (${batch.map((_, j) => `CAST(:id${j} AS uuid)`).join(",")})`;
    const rows = await conn.query(sql, params);
    for (const r of rows) {
      const ydoc = r.ydoc_state;
      out.push({
        page_id: r.page_id as string,
        ydoc_state: typeof ydoc === "string" ? ydoc : (ydoc != null ? Buffer.from(ydoc as ArrayBuffer).toString("base64") : ""),
        version: Number(r.version),
        content_text: (r.content_text as string) ?? null,
        updated_at: r.updated_at as string,
      });
    }
  }
  return out;
}

async function syncPageContents(
  sourceConn: ReturnType<typeof createConnection>,
  targetConn: ReturnType<typeof createConnection>,
  pageIds: string[],
  contents: PageContentRow[]
): Promise<number> {
  if (pageIds.length === 0 || contents.length === 0) return 0;
  let count = 0;
  for (const row of contents) {
    if (!dryRun) {
      await targetConn.run(
        `INSERT INTO page_contents (page_id, ydoc_state, version, content_text, updated_at)
         VALUES (CAST(:page_id AS uuid), decode(:ydoc_b64, 'base64'), :version, :content_text, CAST(:updated_at AS timestamptz))
         ON CONFLICT (page_id) DO UPDATE SET ydoc_state = EXCLUDED.ydoc_state, version = EXCLUDED.version, content_text = EXCLUDED.content_text, updated_at = EXCLUDED.updated_at`,
        {
          page_id: row.page_id,
          ydoc_b64: row.ydoc_state,
          version: row.version,
          content_text: row.content_text,
          updated_at: row.updated_at,
        }
      );
    }
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Sync: notes, note_pages, note_members
// ---------------------------------------------------------------------------

async function fetchNotes(
  conn: ReturnType<typeof createConnection>,
  ownerId: string,
  syncDeleted: boolean
): Promise<NoteRow[]> {
  const sql = syncDeleted
    ? "SELECT id, owner_id, title, visibility, created_at, updated_at, is_deleted FROM notes WHERE owner_id = CAST(:owner_id AS uuid)"
    : "SELECT id, owner_id, title, visibility, created_at, updated_at, is_deleted FROM notes WHERE owner_id = CAST(:owner_id AS uuid) AND NOT is_deleted";
  const rows = await conn.query(sql, { owner_id: ownerId });
  return rows.map((r) => ({
    id: r.id as string,
    owner_id: r.owner_id as string,
    title: (r.title as string) ?? null,
    visibility: r.visibility as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    is_deleted: Boolean(r.is_deleted),
  }));
}

async function syncNotes(
  sourceConn: ReturnType<typeof createConnection>,
  targetConn: ReturnType<typeof createConnection>,
  sourceUserId: string,
  targetUserId: string,
  syncDeleted: boolean
): Promise<number> {
  const notes = await fetchNotes(sourceConn, sourceUserId, syncDeleted);
  let count = 0;
  for (const row of notes) {
    if (!dryRun) {
      await targetConn.run(
        `INSERT INTO notes (id, owner_id, title, visibility, created_at, updated_at, is_deleted)
         VALUES (CAST(:id AS uuid), CAST(:owner_id AS uuid), :title, :visibility, CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz), :is_deleted)
         ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, title = EXCLUDED.title, visibility = EXCLUDED.visibility, updated_at = EXCLUDED.updated_at, is_deleted = EXCLUDED.is_deleted`,
        {
          id: row.id,
          owner_id: targetUserId,
          title: row.title,
          visibility: row.visibility,
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_deleted: row.is_deleted,
        }
      );
    }
    count++;
  }
  return count;
}

async function fetchNotePages(conn: ReturnType<typeof createConnection>, noteIds: string[]): Promise<NotePageRow[]> {
  if (noteIds.length === 0) return [];
  const out: NotePageRow[] = [];
  for (let i = 0; i < noteIds.length; i += BATCH_PAGES) {
    const batch = noteIds.slice(i, i + BATCH_PAGES);
    const params: Record<string, unknown> = {};
    batch.forEach((id, j) => (params[`id${j}`] = id));
    const sql = `SELECT note_id, page_id, added_by_user_id, sort_order, created_at, updated_at, is_deleted FROM note_pages WHERE note_id IN (${batch.map((_, j) => `CAST(:id${j} AS uuid)`).join(",")})`;
    const rows = await conn.query(sql, params);
    for (const r of rows) {
      out.push({
        note_id: r.note_id as string,
        page_id: r.page_id as string,
        added_by_user_id: r.added_by_user_id as string,
        sort_order: Number(r.sort_order),
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        is_deleted: Boolean(r.is_deleted),
      });
    }
  }
  return out;
}

async function syncNotePages(
  sourceConn: ReturnType<typeof createConnection>,
  targetConn: ReturnType<typeof createConnection>,
  noteIds: string[],
  addedByMap: Map<string, string>,
  defaultAddedByUserId: string
): Promise<number> {
  const rows = await fetchNotePages(sourceConn, noteIds);
  let count = 0;
  for (const row of rows) {
    const addedBy = addedByMap.get(row.added_by_user_id) ?? defaultAddedByUserId;
    if (!dryRun) {
      await targetConn.run(
        `INSERT INTO note_pages (note_id, page_id, added_by_user_id, sort_order, created_at, updated_at, is_deleted)
         VALUES (CAST(:note_id AS uuid), CAST(:page_id AS uuid), CAST(:added_by_user_id AS uuid), :sort_order, CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz), :is_deleted)
         ON CONFLICT (note_id, page_id) DO UPDATE SET added_by_user_id = EXCLUDED.added_by_user_id, sort_order = EXCLUDED.sort_order, updated_at = EXCLUDED.updated_at, is_deleted = EXCLUDED.is_deleted`,
        {
          note_id: row.note_id,
          page_id: row.page_id,
          added_by_user_id: addedBy,
          sort_order: row.sort_order,
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_deleted: row.is_deleted,
        }
      );
    }
    count++;
  }
  return count;
}

async function fetchNoteMembers(conn: ReturnType<typeof createConnection>, noteIds: string[]): Promise<NoteMemberRow[]> {
  if (noteIds.length === 0) return [];
  const out: NoteMemberRow[] = [];
  for (let i = 0; i < noteIds.length; i += BATCH_PAGES) {
    const batch = noteIds.slice(i, i + BATCH_PAGES);
    const params: Record<string, unknown> = {};
    batch.forEach((id, j) => (params[`id${j}`] = id));
    const sql = `SELECT note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted FROM note_members WHERE note_id IN (${batch.map((_, j) => `CAST(:id${j} AS uuid)`).join(",")})`;
    const rows = await conn.query(sql, params);
    for (const r of rows) {
      out.push({
        note_id: r.note_id as string,
        member_email: r.member_email as string,
        role: r.role as string,
        invited_by_user_id: r.invited_by_user_id as string,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        is_deleted: Boolean(r.is_deleted),
      });
    }
  }
  return out;
}

async function syncNoteMembers(
  sourceConn: ReturnType<typeof createConnection>,
  targetConn: ReturnType<typeof createConnection>,
  noteIds: string[],
  invitedByMap: Map<string, string>,
  defaultInvitedByUserId: string
): Promise<number> {
  const rows = await fetchNoteMembers(sourceConn, noteIds);
  let count = 0;
  for (const row of rows) {
    const invitedBy = invitedByMap.get(row.invited_by_user_id) ?? defaultInvitedByUserId;
    if (!dryRun) {
      await targetConn.run(
        `INSERT INTO note_members (note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted)
         VALUES (CAST(:note_id AS uuid), :member_email, :role, CAST(:invited_by_user_id AS uuid), CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz), :is_deleted)
         ON CONFLICT (note_id, member_email) DO UPDATE SET role = EXCLUDED.role, invited_by_user_id = EXCLUDED.invited_by_user_id, updated_at = EXCLUDED.updated_at, is_deleted = EXCLUDED.is_deleted`,
        {
          note_id: row.note_id,
          member_email: row.member_email,
          role: row.role,
          invited_by_user_id: invitedBy,
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_deleted: row.is_deleted,
        }
      );
    }
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Sync: links, ghost_links
// ---------------------------------------------------------------------------

async function fetchLinks(conn: ReturnType<typeof createConnection>, sourcePageIds: string[]): Promise<LinkRow[]> {
  if (sourcePageIds.length === 0) return [];
  const out: LinkRow[] = [];
  for (let i = 0; i < sourcePageIds.length; i += BATCH_PAGES) {
    const batch = sourcePageIds.slice(i, i + BATCH_PAGES);
    const params: Record<string, unknown> = {};
    batch.forEach((id, j) => (params[`id${j}`] = id));
    const sql = `SELECT source_id, target_id, created_at FROM links WHERE source_id IN (${batch.map((_, j) => `CAST(:id${j} AS uuid)`).join(",")})`;
    const rows = await conn.query(sql, params);
    for (const r of rows) {
      out.push({
        source_id: r.source_id as string,
        target_id: r.target_id as string,
        created_at: r.created_at as string,
      });
    }
  }
  return out;
}

async function syncLinks(
  targetConn: ReturnType<typeof createConnection>,
  links: LinkRow[]
): Promise<number> {
  let count = 0;
  for (const row of links) {
    if (!dryRun) {
      await targetConn.run(
        `INSERT INTO links (source_id, target_id, created_at) VALUES (CAST(:source_id AS uuid), CAST(:target_id AS uuid), CAST(:created_at AS timestamptz)) ON CONFLICT (source_id, target_id) DO NOTHING`,
        { source_id: row.source_id, target_id: row.target_id, created_at: row.created_at }
      );
    }
    count++;
  }
  return count;
}

async function fetchGhostLinks(conn: ReturnType<typeof createConnection>, sourcePageIds: string[]): Promise<GhostLinkRow[]> {
  if (sourcePageIds.length === 0) return [];
  const out: GhostLinkRow[] = [];
  for (let i = 0; i < sourcePageIds.length; i += BATCH_PAGES) {
    const batch = sourcePageIds.slice(i, i + BATCH_PAGES);
    const params: Record<string, unknown> = {};
    batch.forEach((id, j) => (params[`id${j}`] = id));
    const sql = `SELECT link_text, source_page_id, created_at, original_target_page_id, original_note_id FROM ghost_links WHERE source_page_id IN (${batch.map((_, j) => `CAST(:id${j} AS uuid)`).join(",")})`;
    const rows = await conn.query(sql, params);
    for (const r of rows) {
      out.push({
        link_text: r.link_text as string,
        source_page_id: r.source_page_id as string,
        created_at: r.created_at as string,
        original_target_page_id: (r.original_target_page_id as string) ?? null,
        original_note_id: (r.original_note_id as string) ?? null,
      });
    }
  }
  return out;
}

async function syncGhostLinks(
  targetConn: ReturnType<typeof createConnection>,
  ghostLinks: GhostLinkRow[]
): Promise<number> {
  let count = 0;
  for (const row of ghostLinks) {
    if (!dryRun) {
      await targetConn.run(
        `INSERT INTO ghost_links (link_text, source_page_id, created_at, original_target_page_id, original_note_id)
         VALUES (:link_text, CAST(:source_page_id AS uuid), CAST(:created_at AS timestamptz), CAST(:original_target_page_id AS uuid), CAST(:original_note_id AS uuid))
         ON CONFLICT (link_text, source_page_id) DO UPDATE SET created_at = EXCLUDED.created_at, original_target_page_id = EXCLUDED.original_target_page_id, original_note_id = EXCLUDED.original_note_id`,
        {
          link_text: row.link_text,
          source_page_id: row.source_page_id,
          created_at: row.created_at,
          original_target_page_id: row.original_target_page_id,
          original_note_id: row.original_note_id,
        }
      );
    }
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Sync: media
// ---------------------------------------------------------------------------

async function fetchMedia(
  conn: ReturnType<typeof createConnection>,
  ownerId: string
): Promise<MediaRow[]> {
  const rows = await conn.query(
    "SELECT id, owner_id, page_id, s3_key, file_name, content_type, file_size, created_at FROM media WHERE owner_id = CAST(:owner_id AS uuid)",
    { owner_id: ownerId }
  );
  return rows.map((r) => ({
    id: r.id as string,
    owner_id: r.owner_id as string,
    page_id: (r.page_id as string) ?? null,
    s3_key: r.s3_key as string,
    file_name: (r.file_name as string) ?? null,
    content_type: (r.content_type as string) ?? null,
    file_size: (r.file_size as number) ?? null,
    created_at: r.created_at as string,
  }));
}

async function syncMedia(
  sourceConn: ReturnType<typeof createConnection>,
  targetConn: ReturnType<typeof createConnection>,
  sourceUserId: string,
  targetUserId: string
): Promise<number> {
  const rows = await fetchMedia(sourceConn, sourceUserId);
  let count = 0;
  for (const row of rows) {
    if (!dryRun) {
      await targetConn.run(
        `INSERT INTO media (id, owner_id, page_id, s3_key, file_name, content_type, file_size, created_at)
         VALUES (CAST(:id AS uuid), CAST(:owner_id AS uuid), CAST(:page_id AS uuid), :s3_key, :file_name, :content_type, :file_size, CAST(:created_at AS timestamptz))
         ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, page_id = EXCLUDED.page_id, s3_key = EXCLUDED.s3_key, file_name = EXCLUDED.file_name, content_type = EXCLUDED.content_type, file_size = EXCLUDED.file_size`,
        {
          id: row.id,
          owner_id: targetUserId,
          page_id: row.page_id,
          s3_key: row.s3_key,
          file_name: row.file_name,
          content_type: row.content_type,
          file_size: row.file_size,
          created_at: row.created_at,
        }
      );
    }
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Run sync for one direction
// ---------------------------------------------------------------------------

async function runDirection(
  direction: "prod-to-dev" | "dev-to-prod",
  prodConn: ReturnType<typeof createConnection>,
  devConn: ReturnType<typeof createConnection>,
  config: MappingConfig,
  options: SyncOptions
): Promise<void> {
  const sourceRole = direction === "prod-to-dev" ? "prod" : "dev";
  const targetRole = direction === "prod-to-dev" ? "dev" : "prod";
  const sourceConn = direction === "prod-to-dev" ? prodConn : devConn;
  const targetConn = direction === "prod-to-dev" ? devConn : prodConn;

  for (const entry of config.developers) {
    const label = entry.email || entry.description || "(no email)";
    log(`\n👤 ${label} [${direction}]`, "info");

    const sourceUser = await resolveSourceUser(sourceConn, entry, direction);
    if (!sourceUser) {
      log(`  No source user found (email or cognito_sub). Skip.`, "error");
      continue;
    }

    let targetUser: UserRow;
    try {
      targetUser = await ensureTargetUser(sourceConn, targetConn, sourceUser, entry, direction);
    } catch (e) {
      log(`  Failed to ensure target user: ${e}`, "error");
      continue;
    }

    if (dryRun && targetUser.id === "(dry-run)") targetUser = { ...sourceUser, id: sourceUser.id };

    const { synced: pagesSynced, skipped: pagesSkipped } = await syncPages(
      sourceConn,
      targetConn,
      sourceUser.id,
      targetUser.id,
      direction,
      options.conflictResolution,
      options.syncDeleted
    );
    log(`  Pages: ${pagesSynced} synced, ${pagesSkipped} skipped`, "info");

    const pageIds = (await fetchPages(sourceConn, sourceUser.id, options.syncDeleted)).map((p) => p.id);
    const contents = await fetchPageContents(sourceConn, pageIds);
    const contentCount = await syncPageContents(sourceConn, targetConn, pageIds, contents);
    log(`  Page contents: ${contentCount}`, "verbose");

    const noteCount = await syncNotes(sourceConn, targetConn, sourceUser.id, targetUser.id, options.syncDeleted);
    log(`  Notes: ${noteCount}`, "verbose");

    const noteIds = (await fetchNotes(sourceConn, sourceUser.id, options.syncDeleted)).map((n) => n.id);
    const addedByMap = new Map<string, string>([[sourceUser.id, targetUser.id]]);
    const notePagesCount = await syncNotePages(sourceConn, targetConn, noteIds, addedByMap, targetUser.id);
    log(`  Note pages: ${notePagesCount}`, "verbose");

    const invitedByMap = new Map<string, string>([[sourceUser.id, targetUser.id]]);
    const noteMembersCount = await syncNoteMembers(sourceConn, targetConn, noteIds, invitedByMap, targetUser.id);
    log(`  Note members: ${noteMembersCount}`, "verbose");

    const links = await fetchLinks(sourceConn, pageIds);
    const linksCount = await syncLinks(targetConn, links);
    log(`  Links: ${linksCount}`, "verbose");

    const ghostLinks = await fetchGhostLinks(sourceConn, pageIds);
    const ghostCount = await syncGhostLinks(targetConn, ghostLinks);
    log(`  Ghost links: ${ghostCount}`, "verbose");

    const mediaCount = await syncMedia(sourceConn, targetConn, sourceUser.id, targetUser.id);
    log(`  Media: ${mediaCount}`, "verbose");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║       Zedi Aurora Developer Data Sync                         ║
╚════════════════════════════════════════════════════════════════╝
`);

  if (dryRun) log("🔍 DRY RUN - No changes will be written.\n", "info");

  const config = loadMappingConfig();
  const options: SyncOptions = {
    ...defaultSyncOptions,
    ...config.syncOptions,
    direction: directionArg ?? config.syncOptions?.direction ?? defaultSyncOptions.direction,
  };

  log("Configuration:", "info");
  log(`  direction: ${options.direction}`, "info");
  log(`  conflictResolution: ${options.conflictResolution}`, "info");
  log(`  syncDeleted: ${options.syncDeleted}`, "info");
  log(`  developers: ${config.developers.length}`, "info");

  let prodConfig: AuroraConfig | null = null;
  let devConfig: AuroraConfig | null = null;
  try {
    devConfig = loadAuroraConfig("dev");
    if (options.direction === "prod-to-dev" || options.direction === "bidirectional") {
      prodConfig = loadAuroraConfig("prod");
    }
    if (options.direction === "dev-to-prod" || options.direction === "bidirectional") {
      if (!devConfig) devConfig = loadAuroraConfig("dev");
      if (!prodConfig) prodConfig = loadAuroraConfig("prod");
    }
  } catch (e) {
    console.error(String(e));
    process.exit(1);
  }

  const prodConn = prodConfig ? createConnection(prodConfig) : null;
  const devConn = devConfig ? createConnection(devConfig) : null;

  if (options.direction === "prod-to-dev" || options.direction === "bidirectional") {
    if (!prodConn || !devConn) {
      console.error("❌ Prod and dev connections required for prod-to-dev.");
      process.exit(1);
    }
    await runDirection("prod-to-dev", prodConn!, devConn!, config, options);
  }
  if (options.direction === "dev-to-prod" || options.direction === "bidirectional") {
    if (!prodConn || !devConn) {
      console.error("❌ Prod and dev connections required for dev-to-prod.");
      process.exit(1);
    }
    await runDirection("dev-to-prod", prodConn!, devConn!, config, options);
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║       ✅ Sync Complete                                         ║
╚════════════════════════════════════════════════════════════════╝
`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err instanceof Error ? err.message : err);
  if (verbose && err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
