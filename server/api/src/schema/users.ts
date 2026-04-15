import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

/** User role for access control. 'admin' can access /api/admin/* and admin UI. */
export type UserRole = "user" | "admin";

/** User account status. 'suspended' blocks all API access. */
export type UserStatus = "active" | "suspended" | "deleted";

/**
 * Better Auth user table with Zedi-specific role and status columns.
 * Zedi 固有のロール・ステータス列を含む Better Auth のユーザーテーブル。
 */
export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    /** Role: 'user' (default) or 'admin'. Admins can use admin.zedi-note.app and /api/admin/*. */
    role: text("role", { enum: ["user", "admin"] })
      .notNull()
      .default("user"),
    /** Account status: 'active' (default), 'suspended', or 'deleted'. */
    status: text("status", { enum: ["active", "suspended", "deleted"] })
      .notNull()
      .default("active"),
    /** Timestamp when the user was suspended. Null if not suspended. */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    /** Reason for suspension provided by the admin. */
    suspendedReason: text("suspended_reason"),
    /**
     * Admin user ID who performed the suspension.
     * FK constraint is defined in migration 0005_add_user_status.sql.
     */
    suspendedBy: text("suspended_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_user_email").on(table.email), index("idx_user_status").on(table.status)],
);

/**
 * User row type inferred from the `user` table.
 * `user` テーブルから推論した行型。
 */
export type User = typeof users.$inferSelect;
/**
 * Insert payload type inferred from the `user` table.
 * `user` テーブルから推論した挿入型。
 */
export type NewUser = typeof users.$inferInsert;

/**
 * Better Auth session table.
 * Better Auth のセッションテーブル。
 */
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Better Auth account table for linked OAuth identities.
 * OAuth 連携アカウントを保持する Better Auth の account テーブル。
 */
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Better Auth verification table for one-time verification values.
 * ワンタイム検証値を保持する Better Auth の verification テーブル。
 */
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
