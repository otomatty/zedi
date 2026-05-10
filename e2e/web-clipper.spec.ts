/**
 * E2E: Web Clipper clipUrl flow (Chrome extension integration).
 * `/notes/me?clipUrl=...` 経由（issue #826）、および旧 `/home?clipUrl=...`
 * 経由（互換層）の双方で WebClipperDialog が自動 open し、URL がプリフィル
 * されることを検証する。
 *
 * E2E coverage for the Chrome-extension clip hand-off. After issue #826 the
 * canonical entry point is `/notes/me?clipUrl=...`; the legacy
 * `/home?clipUrl=...` URL must keep working as a query-preserving redirect
 * until the extension itself is updated (issue #829).
 */
import { test, expect } from "./auth-mock";

test.describe("Web Clipper clipUrl flow", () => {
  test.setTimeout(60000);

  test("auto-opens the dialog with clipUrl prefilled when hitting /notes/me directly", async ({
    page,
  }) => {
    const clipUrl = "https://example.com/article";
    await page.goto(
      `/notes/me?${new URLSearchParams({ clipUrl, from: "chrome-extension" }).toString()}`,
    );
    await page.waitForLoadState("networkidle");

    // With mock auth (VITE_E2E_TEST), the user is signed in; the dialog should
    // auto-open after `/notes/me` resolves to `/notes/:noteId?clipUrl=...`.
    // モック認証（VITE_E2E_TEST）ではサインイン済みなので、`/notes/me` が
    // `/notes/:noteId?clipUrl=...` に解決された後にダイアログが自動で開く。
    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // URL input should be prefilled.
    // URL 入力欄には clipUrl がプリフィルされる。
    const urlInput = page.getByPlaceholder(/URL.*入力|Enter URL/i);
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue(clipUrl);
  });

  test("legacy /home?clipUrl=... still forwards to /notes/me and auto-opens the dialog", async ({
    page,
  }) => {
    const clipUrl = "https://example.com/legacy";
    await page.goto(
      `/home?${new URLSearchParams({ clipUrl, from: "chrome-extension" }).toString()}`,
    );
    await page.waitForLoadState("networkidle");

    // /home preserves search params and redirects to /notes/me, which then
    // resolves to /notes/:noteId?clipUrl=... — the dialog should still open.
    // /home は search params を保ったまま /notes/me にリダイレクトし、その後
    // /notes/:noteId?clipUrl=... に解決されるため、ダイアログは開き続ける。
    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const urlInput = page.getByPlaceholder(/URL.*入力|Enter URL/i);
    await expect(urlInput).toHaveValue(clipUrl);
  });

  test("does not open the dialog when clipUrl fails the URL policy", async ({ page }) => {
    const invalidUrl = "chrome://extensions";
    await page.goto(`/notes/me?${new URLSearchParams({ clipUrl: invalidUrl }).toString()}`);
    await page.waitForLoadState("networkidle");

    // Invalid URLs are stripped at /notes/me; the dialog must stay closed.
    // 無効な URL は /notes/me で剥がされるため、ダイアログは閉じたままになる。
    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).not.toBeVisible();
  });

  test("opens the dialog with clipUrl prefilled even when from= param is omitted", async ({
    page,
  }) => {
    const clipUrl = "https://example.com/page";
    await page.goto(`/notes/me?${new URLSearchParams({ clipUrl }).toString()}`);
    await page.waitForLoadState("networkidle");

    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const urlInput = page.getByPlaceholder(/URL.*入力|Enter URL/i);
    await expect(urlInput).toHaveValue(clipUrl);
  });
});
