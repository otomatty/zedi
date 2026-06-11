/**
 * リンク機能のクリティカルジャーニー E2E（issue #1036 で全面書き直し）。
 * バックエンド無し環境（Vite dev サーバのみ）で、REST は support/mockBackend、
 * Hocuspocus は support/mockRealtime でモックして走らせる。
 *
 * ジャーニー 1: /home → FAB で新規作成 → タイトル debounce 保存（PUT 観測）→
 *              本文入力 → `[[` サジェスト → Enter 確定で wiki-link マーク →
 *              閉じた `[[...]]` 内ではサジェストが出ない。
 * ジャーニー 2: public-links モックでリンクカード / ゴーストカードを表示 →
 *              カードクリックで遷移 / ゴーストクリックで POST 作成 → 新ページへ。
 *
 * Critical-journey E2E for the linking features (rewritten for issue #1036).
 * Runs against a backend-less environment: REST is mocked by
 * support/mockBackend and Hocuspocus by support/mockRealtime.
 *
 * 注意: waitForTimeout 新規使用禁止（issue #1036）。状態ベースの待機のみ使う。
 * NOTE: adding new waitForTimeout calls is forbidden (issue #1036). Use
 * state-based waits only.
 */
import { test, expect } from "./auth-mock";
import { installMockBackend } from "./support/mockBackend";
import { mockRealtime } from "./support/mockRealtime";

const TARGET_PAGE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_PAGE_ID = "44444444-4444-4444-8444-444444444444";

