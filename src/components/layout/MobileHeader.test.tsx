/**
 * MobileHeader: compact h-12 title bar, search icon opens a Sheet, and the
 * legacy desktop widgets (AIChatButton / NavigationMenu / UnifiedMenu) must
 * NOT render — their roles moved to the bottom nav.
 *
 * モバイルヘッダー: h-12 のタイトルバー、検索アイコンから Sheet、そして
 * 既存のデスクトップウィジェット（AIChatButton / NavigationMenu / UnifiedMenu）
 * は描画されないことを検証する（役割はボトムナビへ移動）。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileHeader } from "./MobileHeader";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/contexts/GlobalSearchContext", () => ({
  useGlobalSearchContextOptional: () => ({}),
}));

vi.mock("./Header/HeaderSearchBar", () => ({
  HeaderSearchBar: () => <div data-testid="header-search">Search</div>,
}));

vi.mock("./Header/HeaderLogo", () => ({
  HeaderLogo: () => <div data-testid="header-logo">Logo</div>,
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <MobileHeader />
    </MemoryRouter>,
  );
}

describe("MobileHeader", () => {
  it("renders a compact h-12 title bar with the logo", () => {
    const { container } = renderHeader();
    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
    expect(header?.className).toMatch(/h-12/);
    expect(header?.className).toMatch(/sticky/);
    expect(screen.getByTestId("header-logo")).toBeInTheDocument();
  });

  it("does not render the desktop-only widgets", () => {
    renderHeader();
    expect(screen.queryByTestId("ai-chat-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("navigation-menu")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unified-menu")).not.toBeInTheDocument();
  });

  it("opens the search sheet when the search icon is tapped", async () => {
    renderHeader();
    const searchButton = screen.getByRole("button", { name: /search/i });
    fireEvent.click(searchButton);
    expect(await screen.findByTestId("header-search")).toBeInTheDocument();
  });
});
