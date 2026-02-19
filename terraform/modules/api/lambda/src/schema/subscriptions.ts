/**
 * Drizzle ORM Schema: subscriptions
 * Source: db/aurora/002_ai_platform.sql + 004_plan_rename.sql — subscriptions テーブル
 *
 * plan: 'paid' → 'pro' (004_plan_rename.sql)
 * billing_interval: 004_plan_rename.sql で追加
 */
import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: text('plan', { enum: ['free', 'pro'] }).notNull().default('free'),
    status: text('status', { enum: ['active', 'canceled', 'past_due', 'trialing'] })
      .notNull()
      .default('active'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    externalId: text('external_id'),
    externalCustomerId: text('external_customer_id'),
    billingInterval: text('billing_interval'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('subscriptions_user_id_key').on(table.userId),
    index('idx_subscriptions_user_id').on(table.userId),
    index('idx_subscriptions_external_id').on(table.externalId),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
