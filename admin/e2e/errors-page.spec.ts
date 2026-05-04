/**
 * 管理画面 `/errors` の最小 E2E。`AdminGuard` と一覧 API を `page.route` で
 * モックし、ネットワーク到達不要で UI のレンダリングのみを検証する。
 *
 * Minimum E2E for the admin `/errors` page. Uses `page.route` to mock both the
 * `AdminGuard` auth probe and the list API so the test does not depend on a
 * running backend.
 *
 * @see https://github.com/otomatty/zedi/issues/804
 */
import { test, expect } from "@playwright/test";

const MOCK_ERROR = {
  id: "00000000-0000-0000-0000-000000000001",
  sentryIssueId: "sentry-1",
  fingerprint: null,
  title: "TypeError: cannot read properties of null",
  route: "GET /api/users/:id",
  statusCode: 500,
  occurrences: 7,
  firstSeenAt: "2026-05-01T00:00:00Z",
  lastSeenAt: "2026-05-04T00:00:00Z",
  severity: "high",
  status: "open",
  aiSummary: null,
  aiSuspectedFiles: null,
  aiRootCause: null,
  aiSuggestedFix: null,
  githubIssueNumber: null,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-04T00:00:00Z",
};

test.describe("Admin /errors page", () => {
  test.beforeEach(async ({ page }) => {
    // AdminGuard が呼ぶ `getAdminMe` を満たすモック。
    // Mock the admin auth probe so AdminGuard renders its children.
    await page.route("**/api/admin/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "admin-1", email: "admin@example.com", role: "admin" }),
      });
    });

    // 一覧 API：ステータス指定の有無に関わらずモック行を返す。
    // Errors list API: serve the same mock row regardless of filter params.
    await page.route("**/api/admin/errors**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          errors: [MOCK_ERROR],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      });
    });
  });

  test("renders the errors list with the mocked row", async ({ page }) => {
    await page.goto("/errors");

    // ページ見出しと、モック行のタイトル・ルートが描画されることを確認。
    // Verify the page heading and the mocked row's title/route are rendered.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(MOCK_ERROR.title)).toBeVisible();
    await expect(page.getByText(MOCK_ERROR.route)).toBeVisible();
  });
});
