import { relations } from "drizzle-orm";
import { users, session, account } from "./users.js";
import { pages } from "./pages.js";
import { notes, notePages, noteMembers } from "./notes.js";
import { links, ghostLinks } from "./links.js";
import { pageContents } from "./pageContents.js";
import { media } from "./media.js";
import { subscriptions } from "./subscriptions.js";
import { aiUsageLogs, aiMonthlyUsage } from "./aiModels.js";

export const usersRelations = relations(users, ({ many, one }) => ({
  pages: many(pages),
  notes: many(notes),
  media: many(media),
  sessions: many(session),
  accounts: many(account),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  aiUsageLogs: many(aiUsageLogs),
  aiMonthlyUsage: many(aiMonthlyUsage),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, {
    fields: [session.userId],
    references: [users.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(users, {
    fields: [account.userId],
    references: [users.id],
  }),
}));

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

export const notesRelations = relations(notes, ({ one, many }) => ({
  owner: one(users, {
    fields: [notes.ownerId],
    references: [users.id],
  }),
  notePages: many(notePages),
  noteMembers: many(noteMembers),
}));

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

export const pageContentsRelations = relations(pageContents, ({ one }) => ({
  page: one(pages, {
    fields: [pageContents.pageId],
    references: [pages.id],
  }),
}));

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

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  user: one(users, {
    fields: [aiUsageLogs.userId],
    references: [users.id],
  }),
}));

export const aiMonthlyUsageRelations = relations(aiMonthlyUsage, ({ one }) => ({
  user: one(users, {
    fields: [aiMonthlyUsage.userId],
    references: [users.id],
  }),
}));
