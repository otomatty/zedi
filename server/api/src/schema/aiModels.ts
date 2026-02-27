import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const aiModels = pgTable(
  "ai_models",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    displayName: text("display_name").notNull(),
    tierRequired: text("tier_required", { enum: ["free", "pro"] })
      .notNull()
      .default("free"),
    inputCostUnits: integer("input_cost_units").notNull(),
    outputCostUnits: integer("output_cost_units").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_models_provider").on(table.provider),
    index("idx_ai_models_active")
      .on(table.isActive)
      .where(sql`${table.isActive}`),
  ],
);

export type AiModel = typeof aiModels.$inferSelect;
export type NewAiModel = typeof aiModels.$inferInsert;

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => aiModels.id),
    feature: text("feature").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUnits: integer("cost_units").notNull(),
    apiMode: text("api_mode", { enum: ["system", "user_key"] })
      .notNull()
      .default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_usage_logs_user_month").on(table.userId, table.createdAt),
    index("idx_ai_usage_logs_model").on(table.modelId),
  ],
);

export type AiUsageLog = typeof aiUsageLogs.$inferSelect;
export type NewAiUsageLog = typeof aiUsageLogs.$inferInsert;

export const aiMonthlyUsage = pgTable(
  "ai_monthly_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    totalCostUnits: bigint("total_cost_units", { mode: "number" }).notNull().default(0),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.yearMonth] })],
);

export type AiMonthlyUsage = typeof aiMonthlyUsage.$inferSelect;
export type NewAiMonthlyUsage = typeof aiMonthlyUsage.$inferInsert;

export const aiTierBudgets = pgTable("ai_tier_budgets", {
  tier: text("tier").primaryKey(),
  monthlyBudgetUnits: integer("monthly_budget_units").notNull(),
  description: text("description"),
});

export type AiTierBudget = typeof aiTierBudgets.$inferSelect;
export type NewAiTierBudget = typeof aiTierBudgets.$inferInsert;
