/**
 * Drizzle ORM Schema: links, ghost_links
 * Source: db/aurora/001_schema.sql — links, ghost_links テーブル
 */
import { pgTable, uuid, text, timestamp, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pages } from './pages';
import { notes } from './notes';

// ── links ────────────────────────────────────────────────────────────────────
export const links = pgTable(
  'links',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.targetId] }),
    index('idx_links_source_id').on(table.sourceId),
    index('idx_links_target_id').on(table.targetId),
    check('links_no_self_ref', sql`${table.sourceId} != ${table.targetId}`),
  ],
);

export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;

// ── ghost_links ──────────────────────────────────────────────────────────────
export const ghostLinks = pgTable(
  'ghost_links',
  {
    linkText: text('link_text').notNull(),
    sourcePageId: uuid('source_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    originalTargetPageId: uuid('original_target_page_id').references(() => pages.id, {
      onDelete: 'set null',
    }),
    originalNoteId: uuid('original_note_id').references(() => notes.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    primaryKey({ columns: [table.linkText, table.sourcePageId] }),
    index('idx_ghost_links_link_text').on(table.linkText),
    index('idx_ghost_links_source_page_id').on(table.sourcePageId),
  ],
);

export type GhostLink = typeof ghostLinks.$inferSelect;
export type NewGhostLink = typeof ghostLinks.$inferInsert;
