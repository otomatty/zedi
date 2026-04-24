/**
 * E2E Test Helpers with Custom Fixtures
 *
 * Authentication is handled by VITE_E2E_TEST environment variable
 * which causes the app to use MockAuthProvider.
 */
import { test as base, expect, Page } from "@playwright/test";
import { MOCK_USER_ID } from "../src/components/auth/MockAuthProvider";

/** Default onboarding so signed-in E2E users stay on /home (not redirected to /onboarding). */
const E2E_DEFAULT_ONBOARDING = {
  hasCompletedSetupWizard: true,
};

/** per-user cache key matching `src/lib/onboardingState.ts`. */
const E2E_ONBOARDING_CACHE_KEY = `zedi-onboarding-cache:${MOCK_USER_ID}`;

/**
 * Helper functions for E2E tests.
 */
const helpers = {
  /**
   * Navigate to the home page and wait for it to load.
   */
  async goToHome(page: Page): Promise<void> {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
  },

  /**
   * Create a new page and return its ID.
   * Uses the home FAB (「新規作成」): `/pages/new` is no longer a creation entry (editor redirects to /home).
   */
  async createNewPage(page: Page): Promise<string> {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // ホーム右下の FAB を開き、新規作成メニューを起動する。
    // Open the home FAB and pick the "新規作成" action to create a blank page.
    await page.locator('[data-testid="home-fab"]').click();
    await page.getByRole("button", { name: "新規作成" }).click();

    // `^/pages/<id>$` のみを許容し、`/notes/.../pages/<id>` のようなノート配下ルートに
    // 誤遷移した場合はリグレッションとして検知できるように pathname 完全一致で判定する。
    // Match only the top-level `/pages/:id` route; a regression that accidentally
    // creates a note-scoped page should fail this helper instead of silently passing.
    await page.waitForURL((url) => /^\/pages\/(?!new$)[^/]+$/.test(url.pathname), {
      timeout: 15000,
    });

    const { pathname } = new URL(page.url());
    const match = pathname.match(/^\/pages\/([^/]+)$/);
    if (!match) {
      throw new Error(`Failed to extract page ID from URL: ${page.url()}`);
    }

    return match[1];
  },

  /**
   * Wait for the editor to be ready.
   */
  async waitForEditor(page: Page): Promise<void> {
    await expect(page.locator(".tiptap")).toBeVisible({ timeout: 10000 });
  },

  /**
   * Type into the editor.
   */
  async typeInEditor(page: Page, text: string): Promise<void> {
    const editor = page.locator(".tiptap");
    await editor.click();
    await editor.pressSequentially(text, { delay: 50 });
  },

  /**
   * Get the editor content.
   */
  async getEditorContent(page: Page): Promise<string> {
    const editor = page.locator(".tiptap");
    return (await editor.textContent()) ?? "";
  },
};

/**
 * Custom test fixture with helpers.
 * Seeds onboarding so Home renders (FAB, grid) for mock signed-in users.
 */
export const test = base.extend<{ helpers: typeof helpers }>({
  page: async ({ page }, continueFixture) => {
    await page.addInitScript(
      ({ key, onboarding }) => {
        localStorage.setItem(key, JSON.stringify(onboarding));
      },
      { key: E2E_ONBOARDING_CACHE_KEY, onboarding: E2E_DEFAULT_ONBOARDING },
    );
    await continueFixture(page);
  },
  /** Depends on `page` only to satisfy Playwright's destructuring requirement (no empty `{}`). */
  helpers: async ({ page: _page }, continueFixture) => {
    void _page;
    await continueFixture(helpers);
  },
});

export { expect };
