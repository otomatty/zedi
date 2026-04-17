import { relations } from "drizzle-orm";
import { users, session, account } from "./users.js";
import { pages } from "./pages.js";
import { notes, notePages, noteMembers, noteInvitations } from "./notes.js";
import { links, ghostLinks } from "./links.js";
import { pageContents } from "./pageContents.js";
import { pageSnapshots } from "./pageSnapshots.js";
import { media } from "./media.js";
import { subscriptions } from "./subscriptions.js";
import { aiUsageLogs, aiMonthlyUsage } from "./aiModels.js";
import { sources } from "./sources.js";
import { pageSources } from "./pageSources.js";
import { lintFindings } from "./lintFindings.js";
import { activityLog } from "./activityLog.js";

export /**
 *
 */
const usersRelations = relations(users, ({ many, one }) => ({
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

export /**
 *
 */
const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, {
    fields: [session.userId],
    references: [users.id],
  }),
}));

export /**
 *
 */
const accountRelations = relations(account, ({ one }) => ({
  user: one(users, {
    fields: [account.userId],
    references: [users.id],
  }),
}));

export /**
 *
 */
const pagesRelations = relations(pages, ({ one, many }) => ({
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
  snapshots: many(pageSnapshots),
  media: many(media),
  outgoingLinks: many(links, { relationName: "sourceLinks" }),
  incomingLinks: many(links, { relationName: "targetLinks" }),
  ghostLinksFrom: many(ghostLinks, { relationName: "ghostLinkSource" }),
}));

export /**
 *
 */
const notesRelations = relations(notes, ({ one, many }) => ({
  owner: one(users, {
    fields: [notes.ownerId],
    references: [users.id],
  }),
  notePages: many(notePages),
  noteMembers: many(noteMembers),
  noteInvitations: many(noteInvitations),
}));

export /**
 *
 */
const notePagesRelations = relations(notePages, ({ one }) => ({
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

export /**
 *
 */
const noteMembersRelations = relations(noteMembers, ({ one }) => ({
  note: one(notes, {
    fields: [noteMembers.noteId],
    references: [notes.id],
  }),
  invitedBy: one(users, {
    fields: [noteMembers.invitedByUserId],
    references: [users.id],
    relationName: "invitedMember",
  }),
  acceptedUser: one(users, {
    fields: [noteMembers.acceptedUserId],
    references: [users.id],
    relationName: "acceptedMember",
  }),
}));

export /**
 *
 */
const noteInvitationsRelations = relations(noteInvitations, ({ one }) => ({
  note: one(notes, {
    fields: [noteInvitations.noteId],
    references: [notes.id],
  }),
}));

export /**
 *
 */
const linksRelations = relations(links, ({ one }) => ({
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

export /**
 *
 */
const ghostLinksRelations = relations(ghostLinks, ({ one }) => ({
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

export /**
 *
 */
const pageContentsRelations = relations(pageContents, ({ one }) => ({
  page: one(pages, {
    fields: [pageContents.pageId],
    references: [pages.id],
  }),
}));

export /**
 *
 */
const pageSnapshotsRelations = relations(pageSnapshots, ({ one }) => ({
  page: one(pages, {
    fields: [pageSnapshots.pageId],
    references: [pages.id],
  }),
}));

export /**
 *
 */
const mediaRelations = relations(media, ({ one }) => ({
  owner: one(users, {
    fields: [media.ownerId],
    references: [users.id],
  }),
  page: one(pages, {
    fields: [media.pageId],
    references: [pages.id],
  }),
}));

export /**
 *
 */
const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export /**
 *
 */
const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  user: one(users, {
    fields: [aiUsageLogs.userId],
    references: [users.id],
  }),
}));

export /**
 *
 */
const aiMonthlyUsageRelations = relations(aiMonthlyUsage, ({ one }) => ({
  user: one(users, {
    fields: [aiMonthlyUsage.userId],
    references: [users.id],
  }),
}));

/**
 * `sources` のリレーション定義。オーナー・ページ引用。
 * Relations for `sources`: owner and citations from pages.
 */
export const sourcesRelations = relations(sources, ({ one, many }) => ({
  owner: one(users, {
    fields: [sources.ownerId],
    references: [users.id],
  }),
  citations: many(pageSources),
}));

/**
 * `page_sources` のリレーション定義。ページとソースを両端に持つ。
 * Relations for `page_sources`: page and source endpoints.
 */
export const pageSourcesRelations = relations(pageSources, ({ one }) => ({
  page: one(pages, {
    fields: [pageSources.pageId],
    references: [pages.id],
  }),
  source: one(sources, {
    fields: [pageSources.sourceId],
    references: [sources.id],
  }),
}));

/**
 * `lint_findings` のリレーション定義。オーナーへの多対一。
 * Relations for `lint_findings`: many-to-one to owner.
 */
export const lintFindingsRelations = relations(lintFindings, ({ one }) => ({
  owner: one(users, {
    fields: [lintFindings.ownerId],
    references: [users.id],
  }),
}));

/**
 * `activity_log` のリレーション定義。オーナーへの多対一。
 * Relations for `activity_log`: many-to-one to owner.
 */
export const activityLogRelations = relations(activityLog, ({ one }) => ({
  owner: one(users, {
    fields: [activityLog.ownerId],
    references: [users.id],
  }),
}));
