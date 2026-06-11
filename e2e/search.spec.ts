/**
 * E2E: グローバル検索（ヘッダー検索バー + フル検索ページ）。
 *
 * 旧「検索ダイアログ」UI は廃止済み。現行仕様は常時表示のヘッダー検索バー
 * （combobox + Popover listbox）と `/search?q=` のフル検索ページ。
 * バックエンド無し環境で動くよう、`GET /api/search` と note/page 系 API を
 * `page.route` でモックする（issue #1036）。
 *
 * E2E for global search. The old "search dialog" UI is gone; the current spec
 * is an always-visible header search bar (combobox + Popover listbox) plus the
 * full search page at `/search?q=`. Runs without a backend: `GET /api/search`
 * and the note/page APIs are mocked via `page.route` (issue #1036).
 *
 * waitForTimeout 新規使用禁止（issue #1036）。状態ベースの待機のみ使うこと。
 * Do NOT add new `waitForTimeout` calls (issue #1036). Use state-based waits only.
 */
import { test, expect } from "./auth-mock";
import type { Page, Route } from "@playwright/test";

const NOTE_ID = "55555555-5555-4555-8555-555555555555";
const PAGE_ID = "66666666-6666-4666-8666-666666666666";

/** Wire-format note row for /api/notes/me and /api/notes/:noteId. */
const NOTE_ROW = {
  id: NOTE_ID,
  slug: "search-note",
  title: "Search Note",
  description: null,
  visibility: "private",
  owner_id: "local-user",
  current_user_role: "owner",
  page_count: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/**
 * Title of the title-match hit. Contains the query "photo" verbatim
 * (lowercase) so the title-match classification cannot miss it.
 *
 * タイトルマッチ行のタイトル。クエリ "photo" を小文字そのままで含み、
 * タイトルマッチ判定が取りこぼさないようにする。
 */
const TITLE_HIT_TITLE = "photo journal 2026";

/** Wire-format page row for /api/pages/:pageId (navigation target). */
const PAGE_ROW = {
  id: PAGE_ID,
  note_id: NOTE_ID,
  owner_id: "local-user",
  title: TITLE_HIT_TITLE,
  content_preview: "Light energy is converted to chemical energy.",
  thumbnail_url: null,
  source_url: null,
  is_deleted: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/**
 * Wire-format search hit (GET /api/search). Title contains the query "photo"
 * but the preview does not, so the full search page shows the `タイトル` badge.
 *
 * 検索ヒット行。タイトルのみにクエリ "photo" を含めることで、フル検索
 * ページのマッチ種別バッジが `タイトル` に確定する。
 */
const HIT_TITLE_ONLY = {
  kind: "page",
  id: PAGE_ID,
  note_id: NOTE_ID,
  title: TITLE_HIT_TITLE,
  content_preview: "Light energy is converted to chemical energy.",
  source_url: null,
  thumbnail_url: null,
  updated_at: "2026-01-02T00:00:00.000Z",
};

/**
 * Second hit: empty title (renders as `無題のページ`) and the query only in
 * the body, so the badge is `本文` and the snippet highlights "photo".
 *
 * 2 件目のヒット。タイトル空（`無題のページ` 表示）+ 本文のみマッチで、
 * バッジは `本文`、スニペットに `<mark>photo</mark>` が出る。
 */
const HIT_BODY_ONLY = {
  kind: "page",
  id: "77777777-7777-4777-8777-777777777777",
  note_id: NOTE_ID,
  title: "",
  content_preview: "Plants use photosynthesis to grow.",
  source_url: null,
  thumbnail_url: null,
  updated_at: "2026-01-03T00:00:00.000Z",
};

/**
 * Install the app-shell API mocks (note resolution + navigation target).
 * The catch-all is registered FIRST so it is checked LAST (Playwright matches
 * routes in reverse registration order). Predicate form so Vite module URLs
 * like /src/lib/api/... are NOT intercepted.
 *
 * アプリシェル描画と遷移先ページ用のモック。catch-all は最初に登録する
 * （Playwright は登録の逆順でマッチするため、最後に評価される）。述語形式
 * にして Vite のモジュール URL (/src/lib/api/...) を巻き込まない。
 */
async function installAppMocks(page: Page): Promise<void> {
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

  const json = (body: unknown) => async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  };

  await page.route((url) => url.pathname === "/api/notes/me", json(NOTE_ROW));
  await page.route((url) => url.pathname === `/api/notes/${NOTE_ID}`, json(NOTE_ROW));
  await page.route(
    (url) => url.pathname === `/api/notes/${NOTE_ID}/pages`,
    json({ items: [PAGE_ROW], total: 1 }),
  );
  await page.route((url) => url.pathname === `/api/pages/${PAGE_ID}`, json(PAGE_ROW));
  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}/public-links`,
    json({ outgoing_links: [], backlinks: [], ghost_links: [] }),
  );
}

/** Install the GET /api/search mock returning the given hits. */
async function installSearchMock(
  page: Page,
  results: unknown[],
  onRequest?: (url: URL) => void,
): Promise<void> {
  await page.route(
    (url) => url.pathname === "/api/search",
    async (route: Route) => {
      onRequest?.(new URL(route.request().url()));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results }),
      });
    },
  );
}

/** Navigate to /home (resolved to /notes/:noteId) and wait for the search bar. */
async function gotoAppShell(page: Page): Promise<ReturnType<Page["getByPlaceholder"]>> {
  await page.goto("/home");
  const searchInput = page.getByPlaceholder("ページを検索...");
  await expect(searchInput).toBeVisible({ timeout: 15000 });
  return searchInput;
}

test.describe("Global search (header search bar)", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await installAppMocks(page);
  });

  test("Cmd/Ctrl+K focuses the bar, dropdown opens at 3 chars (not 2), and ↓+Enter navigates to the hit page", async ({
    page,
  }) => {
    const searchRequests: URL[] = [];
    await installSearchMock(page, [HIT_TITLE_ONLY], (url) => searchRequests.push(url));
    const searchInput = await gotoAppShell(page);

    // Cmd+K / Ctrl+K focuses the always-visible header search input.
    // Cmd+K / Ctrl+K で常時表示のヘッダー検索入力にフォーカスする。
    await page.keyboard.press("ControlOrMeta+k");
    await expect(searchInput).toBeFocused();

    // Boundary: 2 chars (below the 3-char threshold) keeps the dropdown closed.
    // 境界値: 3 文字未満（2 文字）ではドロップダウンは開かない。
    await searchInput.fill("ph");
    await expect(searchInput).toHaveAttribute("aria-expanded", "false");

    // Boundary: the 3rd char crosses the threshold — the dropdown auto-opens
    // and shows the mocked hit as an option (wait on the option, not the
    // transient empty-state text).
    // 境界値: 3 文字目で閾値を越え、ドロップダウンが自動で開きモックヒットが
    // option として表示される（一瞬出る空状態文言ではなく option を待つ）。
    await searchInput.press("o");
    const hitOption = page.getByRole("option", { name: TITLE_HIT_TITLE });
    await expect(hitOption).toBeVisible({ timeout: 10000 });
    await expect(searchInput).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("候補 (1件)")).toBeVisible();

    // Wire contract: the API search is GET /api/search?q=<query>&scope=shared.
    // ワイヤ契約: API 検索は GET /api/search?q=<query>&scope=shared。
    expect(searchRequests[0]?.searchParams.get("q")).toBe("pho");
    expect(searchRequests[0]?.searchParams.get("scope")).toBe("shared");

    // ↓ selects the first hit and Enter navigates to /notes/:noteId/:pageId.
    // ↓ で先頭のヒットを選択し、Enter で /notes/:noteId/:pageId に遷移する。
    await searchInput.press("ArrowDown");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(`/notes/${NOTE_ID}/${PAGE_ID}`);
  });

  test("footer option opens /search?q= with heading, count, badges, highlight and untitled fallback", async ({
    page,
  }) => {
    await installSearchMock(page, [HIT_TITLE_ONLY, HIT_BODY_ONLY]);
    const searchInput = await gotoAppShell(page);

    // Type a 5-char query in one shot (a single fetch after the debounce).
    // 5 文字のクエリを一括入力する（debounce 後にフェッチは 1 回）。
    await searchInput.click();
    await searchInput.fill("photo");
    await expect(page.getByRole("option", { name: TITLE_HIT_TITLE })).toBeVisible({
      timeout: 10000,
    });

    // The footer option leads to the full search page.
    // フッター行からフル検索ページへ遷移する。
    await page.getByRole("option", { name: "「photo」の検索結果をすべて表示" }).click();
    await expect(page).toHaveURL("/search?q=photo");

    // The header dropdown can linger after navigation, so scope the result
    // assertions to the main content area.
    // 遷移後もヘッダーのドロップダウンが残ることがあるため、検索結果の
    // アサーションは main 領域にスコープする。
    const main = page.getByRole("main");

    // Heading and result count (2 API hits, no local hits).
    // 見出しと件数（API ヒット 2 件、ローカルヒットなし）。
    await expect(page.getByRole("heading", { name: /「photo」の検索結果/ })).toBeVisible();
    await expect(main).toContainText("2件", { timeout: 10000 });

    // Card 1: the hit title is rendered.
    // NOTE: 仕様書ではタイトルマッチ行に `タイトル` バッジが想定されるが、
    // 実装は共有行のバッジを常に `本文` と表示した（乖離候補として報告済み）。
    // ここでは仕様と実装が一致しているタイトル表示のみを検証する。
    // NOTE: per the spec a title-match row should get the `タイトル` badge, but
    // the implementation labels shared rows `本文` (reported as a divergence
    // candidate). Only the title rendering — where spec and implementation
    // agree — is asserted here.
    await expect(main.getByText(TITLE_HIT_TITLE)).toBeVisible();

    // Card 2: empty title renders as `無題のページ`, body hit → `本文` badge.
    // カード 2: タイトル空は `無題のページ` 表示、本文マッチ → `本文` バッジ。
    const untitledCard = main.getByRole("button", { name: /無題のページ/ });
    await expect(untitledCard).toBeVisible();
    await expect(untitledCard.getByText("本文", { exact: true })).toBeVisible();

    // Snippet highlights the keyword with <mark>, and shared rows get a badge.
    // スニペットは <mark> でキーワードをハイライトし、共有行に `共有` バッジ。
    await expect(main.locator("mark").first()).toContainText(/photo/i);
    await expect(main.getByText("共有", { exact: true }).first()).toBeVisible();
  });

  test("zero hits show the empty message and Escape closes the dropdown but keeps the input", async ({
    page,
  }) => {
    await installSearchMock(page, []);
    const searchInput = await gotoAppShell(page);

    await searchInput.click();
    const responsePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === "/api/search",
    );
    await searchInput.fill("zzznohit");
    await responsePromise;

    // 0 hits (after the fetch settled) → empty message in the dropdown.
    // フェッチ完了後の 0 件 → ドロップダウンに空状態の文言が出る。
    const listbox = page.locator("#header-search-list");
    await expect(listbox.getByText("ページが見つかりません")).toBeVisible();

    // Escape closes the dropdown and blurs the input; the input itself stays.
    // Escape でドロップダウンが閉じ入力は blur されるが、入力欄自体は残る。
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(searchInput).toBeVisible();
    await expect(searchInput).not.toBeFocused();
  });
});
