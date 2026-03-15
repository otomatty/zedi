/**
 * E2E: Web Clipper clipUrl flow (Chrome extension integration).
 * clipUrl 付き起動 → WebClipperDialog 自動 open → URL プリフィル確認
 */
import { test, expect } from "./auth-mock";

test.describe("Web Clipper clipUrl flow", () => {
  test.setTimeout(60000);

  test("should auto-open Web Clipper dialog with clipUrl prefilled", async ({
    page,
    helpers: _helpers,
  }) => {
    const clipUrl = "https://example.com/article";
    await page.goto(
      `/home?${new URLSearchParams({ clipUrl, from: "chrome-extension" }).toString()}`,
    );
    await page.waitForLoadState("networkidle");

    // With mock auth (VITE_E2E_TEST), user is signed in; dialog should auto-open
    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // URL input should be prefilled
    const urlInput = page.getByPlaceholder(/URL.*入力|Enter URL/i);
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue(clipUrl);
  });

  test("should not open dialog for invalid clipUrl", async ({ page }) => {
    const invalidUrl = "chrome://extensions";
    await page.goto(`/home?${new URLSearchParams({ clipUrl: invalidUrl }).toString()}`);
    await page.waitForLoadState("networkidle");

    // Dialog should not auto-open for invalid URL
    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).not.toBeVisible();
  });

  test("should open Web Clipper with clipUrl prefilled when from param is omitted", async ({
    page,
    helpers: _helpers,
  }) => {
    const clipUrl = "https://example.com/page";
    await page.goto(`/home?${new URLSearchParams({ clipUrl }).toString()}`);
    await page.waitForLoadState("networkidle");

    // With mock auth, user is signed in; dialog should open even without from=chrome-extension
    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const urlInput = page.getByPlaceholder(/URL.*入力|Enter URL/i);
    await expect(urlInput).toHaveValue(clipUrl);
  });
});
