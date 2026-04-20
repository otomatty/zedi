/**
 * MobileHeader: compact h-12 title bar that shows ONLY the search bar inline.
 * The logo, the search-sheet toggle, and the legacy desktop widgets
 * (AIChatButton / NavigationMenu / UnifiedMenu) must NOT render — their roles
 * have moved to the bottom nav.
 *
 * モバイルヘッダー: h-12 のタイトルバーに検索バーのみをインラインで描画する。
 * ロゴ・検索 Sheet のトグル・既存のデスクトップウィジェット（AIChatButton /
 * NavigationMenu / UnifiedMenu）は描画されない（役割はボトムナビへ移動）。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

// Mock the desktop-only widgets so we can detect (via the rendered placeholder)
// if MobileHeader regresses and starts importing/rendering them. The previous
// version of this test queried for test ids that were never produced by the
// real implementation, so the assertions trivially passed.
// デスクトップ専用ウィジェットをモックしておき、MobileHeader 側で誤って
// import / render するようになったら検出できるようにする。
const aiChatButtonMock = vi.fn(() => <div data-testid="ai-chat-btn">AI</div>);
const navigationMenuMock = vi.fn(() => <div data-testid="navigation-menu">Nav</div>);
const unifiedMenuMock = vi.fn(() => <div data-testid="unified-menu">Menu</div>);

vi.mock("./Header/AIChatButton", () => ({
  AIChatButton: () => aiChatButtonMock(),
}));
vi.mock("./Header/NavigationMenu", () => ({
  NavigationMenu: () => navigationMenuMock(),
}));
vi.mock("./Header/UnifiedMenu", () => ({
  UnifiedMenu: () => unifiedMenuMock(),
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <MobileHeader />
    </MemoryRouter>,
  );
}

describe("MobileHeader", () => {
  it("renders a compact h-12 sticky title bar", () => {
    const { container } = renderHeader();
    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
    expect(header?.className).toMatch(/h-12/);
    expect(header?.className).toMatch(/sticky/);
  });

  it("renders the search bar inline as the only header content", () => {
    renderHeader();
    // 検索バーはインラインで表示されているべき（Sheet の背後ではない）。
    // The search bar must be rendered inline, not behind a Sheet.
    expect(screen.getByTestId("header-search")).toBeInTheDocument();
  });

  it("does not render the logo (mobile header is search-only)", () => {
    renderHeader();
    expect(screen.queryByTestId("header-logo")).not.toBeInTheDocument();
  });

  it("does not expose a search sheet toggle button", () => {
    renderHeader();
    // 検索アイコンボタン（Sheet オープン用）は存在しないこと。
    // The search-sheet toggle icon button must not exist.
    expect(screen.queryByRole("button", { name: /search/i })).not.toBeInTheDocument();
  });

  it("does not render the desktop-only widgets", () => {
    aiChatButtonMock.mockClear();
    navigationMenuMock.mockClear();
    unifiedMenuMock.mockClear();
    renderHeader();
    // 描画ツリーに存在しないこと、かつコンポーネント自体が呼び出されてい
    // ないこと（誤 import 検出）を両方検証する。
    // Verify both that the placeholder is absent and that the component was
    // never invoked, so accidentally importing the desktop widgets later
    // would be caught.
    expect(screen.queryByTestId("ai-chat-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("navigation-menu")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unified-menu")).not.toBeInTheDocument();
    expect(aiChatButtonMock).not.toHaveBeenCalled();
    expect(navigationMenuMock).not.toHaveBeenCalled();
    expect(unifiedMenuMock).not.toHaveBeenCalled();
  });

  it("omits the search bar when no search context is provided", async () => {
    // When the global search context is not available (e.g. pre-auth
    // screens), the mobile header should render nothing interactive so it
    // behaves like a plain spacer.
    // GlobalSearchContext が無い画面（ログイン前など）では検索バーを出さず、
    // 単純なスペーサーのように振る舞うこと。
    vi.resetModules();
    vi.doMock("@/contexts/GlobalSearchContext", () => ({
      useGlobalSearchContextOptional: () => null,
    }));
    const { MobileHeader: FreshMobileHeader } = await import("./MobileHeader");
    render(
      <MemoryRouter>
        <FreshMobileHeader />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("header-search")).not.toBeInTheDocument();
    vi.doUnmock("@/contexts/GlobalSearchContext");
  });
});
