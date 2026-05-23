/**
 * E2E tests for the inline ghost completion (issue #930, parent #924 §4).
 * インラインゴースト補完の E2E テスト（issue #930、親 #924 §4）。
 *
 * 受け入れ条件を End-to-End で固定する:
 * - 既存ページ名の接頭辞を本文中で 2 文字以上タイプすると薄色のゴーストが
 *   カーソル右に出る
 * - Tab で確定すると `[data-wiki-link]` の Wiki Link マークが付与される
 * - Escape または接頭辞が外れたらゴーストが消える
 * - コードブロック / インラインコード内では発火しない
 * - `[[` 入力中はゴースト補完が表示されない（`[[` サジェストが優先）
 * - 1 文字ではゴーストが出ない（≥2 文字ルール）
 * - サジェスト非アクティブ時の Tab は通常通り（リスト indent などを壊さない）
 *
 * Locks the acceptance criteria of issue #930 against the live editor.
 */
import { test, expect, type Page } from "./auth-mock";

const GHOST_SELECTOR = ".wiki-link-ghost-completion";

/**
 * Seed a single candidate page so the ghost completion has something to match.
 * ゴーストが match できるように候補ページを 1 枚作る。
 */
async function seedCandidatePage(
  page: Page,
  helpers: { createNewPage: (page: Page) => Promise<{ noteId: string; pageId: string }> },
  title: string,
): Promise<void> {
  await helpers.createNewPage(page);
  await page.getByPlaceholder("タイトル").fill(title);
  // タイトル保存（debounce 500ms + バッファ）が走るまで待つ。
  // Wait for the debounced (500ms) title save to flush.
  await page.waitForTimeout(1500);
}

/**
 * Locator for the editor (Tiptap root).
 * エディタ本体のロケータ。
 */
function editorLocator(page: Page) {
  return page.locator(".tiptap").first();
}

