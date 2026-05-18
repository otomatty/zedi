/**
 * 管理画面 SPA 用の Playwright 設定。ルート (`playwright.config.ts`) はメインアプリ
 * （ポート 5173）を起動するため、admin 用に別ポート (30001) を独立して立ち上げる。
 *
 * Playwright config dedicated to the admin SPA. The root config boots the main
 * app on port 5173, so the admin needs its own server on port 30001 with
 * separate test selection so the two suites don't collide.
 *
 * @see https://github.com/otomatty/zedi/issues/804
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:30001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev -- --port 30001",
    url: "http://localhost:30001",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
