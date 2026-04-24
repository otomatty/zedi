import { pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core";
// `text` imported above is reused for requested_locale.
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { pages } from "./pages.js";

/**
 * 新規ユーザーのオンボーディング状況を記録するテーブル。
 * - セットアップウィザード完了時刻
 * - ウェルカムページの自動生成状況
 * - ホーム画面スライドの表示状況（別 PR で使用）
 * - 更新情報ページ自動生成の許可フラグ（別 PR で使用）
 *
 * Tracks new-user onboarding progress per user. Includes the setup wizard
 * completion timestamp, welcome page creation status, a flag for the home
 * slide overlay (used in a follow-up PR), and the auto-update-notice opt-in
 * toggle (also follow-up PR).
 */
export const userOnboardingStatus = pgTable(
  "user_onboarding_status",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    welcomePageCreatedAt: timestamp("welcome_page_created_at", { withTimezone: true }),
    welcomePageId: uuid("welcome_page_id").references(() => pages.id, {
      onDelete: "set null",
    }),
    /**
     * セットアップウィザードで選択したロケール。ログイン時リトライが
     * ユーザーの意図した言語でウェルカムページを生成できるように残す。
     *
     * Locale selected at the setup wizard. Retained so the login-time retry
     * regenerates the welcome page in the user's originally chosen language.
     */
    requestedLocale: text("requested_locale").$type<"ja" | "en">(),
    homeSlidesShownAt: timestamp("home_slides_shown_at", { withTimezone: true }),
    autoCreateUpdateNotice: boolean("auto_create_update_notice").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // セットアップ完了済みだがウェルカムページ未生成のユーザー検索（リトライ用）。
    // Used by the login-time retry to find users who completed setup but
    // do not yet have a welcome page.
    index("idx_user_onboarding_status_needs_welcome")
      .on(table.setupCompletedAt)
      .where(sql`${table.setupCompletedAt} IS NOT NULL AND ${table.welcomePageCreatedAt} IS NULL`),
  ],
);

/** Select type for the user_onboarding_status table. */
export type UserOnboardingStatus = typeof userOnboardingStatus.$inferSelect;
/** Insert type for the user_onboarding_status table. */
export type NewUserOnboardingStatus = typeof userOnboardingStatus.$inferInsert;
