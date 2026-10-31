import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/*
 * Drizzle schema for D1. It mirrors migrations/*.sql (the source of truth that
 * `wrangler d1 migrations apply` runs); the FTS5 table and its triggers live only in SQL.
 * D1 用の Drizzle スキーマ。正本は migrations/*.sql（FTS5 とトリガーは SQL のみ）。
 */

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

/** Better Auth: users. */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  ...timestamps,
});

/** Better Auth: sessions (looked up by token from the session cookie). */
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** When the session passed the second step; null right after Google sign-in. */
    secondFactorAt: integer("second_factor_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [index("session_user_id").on(t.userId)],
);

/** Better Auth: linked accounts (OAuth providers). */
export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id").on(t.userId)],
);

/** Better Auth: verification values (OAuth state and the like). */
export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier").on(t.identifier)],
);

/** Notes: the sharing boundary. `page_count` is maintained by triggers (no COUNT(*) scans). */
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  pageCount: integer("page_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Note members other than the owner. */
export const noteMembers = sqliteTable(
  "note_members",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.userId] }), index("note_members_user").on(t.userId)],
);

/**
 * Pages. `seq` is the INTEGER PRIMARY KEY (a stable rowid) that the external-content FTS5
 * index references; a plain rowid on a TEXT-keyed table may change on VACUUM.
 * ページ。FTS5 が参照する安定した rowid として `seq` を INTEGER PRIMARY KEY にする。
 */
export const pages = sqliteTable(
  "pages",
  {
    seq: integer("seq").primaryKey(),
    id: text("id").notNull().unique(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    preview: text("preview").notNull().default(""),
    contentText: text("content_text").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("pages_note_recent").on(t.noteId, sql`${t.updatedAt} DESC`, sql`${t.id} DESC`)],
);

/**
 * One authenticator app per user. `secret` is encrypted; `confirmedAt` stays null until the
 * user enters a first code, and `lastUsedStep` stops a code from being used twice.
 * 利用者ごとの認証アプリ。秘密鍵は暗号化して保存し、使ったステップを覚えて同じコードを拒む。
 */
export const totpFactors = sqliteTable("totp_factors", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  lastUsedStep: integer("last_used_step"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Recovery codes as SHA-256 hashes; each can be used once. */
export const recoveryCodes = sqliteTable(
  "recovery_codes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.codeHash] })],
);

/** Attempts at the second step per user within the current window (brute-force limit). */
export const secondFactorAttempts = sqliteTable("second_factor_attempts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull(),
  windowStartedAt: integer("window_started_at", { mode: "timestamp_ms" }).notNull(),
});
