/**
 * インラインゴースト補完の E2E テスト（issue #930、親 #924 §4）。
 * issue #1036 でバックエンド無し環境向けに全面書き直し: 候補は
 * support/mockBackend の page-titles モックで seed し、Hocuspocus は
 * support/mockRealtime でモックする。
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
 * E2E tests for the inline ghost completion (issue #930, parent #924 §4).
 * Rewritten for the backend-less environment (issue #1036): candidates are
 * seeded through the mocked page-titles endpoint and Hocuspocus is mocked.
 * Locks the acceptance criteria of issue #930 against the live editor.
 *
 * 注意: waitForTimeout 新規使用禁止（issue #1036）。状態ベースの待機のみ使う。
 * NOTE: adding new waitForTimeout calls is forbidden (issue #1036). Use
 * state-based waits only.
 */
import { test, expect, type Page } from "./auth-mock";
import { installMockBackend } from "./support/mockBackend";
import { mockRealtime } from "./support/mockRealtime";

const GHOST_SELECTOR = ".wiki-link-ghost-completion";

const CANDIDATE_PAGE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_PAGE_ID = "44444444-4444-4444-8444-444444444444";

/**
 * モック基盤を入れ、候補 "Ghost Target" を seed（任意）した上で入力対象の
 * ページを直接 URL で開き、候補一覧の読込とエディタのマウントを待つ。
 * Install the mocks, optionally seed the "Ghost Target" candidate, open the
 * source page by direct URL, and wait for the candidate list to load and the
 * editor to mount.
 */
async function openSourcePage(
  page: Page,
  options: { withCandidate: boolean; sourceTitle: string },
) {
  await mockRealtime(page);
  const backend = await installMockBackend(page);
  if (options.withCandidate) {
    backend.seedPage({ id: CANDIDATE_PAGE_ID, title: "Ghost Target" });
  }
  backend.seedPage({ id: SOURCE_PAGE_ID, title: options.sourceTitle });

  // ゴースト補完の候補ソースは GET /api/notes/:noteId/page-titles。
  // タイプ前に読込完了を待って決定化する。
  // The candidate source is GET /api/notes/:noteId/page-titles; wait for it
  // before typing so the test is deterministic.
  const titlesLoaded = page.waitForResponse(
    (res) => new URL(res.url()).pathname === `/api/notes/${backend.noteId}/page-titles`,
  );
  await page.goto(`/notes/${backend.noteId}/${SOURCE_PAGE_ID}`);
  await titlesLoaded;

  const editor = page.locator(".tiptap").first();
  await expect(page.locator('.tiptap[contenteditable="true"]')).toBeVisible();
  await editor.click();
  return editor;
}

