/**
 * AI チャット: 設定済みのときヘッダーの AI からグローバルドックのチャットを開ける。
 * E2E: Open AI chat from header on Home (PageEditor uses useLocalPanel — header AI is hidden there).
 * Page grid: context menu「AIチャットに追加」で参照チップが付く（#396）。
 */
import { test, expect } from "./auth-mock";

const MINIMAL_AI_SETTINGS = JSON.stringify({
  provider: "openai",
  model: "gpt-4",
  modelId: "openai:gpt-4",
  apiMode: "api_server",
  apiKey: "",
  isConfigured: true,
});

test.describe("AI Chat panel", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ ai }: { ai: string }) => {
        localStorage.setItem("zedi-ai-settings", ai);
      },
      { ai: MINIMAL_AI_SETTINGS },
    );
  });

  test("opens chat composer in global dock from home", async ({ page, helpers }) => {
    await helpers.goToHome(page);

    await page.getByRole("button", { name: "AI", exact: true }).click();

    const composer = page.locator("aside").getByRole("textbox");
    await expect(composer).toBeVisible({ timeout: 20000 });
  });

  test("adds page reference from home PageCard context menu", async ({ page, helpers }) => {
    const pageId = await helpers.createNewPage(page);
    await helpers.waitForEditor(page);

    const title = "E2E Ref Page";
    await page.getByPlaceholder("タイトル").fill(title);
    await expect(page.getByText(/に保存/)).toBeVisible({ timeout: 20000 });

    await helpers.goToHome(page);

    const card = page.locator(".page-card").filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.click({ button: "right" });

    await page.getByRole("menuitem", { name: "AIチャットに追加" }).click();

    const aside = page.locator("aside");
    await expect(aside).toBeVisible({ timeout: 20000 });
    await expect(aside.getByRole("textbox")).toBeVisible();
    await expect(aside.locator(`[data-page-id="${pageId}"]`)).toBeVisible();
  });

  test.describe("seeded home conversation", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const now = Date.now();
        const conversations = [
          {
            id: "conv-e2e-seed-home",
            title: "E2E seeded action",
            messages: [
              {
                id: "msg-e2e-assistant-1",
                role: "assistant",
                content: "提案があります。",
                actions: [
                  {
                    type: "create-page",
                    title: "Seeded Title",
                    content: "# Hello",
                    suggestedLinks: [],
                    reason: "E2E seed",
                  },
                ],
                timestamp: now,
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
        ];
        localStorage.setItem("zedi-ai-conversations", JSON.stringify(conversations));
      });
    });

    test("shows create-page action card when selecting seeded conversation", async ({
      page,
      helpers,
    }) => {
      await helpers.goToHome(page);

      await page.getByRole("button", { name: "AI", exact: true }).click();

      const aside = page.locator("aside");
      await expect(aside.getByRole("textbox")).toBeVisible({ timeout: 20000 });

      await aside.getByTitle("会話一覧").click();

      await aside.getByText("E2E seeded action", { exact: false }).click();

      await expect(aside.getByRole("button", { name: "作成する" })).toBeVisible({ timeout: 15000 });
    });
  });
});
