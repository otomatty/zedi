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
 *
 * バックエンド無し環境で動くよう、`/notes/me` 解決に必要な API を
 * `page.route` でモックする（issue #1036）。
 * Runs without a backend: the APIs needed to resolve `/notes/me` are mocked
 * via `page.route` (issue #1036).
 *
 * waitForTimeout 新規使用禁止（issue #1036）。状態ベースの待機のみ使うこと。
 * Do NOT add new `waitForTimeout` calls (issue #1036). Use state-based waits only.
 */
import { test, expect } from "./auth-mock";
import type { Page, Route } from "@playwright/test";

const NOTE_ID = "44444444-4444-4444-8444-444444444444";

/** Wire-format note row returned by /api/notes/me and /api/notes/:noteId. */
const NOTE_ROW = {
  id: NOTE_ID,
  slug: "my-notes",
  title: "My Notes",
  description: null,
  visibility: "private",
  owner_id: "local-user",
  current_user_role: "owner",
  page_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/**
 * Install the note-resolution API mocks needed to render /notes/me without a
 * backend. The catch-all is registered FIRST so it is checked LAST (Playwright
 * matches routes in reverse registration order).
 *
 * バックエンド無しで /notes/me を描画するためのモック。catch-all は最初に
 * 登録する（Playwright は登録の逆順でマッチするため、最後に評価される）。
 */
async function installNoteMocks(page: Page): Promise<void> {
  // Catch-all for unmocked /api/* → 404. Predicate form so Vite module URLs
  // like /src/lib/api/... are NOT intercepted.
  // 未モックの /api/* は 404。述語形式にして Vite のモジュール URL
  // (/src/lib/api/...) を巻き込まない。
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route: Route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "not_found" }),
      });
    },
  );

  await page.route(
    (url) => url.pathname === "/api/notes/me",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(NOTE_ROW),
      });
    },
  );

  await page.route(
    (url) => url.pathname === `/api/notes/${NOTE_ID}`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(NOTE_ROW),
      });
    },
  );

  await page.route(
    (url) => url.pathname === `/api/notes/${NOTE_ID}/pages`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
    },
  );
}

test.describe("Web Clipper clipUrl flow", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await installNoteMocks(page);
  });

  test("auto-opens the dialog with clipUrl prefilled when hitting /notes/me directly", async ({
    page,
  }) => {
    const clipUrl = "https://example.com/article";
    await page.goto(
      `/notes/me?${new URLSearchParams({ clipUrl, from: "chrome-extension" }).toString()}`,
    );

    // With mock auth (VITE_E2E_TEST), the user is signed in; the dialog should
    // auto-open after `/notes/me` resolves to `/notes/:noteId?clipUrl=...`.
    // モック認証（VITE_E2E_TEST）ではサインイン済みなので、`/notes/me` が
    // `/notes/:noteId?clipUrl=...` に解決された後にダイアログが自動で開く。
    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // URL input should be prefilled. The input is the only textbox inside the
    // dialog (its placeholder is an example URL, so query by role instead).
    // URL 入力欄には clipUrl がプリフィルされる。placeholder は例示 URL の
    // ため、role ベースでダイアログ内の textbox を取得する。
    const urlInput = dialog.getByRole("textbox");
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

    // /home preserves search params and redirects to /notes/me, which then
    // resolves to /notes/:noteId?clipUrl=... — the dialog should still open.
    // /home は search params を保ったまま /notes/me にリダイレクトし、その後
    // /notes/:noteId?clipUrl=... に解決されるため、ダイアログは開き続ける。
    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const urlInput = dialog.getByRole("textbox");
    await expect(urlInput).toHaveValue(clipUrl);

    // The redirect chain must terminate at the concrete note URL — pinning
    // that /home did not stall at an intermediate alias route.
    // リダイレクトチェーンが具体的なノート URL /notes/:noteId に到達している
    // こと（/home が中間ルートで止まっていないこと）を固定する。
    await expect(page).toHaveURL(new RegExp(`/notes/${NOTE_ID}(\\?|$)`));
  });

  test("does not open the dialog when clipUrl fails the URL policy", async ({ page }) => {
    const invalidUrl = "chrome://extensions";
    await page.goto(`/notes/me?${new URLSearchParams({ clipUrl: invalidUrl }).toString()}`);

    // Wait until /notes/me resolves to the concrete note URL with the invalid
    // clipUrl stripped — that is the state signalling the policy ran.
    // 無効な clipUrl が剥がされた /notes/:noteId への解決完了を待つ。
    // これがポリシー適用済みであることを示す状態シグナルになる。
    await page.waitForURL((url) => {
      return url.pathname === `/notes/${NOTE_ID}` && !url.searchParams.has("clipUrl");
    });

    // Positive signal first: the app shell actually rendered (header search
    // input is visible) — otherwise the not-visible check below would also
    // pass on a blank/broken page.
    // まず正のシグナル: アプリシェルが実際に描画済み（ヘッダ検索入力が可視）
    // であることを確認する。白画面でも下の不在チェックが通ってしまうため。
    await expect(page.locator("#header-search-input")).toBeVisible();

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

    const dialog = page.getByRole("dialog").filter({ hasText: /URL.*取り込み|Import from URL/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const urlInput = dialog.getByRole("textbox");
    await expect(urlInput).toHaveValue(clipUrl);
  });
});
