/**
 * Drizzle ORM Schema: pages
 * Source: db/aurora/001_schema.sql — pages テーブル
 */
import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourcePageId: uuid('source_page_id'),
    // self-reference is set in relations.ts
    title: text('title'),
    contentPreview: text('content_preview'),
    thumbnailUrl: text('thumbnail_url'),
    sourceUrl: text('source_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
  },
  (table) => [
    index('idx_pages_owner_id').on(table.ownerId),
    index('idx_pages_owner_updated').on(table.ownerId, table.updatedAt),
    index('idx_pages_source_page_id').on(table.sourcePageId),
    index('idx_pages_is_deleted')
      .on(table.ownerId)
      .where(sql`NOT ${table.isDeleted}`),
  ],
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
