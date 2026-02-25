/**
 * Drizzle ORM Schema: テーブル間リレーション定義
 * Drizzle の relations() API でクエリビルダ用のリレーションを宣言する
 */
import { relations } from "drizzle-orm";
import { users } from "./users";
import { pages } from "./pages";
import { notes, notePages, noteMembers } from "./notes";
import { links, ghostLinks } from "./links";
import { pageContents } from "./pageContents";
import { media } from "./media";
import { subscriptions } from "./subscriptions";
import { aiUsageLogs, aiMonthlyUsage } from "./aiModels";

// ── users ────────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  pages: many(pages),
  notes: many(notes),
  media: many(media),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  aiUsageLogs: many(aiUsageLogs),
  aiMonthlyUsage: many(aiMonthlyUsage),
}));

// ── pages ────────────────────────────────────────────────────────────────────
export const pagesRelations = relations(pages, ({ one, many }) => ({
  owner: one(users, {
    fields: [pages.ownerId],
    references: [users.id],
  }),
  sourcePage: one(pages, {
    fields: [pages.sourcePageId],
    references: [pages.id],
    relationName: "sourcePageRef",
  }),
  content: one(pageContents, {
    fields: [pages.id],
    references: [pageContents.pageId],
  }),
  notePages: many(notePages),
  media: many(media),
  outgoingLinks: many(links, { relationName: "sourceLinks" }),
  incomingLinks: many(links, { relationName: "targetLinks" }),
  ghostLinksFrom: many(ghostLinks, { relationName: "ghostLinkSource" }),
}));

// ── notes ────────────────────────────────────────────────────────────────────
export const notesRelations = relations(notes, ({ one, many }) => ({
  owner: one(users, {
    fields: [notes.ownerId],
    references: [users.id],
  }),
  notePages: many(notePages),
  noteMembers: many(noteMembers),
}));

// ── note_pages ───────────────────────────────────────────────────────────────
export const notePagesRelations = relations(notePages, ({ one }) => ({
  note: one(notes, {
    fields: [notePages.noteId],
    references: [notes.id],
  }),
  page: one(pages, {
    fields: [notePages.pageId],
    references: [pages.id],
  }),
  addedBy: one(users, {
    fields: [notePages.addedByUserId],
    references: [users.id],
  }),
}));

// ── note_members ─────────────────────────────────────────────────────────────
export const noteMembersRelations = relations(noteMembers, ({ one }) => ({
  note: one(notes, {
    fields: [noteMembers.noteId],
    references: [notes.id],
  }),
  invitedBy: one(users, {
    fields: [noteMembers.invitedByUserId],
    references: [users.id],
  }),
}));

// ── links ────────────────────────────────────────────────────────────────────
export const linksRelations = relations(links, ({ one }) => ({
  source: one(pages, {
    fields: [links.sourceId],
    references: [pages.id],
    relationName: "sourceLinks",
  }),
  target: one(pages, {
    fields: [links.targetId],
    references: [pages.id],
    relationName: "targetLinks",
  }),
}));

// ── ghost_links ──────────────────────────────────────────────────────────────
export const ghostLinksRelations = relations(ghostLinks, ({ one }) => ({
  sourcePage: one(pages, {
    fields: [ghostLinks.sourcePageId],
    references: [pages.id],
    relationName: "ghostLinkSource",
  }),
  originalTargetPage: one(pages, {
    fields: [ghostLinks.originalTargetPageId],
    references: [pages.id],
    relationName: "ghostLinkOriginalTarget",
  }),
  originalNote: one(notes, {
    fields: [ghostLinks.originalNoteId],
    references: [notes.id],
  }),
}));

// ── page_contents ────────────────────────────────────────────────────────────
export const pageContentsRelations = relations(pageContents, ({ one }) => ({
  page: one(pages, {
    fields: [pageContents.pageId],
    references: [pages.id],
  }),
}));

// ── media ────────────────────────────────────────────────────────────────────
export const mediaRelations = relations(media, ({ one }) => ({
  owner: one(users, {
    fields: [media.ownerId],
    references: [users.id],
  }),
  page: one(pages, {
    fields: [media.pageId],
    references: [pages.id],
  }),
}));

// ── subscriptions ────────────────────────────────────────────────────────────
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

// ── ai_usage_logs ────────────────────────────────────────────────────────────
export const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  user: one(users, {
    fields: [aiUsageLogs.userId],
    references: [users.id],
  }),
}));

// ── ai_monthly_usage ─────────────────────────────────────────────────────────
export const aiMonthlyUsageRelations = relations(aiMonthlyUsage, ({ one }) => ({
  user: one(users, {
    fields: [aiMonthlyUsage.userId],
    references: [users.id],
  }),
}));