test.describe("Linked Pages journeys (issue #1036)", () => {
  test.setTimeout(60_000);

  test("creates a page from home, saves the title, and confirms a [[ wiki link", async ({
    page,
  }) => {
    // Arrange: モック基盤 + サジェスト候補となる既存ページを 1 枚 seed。
    // Arrange: install mocks and seed one existing page as a suggestion candidate.
    await mockRealtime(page);
    const backend = await installMockBackend(page);
    backend.seedPage({ id: TARGET_PAGE_ID, title: "Target Page" });

    // /home は /notes/me 経由で /notes/:noteId へリダイレクトされる。
    // /home redirects via /notes/me to /notes/:noteId.
    await page.goto("/home");
    await page.waitForURL(`**/notes/${backend.noteId}`);

    // FAB → 新規作成 → POST /api/pages → /notes/:noteId/:pageId へ遷移。
    // FAB → "新規作成" → POST /api/pages → lands on /notes/:noteId/:pageId.
    await page.getByTestId("home-fab").click();
    const publicLinksFetched = page.waitForResponse((res) =>
      new URL(res.url()).pathname.endsWith("/public-links"),
    );
    await page.getByRole("button", { name: "新規作成" }).click();
    await page.waitForURL((url) => /^\/notes\/[^/]+\/[^/]+$/.test(url.pathname));
    const pageId = new URL(page.url()).pathname.split("/")[3];

    // Hocuspocus 初期同期（mockRealtime）完了でエディタがマウントされる。
    // The editor mounts once the Hocuspocus initial sync (mockRealtime) completes.
    const editor = page.locator(".tiptap");
    await expect(page.locator('.tiptap[contenteditable="true"]')).toBeVisible();

    // public-links が全空の間はリンクセクション自体が DOM に存在しない。
    // While public-links is entirely empty, the link section is absent from the DOM.
    await publicLinksFetched;
    await expect(page.getByText(/^リンク \(\d+\)$/)).toHaveCount(0);
    await expect(page.getByText(/^新しいリンク \(\d+\)$/)).toHaveCount(0);

    // Act: タイトル入力。500ms debounce 後の PUT が保存の唯一のシグナル。
    // Act: type the title. The debounced (500ms) PUT is the only save signal.
    const titleSaved = page.waitForRequest(
      (req) => req.method() === "PUT" && new URL(req.url()).pathname === `/api/pages/${pageId}`,
    );
    await page.getByPlaceholder("タイトル").fill("Linked Journey");
    const putRequest = await titleSaved;

    // Assert: PUT body にタイトルが入っている。Wiki生成ボタンはタイトルが
    // 空白以外になった瞬間に表示される（保存とは無関係）。
    // Assert: the PUT body carries the title. The Wiki生成 button shows as soon
    // as the title is non-blank (independent of saving).
    expect(putRequest.postDataJSON()).toMatchObject({ title: "Linked Journey" });
    await expect(page.getByText("Wiki生成")).toBeVisible();

    // 本文入力（REST には保存されない。Y.Doc 経由）。
    // Type body text (not persisted over REST; goes through the Y.Doc).
    await editor.click();
    await page.keyboard.type("Hello journey ");
    await expect(editor).toContainText("Hello journey");

    // `[[Tar` でサジェストが開き、部分一致候補と作成行が並ぶ。
    // `[[Tar` opens the suggestion with the partial match and the create row.
    await page.keyboard.type("[[Tar");
    const suggestion = page.getByTestId("wiki-link-suggestion");
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText("Target Page");
    await expect(suggestion).toContainText('"Tar" を作成');

    // Enter 確定で `[[Target Page]]` が挿入され、解決済みマークが付く。
    // Enter confirms: `[[Target Page]]` is inserted with a resolved mark.
    await page.keyboard.press("Enter");
    const wikiLink = editor.locator('[data-wiki-link][data-title="Target Page"]');
    await expect(wikiLink).toBeVisible();
    await expect(wikiLink).toHaveAttribute("data-exists", "true");
    await expect(wikiLink).toHaveAttribute("data-target-id", TARGET_PAGE_ID);
    await expect(suggestion).toHaveCount(0);

    // 閉じた `[[...]]` の内側にカーソルを戻してもサジェストは出ない。
    // Moving the caret back inside a closed `[[...]]` must not reopen the popup.
    await page.keyboard.type(" and [[Closed]]");
    await expect(suggestion).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(suggestion).toHaveCount(0);
  });

  test("renders link / ghost-link cards from public-links and navigates or creates on click", async ({
    page,
  }) => {
    // Arrange: ソース / ターゲットを seed し、public-links をモックで決定化する
    // （リンク抽出はサーバ責務なので E2E ではレスポンスで固定する）。
    // Arrange: seed source/target pages and pin public-links via the mock
    // (link extraction is the server's job, so E2E fixes the response).
    await mockRealtime(page);
    const backend = await installMockBackend(page);
    backend.seedPage({ id: SOURCE_PAGE_ID, title: "Source Page" });
    const target = backend.seedPage({ id: TARGET_PAGE_ID, title: "Target Page" });
    backend.setPublicLinks(SOURCE_PAGE_ID, {
      outgoing_links: [target],
      ghost_links: ["Ghost Page"],
    });

    await page.goto(`/notes/${backend.noteId}/${SOURCE_PAGE_ID}`);
    await expect(page.locator('.tiptap[contenteditable="true"]')).toBeVisible();

    // Assert: 見出しは outgoing+backlinks 合算の「リンク (1)」と、編集可能
    // ユーザー向けの「新しいリンク (1)」+ 破線カード文言。
    // Assert: headings are "リンク (1)" (outgoing+backlinks total) and
    // "新しいリンク (1)" with the dashed ghost card copy.
    // 「リンク (1)」は「新しいリンク (1)」に部分一致するため exact 指定。
    // exact match because "リンク (1)" is a substring of "新しいリンク (1)".
    await expect(page.getByText("リンク (1)", { exact: true })).toBeVisible();
    await expect(page.getByText("Target Page", { exact: true })).toBeVisible();
    await expect(page.getByText("新しいリンク (1)")).toBeVisible();
    await expect(page.getByText("Ghost Page", { exact: true })).toBeVisible();
    await expect(page.getByText("クリックしてページを作成")).toBeVisible();

    // Act: リンクカードをクリックするとリンク先ページへ遷移する。
    // Act: clicking the link card navigates to the linked page.
    await page.getByText("Target Page", { exact: true }).click();
    await page.waitForURL(`**/notes/${backend.noteId}/${TARGET_PAGE_ID}`);
    await expect(page.getByPlaceholder("タイトル")).toHaveValue("Target Page");

    // ソースページへ戻る（public-links は staleTime 30 秒のキャッシュが効く）。
    // Return to the source page (public-links served from the 30s-stale cache).
    await page.goBack();
    await page.waitForURL(`**/notes/${backend.noteId}/${SOURCE_PAGE_ID}`);
    const ghostCard = page.getByText("Ghost Page", { exact: true });
    await expect(ghostCard).toBeVisible();

    // Act: ゴーストカードをクリックすると title 付きで POST /api/pages →
    // 作成された新ページへ遷移する。
    // Act: clicking the ghost card POSTs /api/pages with the title and
    // navigates to the freshly created page.
    const createResponse = page.waitForResponse(
      (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/pages",
    );
    await ghostCard.click();
    const created = await createResponse;
    expect(created.request().postDataJSON()).toMatchObject({ title: "Ghost Page" });
    const createdRow = (await created.json()) as { id: string };
    await page.waitForURL(`**/notes/${backend.noteId}/${createdRow.id}`);
    await expect(page.getByPlaceholder("タイトル")).toHaveValue("Ghost Page");
  });
});
