/**
 * E2E Test Helpers with Custom Fixtures
 *
 * Authentication is handled by VITE_E2E_TEST environment variable
 * which causes the app to use MockAuthProvider.
 */
import { test as base, expect, Page } from "@playwright/test";

/** Default onboarding so signed-in E2E users stay on /home (not redirected to /onboarding). */
const E2E_DEFAULT_ONBOARDING = {
  hasCompletedSetupWizard: true,
  hasCompletedTour: false,
  completedSteps: [] as string[],
  dismissedHints: [] as string[],
};

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
   * Uses the home FAB (「新規作成」): `/page/new` is no longer a creation entry (editor redirects to /home).
   */
  async createNewPage(page: Page): Promise<string> {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-tour-id="tour-fab"]').click();
    await page.getByRole("button", { name: "新規作成" }).click();

    await page.waitForURL(/\/page\/(?!new).+/, { timeout: 15000 });

    const url = page.url();
    const match = url.match(/\/page\/([^/]+)/);
    if (!match) {
      throw new Error(`Failed to extract page ID from URL: ${url}`);
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
    await page.addInitScript((onboarding: typeof E2E_DEFAULT_ONBOARDING) => {
      localStorage.setItem("zedi-onboarding", JSON.stringify(onboarding));
    }, E2E_DEFAULT_ONBOARDING);
    await continueFixture(page);
  },
  /** Depends on `page` only to satisfy Playwright's destructuring requirement (no empty `{}`). */
  helpers: async ({ page: _page }, continueFixture) => {
    void _page;
    await continueFixture(helpers);
  },
});

export { expect };
