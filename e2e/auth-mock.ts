/**
 * E2E Test Helpers with Custom Fixtures
 *
 * Authentication is handled by VITE_E2E_TEST environment variable
 * which causes the app to use MockClerkProvider.
 */
import { test as base, expect, Page } from "@playwright/test";

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
   */
  async createNewPage(page: Page): Promise<string> {
    // Navigate to new page
    await page.goto("/page/new");

    // Wait for redirect to actual page with UUID
    await page.waitForURL(/\/page\/(?!new).+/, { timeout: 15000 });

    // Extract page ID from URL
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
 */
export const test = base.extend<{ helpers: typeof helpers }>({
  // eslint-disable-next-line no-empty-pattern
  helpers: async ({}, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(helpers);
  },
});

export { expect };
