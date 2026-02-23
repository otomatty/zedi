/**
 * Drizzle スキーマ整合性テスト
 *
 * 各テーブルのカラム定義が既存 SQL DDL と一致していることを検証する。
 * 型推論の正しさはコンパイル時に検証される。
 */
import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import {
  users,
  pages,
  notes,
  notePages,
  noteMembers,
  links,
  ghostLinks,
  pageContents,
  media,
  subscriptions,
  aiModels,
  aiUsageLogs,
  aiMonthlyUsage,
  aiTierBudgets,
} from "..";
import { thumbnailTierQuotas, thumbnailObjects } from "../thumbnails";
import type {
  User,
  Page,
  Note,
  NotePage,
  NoteMember,
  Link,
  GhostLink,
  PageContent,
  Media,
  Subscription,
  AiModel,
  AiUsageLog,
  AiMonthlyUsage,
  AiTierBudget,
  ThumbnailTierQuota,
  ThumbnailObject,
} from "..";

/** ヘルパー: テーブルの DB カラム名一覧 */
function getColumnNames(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table)).map((c) => c.name);
}

describe("Drizzle Schema — テーブル名", () => {
  it.each([
    [users, "users"],
    [pages, "pages"],
    [notes, "notes"],
    [notePages, "note_pages"],
    [noteMembers, "note_members"],
    [links, "links"],
    [ghostLinks, "ghost_links"],
    [pageContents, "page_contents"],
    [media, "media"],
    [subscriptions, "subscriptions"],
    [aiModels, "ai_models"],
    [aiUsageLogs, "ai_usage_logs"],
    [aiMonthlyUsage, "ai_monthly_usage"],
    [aiTierBudgets, "ai_tier_budgets"],
    [thumbnailTierQuotas, "thumbnail_tier_quotas"],
    [thumbnailObjects, "thumbnail_objects"],
  ] as const)("%s → %s", (table, expected) => {
    expect(getTableName(table)).toBe(expected);
  });
});

describe("Drizzle Schema — users", () => {
  it("001_schema.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(users);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "cognito_sub",
        "email",
        "display_name",
        "avatar_url",
        "created_at",
        "updated_at",
      ]),
    );
    expect(cols).toHaveLength(7);
  });
});

describe("Drizzle Schema — pages", () => {
  it("001_schema.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(pages);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "owner_id",
        "source_page_id",
        "title",
        "content_preview",
        "thumbnail_url",
        "source_url",
        "created_at",
        "updated_at",
        "is_deleted",
      ]),
    );
    expect(cols).toHaveLength(10);
  });
});

describe("Drizzle Schema — notes", () => {
  it("001 + 006 + 007 の全カラムを持つ", () => {
    const cols = getColumnNames(notes);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "owner_id",
        "title",
        "visibility",
        "edit_permission",
        "is_official",
        "view_count",
        "created_at",
        "updated_at",
        "is_deleted",
      ]),
    );
    expect(cols).toHaveLength(10);
  });
});

describe("Drizzle Schema — note_pages", () => {
  it("001_schema.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(notePages);
    expect(cols).toEqual(
      expect.arrayContaining([
        "note_id",
        "page_id",
        "added_by_user_id",
        "sort_order",
        "created_at",
        "updated_at",
        "is_deleted",
      ]),
    );
    expect(cols).toHaveLength(7);
  });
});

describe("Drizzle Schema — note_members", () => {
  it("001_schema.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(noteMembers);
    expect(cols).toEqual(
      expect.arrayContaining([
        "note_id",
        "member_email",
        "role",
        "invited_by_user_id",
        "created_at",
        "updated_at",
        "is_deleted",
      ]),
    );
    expect(cols).toHaveLength(7);
  });
});

describe("Drizzle Schema — links", () => {
  it("001_schema.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(links);
    expect(cols).toEqual(expect.arrayContaining(["source_id", "target_id", "created_at"]));
    expect(cols).toHaveLength(3);
  });
});

describe("Drizzle Schema — ghost_links", () => {
  it("001_schema.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(ghostLinks);
    expect(cols).toEqual(
      expect.arrayContaining([
        "link_text",
        "source_page_id",
        "created_at",
        "original_target_page_id",
        "original_note_id",
      ]),
    );
    expect(cols).toHaveLength(5);
  });
});

describe("Drizzle Schema — page_contents", () => {
  it("001_schema.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(pageContents);
    expect(cols).toEqual(
      expect.arrayContaining(["page_id", "ydoc_state", "version", "content_text", "updated_at"]),
    );
    expect(cols).toHaveLength(5);
  });
});

