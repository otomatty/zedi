import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { EditorSkeleton } from "./EditorSkeleton";

/**
 * Render helper that wires up i18n the same way as `PageTitleBlock.test.tsx`.
 * `PageTitleBlock.test.tsx` と同じ手順で i18n を組み込むレンダーヘルパー。
 */
function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("EditorSkeleton", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("role=status の要素を描画する / renders an element with role=status", () => {
    renderWithI18n(<EditorSkeleton />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("aria-busy と aria-live が設定されている / sets aria-busy and aria-live", () => {
    renderWithI18n(<EditorSkeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("日本語ロケールで aria-label に「エディタを読み込み中」が入る / sets Japanese aria-label", () => {
    renderWithI18n(<EditorSkeleton />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "エディタを読み込み中");
  });

  it("data-testid=editor-skeleton を持つ / has data-testid=editor-skeleton", () => {
    renderWithI18n(<EditorSkeleton />);
    expect(screen.getByTestId("editor-skeleton")).toBeInTheDocument();
  });

  it("段落構造のスケルトン行を 9 本描画する / renders 9 paragraph-shaped skeleton lines", () => {
    renderWithI18n(<EditorSkeleton />);
    expect(screen.getAllByTestId("editor-skeleton-line")).toHaveLength(9);
  });

  it("旧テキスト「リアルタイム編集を準備中」を含まない / does not render the legacy text", () => {
    renderWithI18n(<EditorSkeleton />);
    expect(screen.queryByText(/リアルタイム編集を準備中/)).not.toBeInTheDocument();
  });
});
