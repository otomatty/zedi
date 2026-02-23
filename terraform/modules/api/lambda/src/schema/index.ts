/**
 * Drizzle ORM Schema: 全テーブル + リレーションの re-export
 *
 * 使い方:
 *   import * as schema from '../schema';
 *   const db = drizzle(client, { schema });
 */

// ── テーブル定義 ─────────────────────────────────────────────────────────────
export { users, type User, type NewUser } from "./users";
export { pages, type Page, type NewPage } from "./pages";
export {
  notes,
  notePages,
  noteMembers,
  type Note,
  type NewNote,
  type NotePage,
  type NewNotePage,
  type NoteMember,
  type NewNoteMember,
} from "./notes";
export {
  links,
  ghostLinks,
  type Link,
  type NewLink,
  type GhostLink,
  type NewGhostLink,
} from "./links";
export { pageContents, type PageContent, type NewPageContent } from "./pageContents";
export { media, type Media, type NewMedia } from "./media";
export { subscriptions, type Subscription, type NewSubscription } from "./subscriptions";
export {
  aiModels,
  aiUsageLogs,
  aiMonthlyUsage,
  aiTierBudgets,
  type AiModel,
  type NewAiModel,
  type AiUsageLog,
  type NewAiUsageLog,
  type AiMonthlyUsage,
  type NewAiMonthlyUsage,
  type AiTierBudget,
  type NewAiTierBudget,
} from "./aiModels";
export {
  thumbnailTierQuotas,
  thumbnailObjects,
  type ThumbnailTierQuota,
  type NewThumbnailTierQuota,
  type ThumbnailObject,
  type NewThumbnailObject,
} from "./thumbnails";

// ── リレーション ─────────────────────────────────────────────────────────────
export {
  usersRelations,
  pagesRelations,
  notesRelations,
  notePagesRelations,
  noteMembersRelations,
  linksRelations,
  ghostLinksRelations,
  pageContentsRelations,
  mediaRelations,
  subscriptionsRelations,
  aiUsageLogsRelations,
  aiMonthlyUsageRelations,
} from "./relations";