describe("Drizzle Schema — media", () => {
  it("001_schema.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(media);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "owner_id",
        "page_id",
        "s3_key",
        "file_name",
        "content_type",
        "file_size",
        "created_at",
      ]),
    );
    expect(cols).toHaveLength(8);
  });
});

describe("Drizzle Schema — subscriptions", () => {
  it("002 + 004 の全カラムを持つ (plan: free/pro)", () => {
    const cols = getColumnNames(subscriptions);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "plan",
        "status",
        "current_period_start",
        "current_period_end",
        "external_id",
        "external_customer_id",
        "billing_interval",
        "created_at",
        "updated_at",
      ]),
    );
    expect(cols).toHaveLength(11);
  });
});

describe("Drizzle Schema — ai_models", () => {
  it("002 + 004 の全カラムを持つ (tier_required: free/pro)", () => {
    const cols = getColumnNames(aiModels);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "provider",
        "model_id",
        "display_name",
        "tier_required",
        "input_cost_units",
        "output_cost_units",
        "is_active",
        "sort_order",
        "created_at",
      ]),
    );
    expect(cols).toHaveLength(10);
  });
});

describe("Drizzle Schema — ai_usage_logs", () => {
  it("002_ai_platform.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(aiUsageLogs);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "model_id",
        "feature",
        "input_tokens",
        "output_tokens",
        "cost_units",
        "api_mode",
        "created_at",
      ]),
    );
    expect(cols).toHaveLength(9);
  });
});

describe("Drizzle Schema — ai_monthly_usage", () => {
  it("002_ai_platform.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(aiMonthlyUsage);
    expect(cols).toEqual(
      expect.arrayContaining([
        "user_id",
        "year_month",
        "total_cost_units",
        "request_count",
        "updated_at",
      ]),
    );
    expect(cols).toHaveLength(5);
  });
});

describe("Drizzle Schema — ai_tier_budgets", () => {
  it("002_ai_platform.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(aiTierBudgets);
    expect(cols).toEqual(expect.arrayContaining(["tier", "monthly_budget_units", "description"]));
    expect(cols).toHaveLength(3);
  });
});

describe("Drizzle Schema — thumbnail_tier_quotas", () => {
  it("005_thumbnail_storage.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(thumbnailTierQuotas);
    expect(cols).toEqual(expect.arrayContaining(["tier", "storage_limit_bytes"]));
    expect(cols).toHaveLength(2);
  });
});

describe("Drizzle Schema — thumbnail_objects", () => {
  it("005_thumbnail_storage.sql と一致するカラムを持つ", () => {
    const cols = getColumnNames(thumbnailObjects);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "user_id", "s3_key", "size_bytes", "created_at"]),
    );
    expect(cols).toHaveLength(5);
  });
});

// ── 型推論テスト (コンパイル時検証) ──────────────────────────────────────────
// TypeScript コンパイルが通ること自体が型推論の検証。
// 以下はコンパイル時に型が正しく推論されることを確認するための代入テスト。
describe("Drizzle Schema — 型推論 (コンパイル時検証)", () => {
  it("User 型のプロパティが正しい型を持つ", () => {
    // コンパイル時にエラーがなければ型推論は正しい
    const _user: User = {
      id: "test-uuid",
      cognitoSub: "sub-123",
      email: "test@example.com",
      displayName: null,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(_user.id).toBe("test-uuid");
  });

  it("Page 型のプロパティが正しい型を持つ", () => {
    const _page: Page = {
      id: "page-uuid",
      ownerId: "owner-uuid",
      sourcePageId: null,
      title: null,
      contentPreview: null,
      thumbnailUrl: null,
      sourceUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    expect(_page.isDeleted).toBe(false);
  });

  it("Note 型のプロパティが正しい型を持つ (006, 007 カラム含む)", () => {
    const _note: Note = {
      id: "note-uuid",
      ownerId: "owner-uuid",
      title: null,
      visibility: "private",
      editPermission: "owner_only",
      isOfficial: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    expect(_note.isOfficial).toBe(false);
    expect(_note.viewCount).toBe(0);
  });

  it("Subscription 型のプロパティが正しい型を持つ (plan: free/pro)", () => {
    const _sub: Subscription = {
      id: "sub-uuid",
      userId: "user-uuid",
      plan: "free",
      status: "active",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      externalId: null,
      externalCustomerId: null,
      billingInterval: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(_sub.plan).toBe("free");
  });
});
