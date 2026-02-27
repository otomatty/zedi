import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan", { enum: ["free", "pro"] })
      .notNull()
      .default("free"),
    status: text("status", { enum: ["active", "canceled", "past_due", "trialing"] })
      .notNull()
      .default("active"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    externalId: text("external_id"),
    externalCustomerId: text("external_customer_id"),
    billingInterval: text("billing_interval"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("subscriptions_user_id_key").on(table.userId),
    index("idx_subscriptions_user_id").on(table.userId),
    index("idx_subscriptions_external_id").on(table.externalId),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
