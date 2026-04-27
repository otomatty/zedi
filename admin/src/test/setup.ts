import "@testing-library/jest-dom/vitest";

import i18n from "@/i18n";

// Force JA locale so existing snapshot-style assertions on Japanese strings
// continue to pass without each test having to set up i18n manually.
// テスト実行前に日本語へ強制設定し、日本語文字列を直接参照する既存テストを
// 個別の i18n セットアップなしで通せるようにする。
await i18n.changeLanguage("ja");
