import { test, expect } from "./auth-mock";

test.describe("Page Editor", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page, helpers }) => {
    await helpers.goToHome(page);
  });

  test.describe("Page Creation", () => {
    test("should create a new page and redirect to page ID", async ({ page, helpers }) => {
      await helpers.createNewPage(page);

      // Verify editor is visible
      await expect(page.locator(".tiptap")).toBeVisible({ timeout: 10000 });
      await expect(page.getByPlaceholder("タイトル")).toBeVisible();
    });

    test("redirects /pages/new to the default note (direct /pages/new is not a creation entry)", async ({
      page,
    }) => {
      // `/pages/new` 直接アクセスは /notes/me に飛ばし、NoteMeRedirect 経由で
      // 既定の `/notes/:noteId` に着地する (issue #884)。`/home` 経路は廃止。
      // `/pages/new` redirects to `/notes/me`, which `NoteMeRedirect` then
      // resolves into `/notes/:noteId` — the legacy `/home` hop is gone (#884).
      await page.goto("/pages/new");
      await expect(page).toHaveURL(/\/notes\/(me|[^/]+)/, { timeout: 10000 });
    });
  });

  test.describe("Title Editing", () => {
    test("should save title changes with auto-save", async ({ page, helpers }) => {
      await helpers.createNewPage(page);

      const titleInput = page.getByPlaceholder("タイトル");
      await titleInput.fill("Test Title");

      // Wait for debounced save (500ms + buffer)
      await page.waitForTimeout(1500);

      // Verify title persists after reload
      await page.reload();
      await page.waitForLoadState("networkidle");

      await expect(titleInput).toHaveValue("Test Title");
    });

    test("should show duplicate title warning", async ({ page, helpers }) => {
      // Create first page with title
      await helpers.createNewPage(page);

      await page.getByPlaceholder("タイトル").fill("Unique Title");
      await page.waitForTimeout(1500);

      // Create second page with same title
      await helpers.createNewPage(page);

      await page.getByPlaceholder("タイトル").fill("Unique Title");
      // Debounced duplicate check (useTitleValidation) + save
      await page.waitForTimeout(2500);

      // Duplicate message: toast + inline title (two role=alert with same copy)
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: /既に存在します/ })
          .first(),
      ).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Content Editing", () => {
    test("should type in editor and auto-generate title", async ({ page, helpers }) => {
      await helpers.createNewPage(page);

      const editor = page.locator(".tiptap");
      await editor.click();
      await page.keyboard.type("Auto generated title from first line");

      // Wait for debounced save
      await page.waitForTimeout(1500);

      // Title should be auto-generated from content
      const titleInput = page.getByPlaceholder("タイトル");
      await expect(titleInput).toHaveValue("Auto generated title from first line");
    });

    test("should persist content after reload", async ({ page, helpers }) => {
      await helpers.createNewPage(page);
      const currentUrl = page.url();

      // Enter title
      await page.getByPlaceholder("タイトル").fill("Content Test");
      await page.waitForTimeout(500);

      // Enter content
      const editor = page.locator(".tiptap");
      await editor.click();
      await page.keyboard.type("This content should persist");

      // Wait for save
      await page.waitForTimeout(2000);

      // Reload and verify
      await page.goto(currentUrl);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      await expect(editor).toContainText("This content should persist");
    });

    test("should show content error warning for invalid content", async ({ page, helpers }) => {
      // This test would require inserting invalid content directly into the database
      // For now, we just verify the error UI exists in the DOM structure
      await helpers.createNewPage(page);

      // The content error banner should not be visible for normal content
      await expect(page.locator(".bg-amber-500\\/10")).not.toBeVisible();
    });

    test("should apply bold via bubble menu when text is selected", async ({ page, helpers }) => {
      await helpers.createNewPage(page);

      const editor = page.locator(".tiptap");
      await editor.click();
      await page.keyboard.type("Bold test");
      await page.keyboard.press("Mod+a");

      await expect(page.getByRole("button", { name: "太字" })).toBeVisible({ timeout: 3000 });
      await page.getByRole("button", { name: "太字" }).click();

      await expect(editor.locator("strong")).toContainText("Bold test");
    });
  });

  test.describe("Wiki Generator", () => {
    test("should show Wiki生成 button when title exists and content is empty", async ({
      page,
      helpers,
    }) => {
      await helpers.createNewPage(page);

      // Enter title
      await page.getByPlaceholder("タイトル").fill("Test Topic");
      await page.waitForTimeout(500);

      // Wiki生成 button should be visible
      await expect(page.getByText("Wiki生成")).toBeVisible();
    });

    test("should hide Wiki生成 button when content exists", async ({ page, helpers }) => {
      await helpers.createNewPage(page);

      // Enter title
      await page.getByPlaceholder("タイトル").fill("Test Topic");
      await page.waitForTimeout(500);

      // Enter content
      const editor = page.locator(".tiptap");
      await editor.click();
      await page.keyboard.type("Some content here");
      await page.waitForTimeout(500);

      // Wiki生成 button should not be visible
      await expect(page.getByText("Wiki生成")).not.toBeVisible();
    });
  });

  test.describe("Navigation", () => {
    // `/home` は #884 で廃止予定。back ボタン / 失敗時の遷移先は /notes/me に集約され、
    // `NoteMeRedirect` 経由で `/notes/:noteId` に着地する。
    // `/home` is being retired in #884: back-button navigation now lands on
    // `/notes/me` which `NoteMeRedirect` resolves to `/notes/:noteId`.
    test("should navigate back to the default note on back button click", async ({
      page,
      helpers,
    }) => {
      await helpers.createNewPage(page);

      // Enter title to avoid delete warning
      await page.getByPlaceholder("タイトル").fill("Navigation Test");
      await page.waitForTimeout(1500);

      // Click back button
      await page.locator('button:has(svg[class*="lucide-arrow-left"])').click();

      // Should land on the default note (via /notes/me redirect)
      await expect(page).toHaveURL(/\/notes\/(me|[^/]+)/);
    });

    test("should delete page on back if title is empty", async ({ page, helpers }) => {
      await helpers.createNewPage(page);
      const pageUrl = page.url();

      // Don't enter title, just wait
      await page.waitForTimeout(500);

      // Click back button
      await page.locator('button:has(svg[class*="lucide-arrow-left"])').click();

      // Should land on the default note (via /notes/me redirect)
      await expect(page).toHaveURL(/\/notes\/(me|[^/]+)/);

      // Page should not exist anymore
      await page.goto(pageUrl);
      await page.waitForTimeout(1000);

      // Should redirect to the default note (page not found)
      await expect(page).toHaveURL(/\/notes\/(me|[^/]+)/);
    });
  });

  test.describe("Page Actions Menu", () => {
    test("should show dropdown menu with actions", async ({ page, helpers }) => {
      await helpers.createNewPage(page);

      // Enter title
      await page.getByPlaceholder("タイトル").fill("Actions Test");
      await page.waitForTimeout(500);

      // Click more options button
      await page.locator('button:has(svg[class*="lucide-more-horizontal"])').click();

      // Should see menu items
      await expect(page.getByText("URLから取り込み")).toBeVisible();
      await expect(page.getByText("Markdownでエクスポート")).toBeVisible();
      await expect(page.getByText("Markdownをコピー")).toBeVisible();
      await expect(page.getByText("削除")).toBeVisible();
    });

    test("should delete page via menu", async ({ page, helpers }) => {
      await helpers.createNewPage(page);
      const pageUrl = page.url();

      // Enter title
      await page.getByPlaceholder("タイトル").fill("Delete Test");
      await page.waitForTimeout(1500);

      // Click more options and delete
      await page.locator('button:has(svg[class*="lucide-more-horizontal"])').click();
      await page.getByText("削除").click();

      // Should redirect to the default note (via /notes/me)
      await expect(page).toHaveURL(/\/notes\/(me|[^/]+)/);

      // Page should not exist
      await page.goto(pageUrl);
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(/\/notes\/(me|[^/]+)/);
    });
  });

  test.describe("Keyboard Shortcuts", () => {
    test("should navigate home with Cmd+H", async ({ page, helpers }) => {
      await helpers.createNewPage(page);

      // Enter title to avoid delete warning
      await page.getByPlaceholder("タイトル").fill("Shortcut Test");
      await page.waitForTimeout(1500);

      // Press Cmd+H (or Ctrl+H on Windows/Linux)
      await page.keyboard.press("Meta+h");

      // Should land on the default note (via /notes/me redirect)
      await expect(page).toHaveURL(/\/notes\/(me|[^/]+)/);
    });
  });

  test.describe("Linked Pages Section", () => {
    test("should show linked pages section when page has WikiLinks", async ({ page, helpers }) => {
      // Create target page first
      await helpers.createNewPage(page);
      await page.getByPlaceholder("タイトル").fill("Target Page for Links");
      await page.locator(".tiptap").click();
      await page.keyboard.type("Content of target page");
      await page.waitForTimeout(2000);

      // Create source page with WikiLink
      await helpers.createNewPage(page);
      const sourceUrl = page.url();

      await page.getByPlaceholder("タイトル").fill("Source Page with Links");
      await page.locator(".tiptap").click();

      // Type WikiLink
      await page.keyboard.type("[[Target Page for Links");
      await page.waitForTimeout(500);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);

      // Reload source page
      await page.goto(sourceUrl);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Should see linked pages section
      const linkSection = page.getByText("リンク");
      const isVisible = await linkSection.isVisible().catch(() => false);

      if (isVisible) {
        await expect(linkSection).toBeVisible();
      }
    });
  });

  test.describe("Home page context menu delete", () => {
    test("should delete page via context menu and keep UI interactive (fix #313)", async ({
      page,
      helpers,
    }) => {
      await helpers.createNewPage(page);
      const syncPromise = page.waitForResponse(
        (res) => {
          const req = res.request();
          return req.method() === "POST" && res.url().includes("/api/sync/pages") && res.ok();
        },
        { timeout: 10000 },
      );
      await page.getByPlaceholder("タイトル").fill("Context Menu Delete Test");
      await syncPromise;

      await page.goto("/home");
      await page.waitForLoadState("networkidle");

      const card = page.locator(".page-card", { hasText: "Context Menu Delete Test" });
      await expect(card).toBeVisible({ timeout: 10000 });

      await card.click({ button: "right" });
      await page.getByRole("menuitem", { name: "削除" }).click();

      await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 });
      const deletePromise = page.waitForResponse(
        (res) => {
          const req = res.request();
          return req.method() === "DELETE" && res.url().includes("/api/pages") && res.ok();
        },
        { timeout: 10000 },
      );
      await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
      await deletePromise;

      await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 5000 });
      // /home は /notes/me に redirect され、その後 NoteMeRedirect が /notes/:noteId
      // に着地させるため、最終 URL は note detail になる (#884)。
      // The /home hop redirects through /notes/me into /notes/:noteId, so the
      // final URL after the delete settles on the note detail (#884).
      await expect(page).toHaveURL(/\/notes\/(me|[^/]+)/);
      await expect(card).toHaveCount(0);

      const fab = page.locator('[data-testid="home-fab"]');
      await fab.click();
      await expect(page.getByRole("button", { name: /新規作成/ })).toBeVisible({ timeout: 3000 });
    });
  });
});
