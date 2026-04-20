import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  primaryKey,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { pages } from "./pages.js";

export /**
 *
 */
const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    visibility: text("visibility", { enum: ["private", "public", "unlisted", "restricted"] })
      .notNull()
      .default("private"),
    editPermission: text("edit_permission", {
      enum: ["owner_only", "members_editors", "any_logged_in"],
    })
      .notNull()
      .default("owner_only"),
    isOfficial: boolean("is_official").notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (table) => [
    index("idx_notes_owner_id").on(table.ownerId),
    index("idx_notes_visibility").on(table.visibility),
    index("idx_notes_edit_permission").on(table.editPermission),
    index("idx_notes_is_official").on(table.isOfficial),
  ],
);

/**
 *
 */
export type Note = typeof notes.$inferSelect;
/**
 *
 */
export type NewNote = typeof notes.$inferInsert;

export /**
 *
 */
const notePages = pgTable(
  "note_pages",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    addedByUserId: text("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.pageId] }),
    index("idx_note_pages_note_id").on(table.noteId),
    index("idx_note_pages_page_id").on(table.pageId),
  ],
);

/**
 *
 */
export type NotePage = typeof notePages.$inferSelect;
/**
 *
 */
export type NewNotePage = typeof notePages.$inferInsert;

export /**
 *
 */
const noteMembers = pgTable(
  "note_members",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    memberEmail: text("member_email").notNull(),
    role: text("role", { enum: ["viewer", "editor"] })
      .notNull()
      .default("viewer"),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted", "declined"] })
      .notNull()
      .default("pending"),
    acceptedUserId: text("accepted_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.memberEmail] }),
    index("idx_note_members_note_id").on(table.noteId),
    index("idx_note_members_email").on(table.memberEmail),
  ],
);

/**
 *
 */
export type NoteMember = typeof noteMembers.$inferSelect;
/**
 *
 */
export type NewNoteMember = typeof noteMembers.$inferInsert;

/**
 * 招待トークンテーブル
 * Invitation tokens table
 */
export const noteInvitations = pgTable(
  "note_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    memberEmail: text("member_email").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** 招待メールの言語 / Email locale used for this invitation */
    locale: text("locale", { enum: ["ja", "en"] })
      .notNull()
      .default("ja"),
    /** 直近のメール送信日時 / Timestamp of the most recent send */
    lastEmailSentAt: timestamp("last_email_sent_at", { withTimezone: true }),
    /** メール送信回数（初回 + 再送の合計） / Total number of sends (initial + resends) */
    emailSendCount: integer("email_send_count").notNull().default(0),
  },
  (table) => [
    unique().on(table.noteId, table.memberEmail),
    index("idx_note_invitations_token").on(table.token),
    index("idx_note_invitations_note_id").on(table.noteId),
  ],
);

/**
 *
 */
export type NoteInvitation = typeof noteInvitations.$inferSelect;
/**
 *
 */
export type NewNoteInvitation = typeof noteInvitations.$inferInsert;

/**
 * ノート共有リンクテーブル（Phase 3: viewer 限定）
 *
 * メール招待とは別経路の「リンクを踏めば参加できる」導線。受諾は必ず
 * `note_invite_link_redemptions` への INSERT を介することでオーバーカウントを
 * 防ぐ。`revokedAt` は soft-revoke で、監査用に履歴を残すために物理削除しない。
 *
 * Note invite link table (Phase 3: viewer only).
 *
 * A share-by-URL alternative to email invites. Redemptions always flow through
 * `note_invite_link_redemptions` so `usedCount` can't be over-counted on
 * concurrent redeems. `revokedAt` is a soft-revoke so the audit trail remains.
 */
