/**
 * Drizzle ORM Schema: thumbnail_tier_quotas, thumbnail_objects
 * Source: db/aurora/005_thumbnail_storage.sql
 */
import { pgTable, uuid, text, bigint, timestamp, index, varchar } from "drizzle-orm/pg-core";

// ── thumbnail_tier_quotas ────────────────────────────────────────────────────
export const thumbnailTierQuotas = pgTable("thumbnail_tier_quotas", {
  tier: varchar("tier", { length: 32 }).primaryKey(),
  storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }).notNull(),
});

export type ThumbnailTierQuota = typeof thumbnailTierQuotas.$inferSelect;
export type NewThumbnailTierQuota = typeof thumbnailTierQuotas.$inferInsert;

// ── thumbnail_objects ────────────────────────────────────────────────────────
export const thumbnailObjects = pgTable(
  "thumbnail_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    s3Key: varchar("s3_key", { length: 512 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_thumbnail_objects_user_id").on(table.userId)],
);

export type ThumbnailObject = typeof thumbnailObjects.$inferSelect;
export type NewThumbnailObject = typeof thumbnailObjects.$inferInsert;
