/**
 * Drizzle ORM Schema: media
 * Source: db/aurora/001_schema.sql — media テーブル
 */
import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { pages } from './pages';

export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    s3Key: text('s3_key').notNull(),
    fileName: text('file_name'),
    contentType: text('content_type'),
    fileSize: bigint('file_size', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_media_owner_id').on(table.ownerId),
    index('idx_media_page_id').on(table.pageId),
  ],
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