test.describe("Inline Ghost Completion (issue #930)", () => {
  test.setTimeout(60_000);

  test("shows the ghost suffix when the typed word prefix-matches a candidate", async ({
    page,
  }) => {
    await openSourcePage(page, { withCandidate: true, sourceTitle: "Source" });

    await page.keyboard.type("Gho");

    // Ghost suffix appears with the remainder of the title.
    // ゴーストにタイトルの残り部分が出る。
    const ghost = page.locator(GHOST_SELECTOR);
    await expect(ghost).toBeVisible();
    await expect(ghost).toHaveText("st Target");
  });

  test("confirms with Tab — turns the typed prefix into a wiki link", async ({ page }) => {
    const editor = await openSourcePage(page, {
      withCandidate: true,
      sourceTitle: "Source Confirm",
    });

    await page.keyboard.type("Gho");
    await expect(page.locator(GHOST_SELECTOR)).toBeVisible();

    await page.keyboard.press("Tab");

    // Ghost is gone and a wiki-link mark covers the full title, resolved to
    // the seeded candidate page.
    // ゴーストが消え、Wiki Link マークがタイトル全体を覆い、seed した候補
    // ページに解決される。
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);
    const wikiLink = editor.locator('[data-wiki-link][data-title="Ghost Target"]');
    await expect(wikiLink).toBeVisible();
    await expect(wikiLink).toHaveAttribute("data-exists", "true");
    await expect(wikiLink).toHaveAttribute("data-target-id", CANDIDATE_PAGE_ID);
  });

  test("Escape dismisses the ghost but keeps the typed text", async ({ page }) => {
    const editor = await openSourcePage(page, {
      withCandidate: true,
      sourceTitle: "Source Escape",
    });

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

  test("does not fire on a single character (≥2 chars rule)", async ({ page }) => {
    await openSourcePage(page, { withCandidate: true, sourceTitle: "Source Length" });

    await page.keyboard.type("G");
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);

    await page.keyboard.type("h");
    // Now at 2 chars → ghost should appear.
    // 2 文字に達したのでゴーストが出る。
    await expect(page.locator(GHOST_SELECTOR)).toBeVisible();
  });

  test("does not fire inside a code block", async ({ page }) => {
    const editor = await openSourcePage(page, {
      withCandidate: true,
      sourceTitle: "Source CodeBlock",
    });

    // Markdown shortcut for a code block (triple backtick + Enter). After this
    // the cursor sits inside the code block.
    // ` ``` ` + Enter で code block に入る。以降 code block 内なのでゴースト不発火。
    await page.keyboard.type("```");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Gho");

    // Positive signal first: the input rule actually produced a code block and
    // the prefix landed inside it — otherwise count(0) below would pass vacuously.
    // まず正のシグナル: 入力規則で実際に code block 化され接頭辞がその中に
    // 入ったことを確認する（さもないと下の count(0) が空虚に通る）。
    await expect(editor.locator("pre code")).toContainText("Gho");
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);
  });

  test("does not fire inside inline code", async ({ page }) => {
    // 受け入れ条件: インラインコード（バッククォート 1 つ）内ではゴースト不発火。
    // 内部では `wikiLink` マークが付けられない（`excludes: "code"` 相当）ため、
    // サジェストも出さない契約。
    // Acceptance: ghost must not fire inside inline code (single backticks)
    // since the WikiLink mark cannot apply there.
    const editor = await openSourcePage(page, {
      withCandidate: true,
      sourceTitle: "Source InlineCode",
    });

    // Markdown 入力規則で「`Gho`」と打って `Gho` をインラインコードにする。
    // キャレットをインラインコード内に戻して 1 文字追加し、抑止を確認する。
    // Type "`Gho`" so the Markdown input rule wraps it in inline code, then
    // move the caret back inside the span, add one more matching char, and
    // confirm the ghost stays suppressed.
    await page.keyboard.type("`Gho`");

    // Positive signal first: the input rule actually wrapped "Gho" in inline
    // code — otherwise count(0) below would pass vacuously.
    // まず正のシグナル: 入力規則で "Gho" が実際にインラインコード化された
    // ことを確認する（さもないと下の count(0) が空虚に通る）。
    await expect(editor.locator("code")).toContainText("Gho");

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("s");
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);
  });

  test("does not fire while the `[[` suggestion popup is active", async ({ page }) => {
    await openSourcePage(page, { withCandidate: true, sourceTitle: "Source Brackets" });

    await page.keyboard.type("[[Gho");

    // The `[[` suggestion popup owns this range, the ghost must stay hidden.
    // ポップアップ表示を確認した上で（= サジェスト active が成立した上で）、
    // ゴーストが出ていないことをアサートする。
    // Assert the popup is actually visible (the active state is established)
    // before asserting the ghost stays hidden.
    await expect(page.getByTestId("wiki-link-suggestion")).toBeVisible();
    await expect(page.locator(GHOST_SELECTOR)).toHaveCount(0);
  });

  test("Tab still indents list items when no ghost is active (regression guard)", async ({
    page,
  }) => {
    // We seed no candidate so the ghost never activates; if it did, it would
    // also suppress Tab. This test pins the "Tab passes through" contract
    // that protects existing list indent behaviour.
    // 候補なしにしてゴーストを発火させない状態で Tab を打鍵し、リストの
    // ネスト動作が壊れないこと（Tab 素通し）を保証する。
    const editor = await openSourcePage(page, {
      withCandidate: false,
      sourceTitle: "Tab Passthrough",
    });

    // Start a bullet list.
    // 箇条書きリストを開始する。
    await page.keyboard.type("- first item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("nested");
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");

    // After Tab, the second item is nested → nested `<ul>` exists and holds
    // exactly the "nested" item (pins WHICH item was indented).
    // Tab 後、2 つ目の `li` が入れ子になり `ul ul` が現れる。入れ子になった
    // のが "nested" の行であることまで固定する。
    await expect(editor.locator("ul ul")).toHaveCount(1);
    await expect(editor.locator("ul ul")).toHaveText("nested");
  });
});