export const noteInviteLinks = pgTable(
  "note_invite_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    /**
     * `crypto.getRandomValues(32 bytes)` の hex（長さ 64）。
     * `crypto.getRandomValues(32 bytes)` hex (64 chars).
     */
    token: text("token").notNull().unique(),
    /**
     * リンク経由で付与されるロール（Phase 3 は viewer 限定、editor は Phase 5）。
     * Role granted through this link (Phase 3 enforces viewer only; editor is Phase 5).
     */
    role: text("role", { enum: ["viewer", "editor"] })
      .notNull()
      .default("viewer"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    /** 有効期限（必須、無期限リンクは作れない） / Expiration (required; no forever links) */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** 利用上限。null は無制限 / Max redemptions; null means unlimited */
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    /** 取り消し時刻。null は有効 / Revoke time; null means still valid */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** サインインを必須とするか（Phase 3 では常に true の運用を想定） / Require sign-in before redeem */
    requireSignIn: boolean("require_sign_in").notNull().default(true),
    /** 棚卸し用ラベル（例: "Slack 共有用"） / Label for housekeeping */
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_note_invite_links_note_id").on(table.noteId),
    index("idx_note_invite_links_created_by").on(table.createdByUserId),
  ],
);

/**
 * Row type for `note_invite_links` SELECT results.
 */
export type NoteInviteLink = typeof noteInviteLinks.$inferSelect;
/**
 * Row type for `note_invite_links` INSERT values.
 */
export type NewNoteInviteLink = typeof noteInviteLinks.$inferInsert;

/**
 * ノート共有リンクの受諾履歴。`(linkId, redeemedByUserId)` のユニーク制約により
 * 同一ユーザーが同一リンクを複数回踏んでも `usedCount` が増えないようにする。
 *
 * Redemption log for note invite links. The composite unique constraint on
 * `(linkId, redeemedByUserId)` is what prevents double-counting when a user
 * opens the same link twice.
 */
export const noteInviteLinkRedemptions = pgTable(
  "note_invite_link_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => noteInviteLinks.id, { onDelete: "cascade" }),
    redeemedByUserId: text("redeemed_by_user_id")
      .notNull()
      .references(() => users.id),
    /** 受諾時点のメールアドレス（監査用） / Email at the time of redemption */
    redeemedEmail: text("redeemed_email").notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_note_invite_link_redemptions_link_user").on(table.linkId, table.redeemedByUserId),
    index("idx_note_invite_link_redemptions_link").on(table.linkId),
  ],
);

/**
 * Row type for `note_invite_link_redemptions` SELECT results.
 */
export type NoteInviteLinkRedemption = typeof noteInviteLinkRedemptions.$inferSelect;
/**
 * Row type for `note_invite_link_redemptions` INSERT values.
 */
export type NewNoteInviteLinkRedemption = typeof noteInviteLinkRedemptions.$inferInsert;

/**
 * ノートのドメイン招待テーブル（Phase 6: #663）。
 *
 * 「`@example.com` でサインインした人は自動で viewer/editor」のような
 * ドメイン単位のアクセス権ルール。`note_members` を作らない（"在籍" ではなく
 * "ルール" として扱う）ので `GET /notes/:noteId/members` には現れない。
 *
 * Domain-scoped access rules for a note (Phase 6 — issue #663).
 *
 * A rule like "anyone signed-in with `@example.com` becomes a viewer/editor".
 * These rules intentionally do NOT create `note_members` rows — membership
 * listings stay explicit, and domain removal can immediately cut access.
 *
 * - `domain`: 小文字・`@` 無し / lower-cased domain without leading `@`.
 * - `verifiedAt`: v1 は未使用、v2 で DNS TXT による所有権検証を入れる余地。
 *   Unused in v1; reserved for v2 DNS-TXT ownership verification.
 */
export const noteDomainAccess = pgTable(
  "note_domain_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    /** 小文字化・`@` 無しのドメイン / Lower-cased domain without leading `@`. */
    domain: text("domain").notNull(),
    role: text("role", { enum: ["viewer", "editor"] })
      .notNull()
      .default("viewer"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    /** DNS TXT などで所有権を検証した時刻。v1 では null のまま保存可。 / Time we verified ownership (DNS-TXT etc.). Stays null in v1. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (table) => [
    unique("uq_note_domain_access_note_domain").on(table.noteId, table.domain),
    index("idx_note_domain_access_note_id").on(table.noteId),
    index("idx_note_domain_access_domain").on(table.domain),
  ],
);

/**
 * Row type for `note_domain_access` SELECT results.
 */
export type NoteDomainAccess = typeof noteDomainAccess.$inferSelect;
/**
 * Row type for `note_domain_access` INSERT values.
 */
export type NewNoteDomainAccess = typeof noteDomainAccess.$inferInsert;
