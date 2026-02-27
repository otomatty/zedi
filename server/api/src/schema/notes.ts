import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { pages } from "./pages.js";

export const notes = pgTable(
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

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

export const notePages = pgTable(
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

export type NotePage = typeof notePages.$inferSelect;
export type NewNotePage = typeof notePages.$inferInsert;

export const noteMembers = pgTable(
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

export type NoteMember = typeof noteMembers.$inferSelect;
export type NewNoteMember = typeof noteMembers.$inferInsert;
