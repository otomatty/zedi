/**
 * AI チャット: 設定済みのときヘッダーの AI からグローバルドックのチャットを開ける。
 * E2E: Open AI chat from header on Home (PageEditor uses useLocalPanel — header AI is hidden there).
 */
import { test, expect } from "./auth-mock";

const COMPLETED_ONBOARDING_STATE = {
  hasCompletedSetupWizard: true,
  hasCompletedTour: false,
  completedSteps: [] as string[],
  dismissedHints: [] as string[],
};

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
      ({ onboarding, ai }: { onboarding: typeof COMPLETED_ONBOARDING_STATE; ai: string }) => {
        localStorage.setItem("zedi-onboarding", JSON.stringify(onboarding));
        localStorage.setItem("zedi-ai-settings", ai);
      },
      { onboarding: COMPLETED_ONBOARDING_STATE, ai: MINIMAL_AI_SETTINGS },
    );
  });

  test("opens chat composer in global dock from home", async ({ page, helpers }) => {
    await helpers.goToHome(page);

    await page.getByRole("button", { name: "AI", exact: true }).click();

    const composer = page.locator("aside").getByRole("textbox");
    await expect(composer).toBeVisible({ timeout: 20000 });
  });
});
