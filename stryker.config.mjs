/**
 * Stryker configuration for frontend mutation testing.
 * フロントエンド向け mutation testing の設定。
 */
export default {
  testRunner: "vitest",
  tempDirName: ".stryker-tmp",
  mutate: [
    "src/lib/**/*.{ts,tsx}",
    "src/hooks/**/*.{ts,tsx}",
    "src/pages/NoteView/noteViewHelpers.ts",
    "src/components/layout/AIChatDock.tsx",
    "src/components/layout/AppLayout.tsx",
    "src/pages/NoteView/index.tsx",
    "src/pages/NoteSettings/index.tsx",
    "src/pages/NoteMembers/index.tsx",
    "src/components/layout/Header/index.tsx",
    "src/components/layout/AppSidebar.tsx",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.spec.{ts,tsx}",
    "!src/test/**",
    "!src/main.tsx",
    "!src/vite-env.d.ts",
  ],
  vitest: {
    configFile: "vite.config.ts",
  },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: {
    fileName: "reports/mutation/mutation.html",
  },
  thresholds: {
    high: 80,
    low: 70,
    break: 65,
  },
};
