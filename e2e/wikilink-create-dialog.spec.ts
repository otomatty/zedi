import type { Page } from "@playwright/test";
import { test, expect } from "./auth-mock";

const GHOST_TITLE = "生産手段";
const E2E_USER_ID = "e2e_test_user_123";
const COMPLETED_ONBOARDING_STATE = {
  hasCompletedSetupWizard: true,
  hasCompletedTour: false,
  completedSteps: [],
  dismissedHints: [],
};

async function seedBlankPage(page: Page, title: string) {
  const pageId = crypto.randomUUID();
  const now = Date.now();

  await page.evaluate(
    async ({ userId, pageId, title, now }) => {
      const request = indexedDB.open(`zedi-storage-${userId}`, 1);

      await new Promise<void>((resolve, reject) => {
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("my_pages")) {
            const pages = db.createObjectStore("my_pages", { keyPath: "id" });
            pages.createIndex("updated_at", "updatedAt", { unique: false });
            pages.createIndex("created_at", "createdAt", { unique: false });
          }
          if (!db.objectStoreNames.contains("my_links")) {
            const links = db.createObjectStore("my_links", { keyPath: ["sourceId", "targetId"] });
            links.createIndex("by_source", "sourceId", { unique: false });
            links.createIndex("by_target", "targetId", { unique: false });
          }
          if (!db.objectStoreNames.contains("my_ghost_links")) {
            const ghost = db.createObjectStore("my_ghost_links", {
              keyPath: ["linkText", "sourcePageId"],
            });
            ghost.createIndex("by_source", "sourcePageId", { unique: false });
          }
          if (!db.objectStoreNames.contains("search_index")) {
            db.createObjectStore("search_index", { keyPath: "pageId" });
          }
          if (!db.objectStoreNames.contains("meta")) {
            db.createObjectStore("meta", { keyPath: "key" });
          }
          if (!db.objectStoreNames.contains("ydoc_versions")) {
            db.createObjectStore("ydoc_versions", { keyPath: "pageId" });
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });

      const db = request.result;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["my_pages", "search_index", "ydoc_versions"], "readwrite");
        tx.objectStore("my_pages").put({
          id: pageId,
          ownerId: userId,
          sourcePageId: null,
          title,
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        });
        tx.objectStore("search_index").put({ pageId, text: "" });
        tx.objectStore("ydoc_versions").put({ pageId, version: 1 });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });

      db.close();
    },
    { userId: E2E_USER_ID, pageId, title, now },
  );

  return pageId;
}

async function createPageWithGhostWikiLink(page: Page, sourceTitle: string) {
  const pageId = await seedBlankPage(page, sourceTitle);
  await page.goto(`/page/${pageId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("textbox", { name: "タイトル" })).toHaveValue(sourceTitle);

  const sourceUrl = page.url();

  await page.getByRole("textbox", { name: "タイトル" }).fill(sourceTitle);
  await page.waitForTimeout(500);

  const editor = page.locator(".tiptap");
  await editor.click();
  await page.keyboard.type(`[[${GHOST_TITLE}`);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");

  await expect(editor.locator(`[data-wiki-link][data-title="${GHOST_TITLE}"]`)).toBeVisible({
    timeout: 5000,
  });

  // Wait for autosave (PUT /api/pages/:id/content), then reload to test against persisted content.
  await page.waitForResponse(
    (res) =>
      res.url().includes("/api/pages/") &&
      res.url().includes("/content") &&
      res.request().method() === "PUT",
    { timeout: 10000 },
  );
  await page.goto(sourceUrl);
  await page.waitForLoadState("networkidle");

  return { sourceUrl };
}

test.describe("WikiLink create-page dialog", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page, helpers }) => {
    await page.addInitScript((state) => {
      localStorage.setItem("zedi-onboarding", JSON.stringify(state));
    }, COMPLETED_ONBOARDING_STATE);
    await helpers.goToHome(page);
  });

  test("shows create-page dialog and cancels without crashing", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    const { sourceUrl } = await createPageWithGhostWikiLink(page, "Ghost Link Cancel Test");

    const ghostLink = page.locator(`.tiptap [data-wiki-link][data-title="${GHOST_TITLE}"]`);
    await ghostLink.click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "ページを作成しますか？" })).toBeVisible();

    await page.getByRole("button", { name: "キャンセル" }).click();

    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await expect(page).toHaveURL(sourceUrl);
    await expect(page.locator(".tiptap")).toBeVisible();
    await expect(ghostLink).toBeVisible();

    expect(
      pageErrors.some((error) => error.message.includes("Maximum update depth exceeded")),
    ).toBeFalsy();
  });

  test("creates a page from an unconfigured wiki link", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    const { sourceUrl } = await createPageWithGhostWikiLink(page, "Ghost Link Create Test");

    await page.route("**/api/pages", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      let requestBody: {
        title?: string;
        content_preview?: string | null;
        source_page_id?: string | null;
        thumbnail_url?: string | null;
        source_url?: string | null;
      };
      try {
        requestBody = route.request().postDataJSON() ?? {};
      } catch {
        await route.fallback();
        return;
      }
      const now = new Date().toISOString();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: crypto.randomUUID(),
          owner_id: E2E_USER_ID,
          source_page_id: requestBody.source_page_id ?? null,
          title: requestBody.title ?? null,
          content_preview: requestBody.content_preview ?? null,
          thumbnail_url: requestBody.thumbnail_url ?? null,
          source_url: requestBody.source_url ?? null,
          created_at: now,
          updated_at: now,
          is_deleted: false,
        }),
      });
    });

    const ghostLink = page.locator(`.tiptap [data-wiki-link][data-title="${GHOST_TITLE}"]`);
    await ghostLink.click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "作成する" }).click();

    await expect(page).not.toHaveURL(sourceUrl, { timeout: 15000 });
    await expect(page.getByRole("textbox", { name: "タイトル" })).toHaveValue(GHOST_TITLE);
    await expect(page.locator(".tiptap")).toBeVisible();

    expect(
      pageErrors.some((error) => error.message.includes("Maximum update depth exceeded")),
    ).toBeFalsy();
  });
});