test.describe("Inline Ghost Completion (issue #930)", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page, helpers }) => {
    await helpers.goToHome(page);
  });

  test("shows the ghost suffix when the typed word prefix-matches a candidate", async ({
    page,
    helpers,
  }) => {
    await seedCandidatePage(page, helpers, "Ghost Target");

    // 新しい源ページを作って候補一覧が読み込まれるのを待つ。
    // Open a fresh page so candidates load fresh from the cache.
    await helpers.createNewPage(page);
    await page.getByPlaceholder("タイトル").fill("Source");
    await page.waitForTimeout(800);

    const editor = editorLocator(page);
    await editor.click();
    await page.keyboard.type("Gho");

    // Ghost suffix appears with the remainder of the title.
    // ゴーストにタイトルの残り部分が出る。
    const ghost = page.locator(GHOST_SELECTOR);
    await expect(ghost).toBeVisible();
    await expect(ghost).toHaveText("st Target");
  });

  test("confirms with Tab — turns the typed prefix into a wiki link", async ({ page, helpers }) => {
    await seedCandidatePage(page, helpers, "Ghost Target");
    await helpers.createNewPage(page);
    await page.getByPlaceholder("タイトル").fill("Source Confirm");
    await page.waitForTimeout(800);

    const editor = editorLocator(page);
    await editor.click();
    await page.keyboard.type("Gho");

    await expect(page.locator(GHOST_SELECTOR)).toBeVisible();
    await page.keyboard.press("Tab");

    // Ghost is gone and a wiki-link mark covers the full title.
    // ゴーストが消え、Wiki Link マークがタイトル全体を覆う。
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);
    const wikiLink = editor.locator('[data-wiki-link][data-title="Ghost Target"]');
    await expect(wikiLink).toBeVisible();
    await expect(wikiLink).toHaveAttribute("data-exists", "true");
  });

  test("Escape dismisses the ghost but keeps the typed text", async ({ page, helpers }) => {
    await seedCandidatePage(page, helpers, "Ghost Target");
    await helpers.createNewPage(page);
    await page.getByPlaceholder("タイトル").fill("Source Escape");
    await page.waitForTimeout(800);

    const editor = editorLocator(page);
    await editor.click();
    await page.keyboard.type("Gho");

    await expect(page.locator(GHOST_SELECTOR)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);

    // The user's typed prefix stays in the editor (Escape only kills the
    // preview, not the input). The wiki-link mark must NOT be applied.
    // 入力済みの接頭辞は残り、Wiki Link マークは付かない。
    await expect(editor).toContainText("Gho");
    await expect(editor.locator('[data-wiki-link][data-title="Ghost Target"]')).toHaveCount(0);
  });

  test("does not fire on a single character (≥2 chars rule)", async ({ page, helpers }) => {
    await seedCandidatePage(page, helpers, "Ghost Target");
    await helpers.createNewPage(page);
    await page.getByPlaceholder("タイトル").fill("Source Length");
    await page.waitForTimeout(800);

    const editor = editorLocator(page);
    await editor.click();
    await page.keyboard.type("G");
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);

    await page.keyboard.type("h");
    // Now at 2 chars → ghost should appear.
    // 2 文字に達したのでゴーストが出る。
    await expect(page.locator(GHOST_SELECTOR)).toBeVisible();
  });

  test("does not fire inside a code block", async ({ page, helpers }) => {
    await seedCandidatePage(page, helpers, "Ghost Target");
    await helpers.createNewPage(page);
    await page.getByPlaceholder("タイトル").fill("Source CodeBlock");
    await page.waitForTimeout(800);

    const editor = editorLocator(page);
    await editor.click();
    // Markdown shortcut for a code block (CodeBlockLowlight registers triple
    // backtick + Enter as the input rule). After this the cursor sits inside
    // the code block.
    // ` ``` ` + Enter で code block に入る。以降 code block 内なのでゴースト不発火。
    await page.keyboard.type("```");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Gho");
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);
  });

  test("does not fire inside inline code", async ({ page, helpers }) => {
    // 受け入れ条件: インラインコード（バッククォート 1 つ）内ではゴースト不発火。
    // 内部では `wikiLink` マークが付けられない（`excludes: "code"` 相当）ため、
    // サジェストも出さない契約。
    // Acceptance: ghost must not fire inside inline code (single backticks)
    // since the WikiLink mark cannot apply there.
    await seedCandidatePage(page, helpers, "Ghost Target");
    await helpers.createNewPage(page);
    await page.getByPlaceholder("タイトル").fill("Source InlineCode");
    await page.waitForTimeout(800);

    const editor = editorLocator(page);
    await editor.click();
    // Open an inline code span via Markdown input rule: typing "`Gho`" turns
    // the text between backticks into inline code. We type the opening
    // backtick + the prefix first to land the caret inside the active code
    // mark, which mirrors what users do mid-line.
    // Markdown 入力規則で「`Gho`」と打って `Gho` をインラインコードにする。
    // 開きバッククォート + 接頭辞を打鍵した時点でキャレットは `code` マーク
    // 内にあるので、その状態でゴーストが出ないことを確認する。
    await page.keyboard.type("`Gho`");
    // Move the caret back inside the code span and type another matching char.
    // キャレットをインラインコード内に戻して 1 文字追加し、再度抑止を確認する。
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("s");
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);
  });

  test("does not fire while the `[[` suggestion popup is active", async ({ page, helpers }) => {
    await seedCandidatePage(page, helpers, "Ghost Target");
    await helpers.createNewPage(page);
    await page.getByPlaceholder("タイトル").fill("Source Brackets");
    await page.waitForTimeout(800);

    const editor = editorLocator(page);
    await editor.click();
    await page.keyboard.type("[[Gho");
    // The `[[` suggestion popup owns this range, the ghost must stay hidden.
    // `[[` サジェストがこの範囲を担当しているので、ゴーストは出ない。
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);
  });

  test("Tab still indents list items when no ghost is active (regression guard)", async ({
    page,
    helpers,
  }) => {
    // We are not seeding candidates so the ghost never activates; if it did,
    // it would also suppress Tab. This test pins the "Tab passes through"
    // contract that protects existing list indent behaviour.
    // 候補なしにしてゴーストを発火させない状態で Tab を打鍵し、リストの
    // ネスト動作が壊れないこと（Tab 素通し）を保証する。
    await helpers.createNewPage(page);
    await page.getByPlaceholder("タイトル").fill("Tab Passthrough");
    await page.waitForTimeout(800);

    const editor = editorLocator(page);
    await editor.click();
    // Start a bullet list.
    // 箇条書きリストを開始する。
    await page.keyboard.type("- first item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("nested");
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");

    // After Tab, the second item is nested → nested `<ul>` exists.
    // Tab 後、2 つ目の `li` が入れ子になり `ul ul` が現れる。
    await expect(editor.locator("ul ul")).toHaveCount(1);
  });
});
