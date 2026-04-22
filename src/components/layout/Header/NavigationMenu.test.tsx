/**
 * Tests for {@link NavigationMenu}, the header dropdown that consolidates the
 * primary navigation (Home / Notes / AI) into a single trigger with a grid of
 * icon-plus-label tiles. The entries come from the shared
 * {@link PRIMARY_NAV_ITEMS} config so the header and the mobile bottom
 * navigation stay in sync.
 *
 * ヘッダーの機能ナビゲーション（Home / Notes / AI）を 1 つのドロップダウンに集約した
 * {@link NavigationMenu} のテスト。項目は共通の {@link PRIMARY_NAV_ITEMS} を参照し、
 * ヘッダーとモバイルボトムナビの表示項目が常に一致することを保証する。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NavigationMenu } from "./NavigationMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const table: Record<string, string> = {
        "nav.menu": "メニュー",
        "nav.home": "ホーム",
        "nav.notes": "ノート",
        "nav.ai": "AI",
      };
      return table[key] ?? fallback ?? key;
    },
    i18n: { language: "ja" },
  }),
}));

vi.mock("@zedi/ui", async () => {
  const actual = await vi.importActual<typeof import("@zedi/ui")>("@zedi/ui");
  return {
    ...actual,
    useIsMobile: vi.fn(() => false),
  };
});

import { useIsMobile } from "@zedi/ui";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavigationMenu />
    </MemoryRouter>,
  );
}

describe("NavigationMenu", () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the trigger with the menu aria-label", () => {
    renderAt("/home");
    expect(screen.getByRole("button", { name: "メニュー" })).toBeInTheDocument();
  });

  it("does not render nav items until the trigger is clicked", () => {
    renderAt("/home");
    expect(screen.queryByRole("link", { name: "ホーム" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ノート" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI" })).not.toBeInTheDocument();
  });

  it("reveals Home, Notes, and AI links after opening", async () => {
    const user = userEvent.setup();
    renderAt("/home");
    await user.click(screen.getByRole("button", { name: "メニュー" }));

    const homeLink = await screen.findByRole("menuitem", { name: "ホーム" });
    const notesLink = await screen.findByRole("menuitem", { name: "ノート" });
    const aiLink = await screen.findByRole("menuitem", { name: "AI" });

    expect(homeLink).toHaveAttribute("href", "/home");
    expect(notesLink).toHaveAttribute("href", "/notes");
    expect(aiLink).toHaveAttribute("href", "/ai");
  });

  it("does not vary item styling based on the current route", async () => {
    const user = userEvent.setup();

    // Render at /home first, capture class names for both tiles.
    // /home で描画し、両タイルの className を取得する。
    const firstRender = renderAt("/home");
    await user.click(screen.getByRole("button", { name: "メニュー" }));
    const homeOnHome = await screen.findByRole("menuitem", { name: "ホーム" });
    const notesOnHome = await screen.findByRole("menuitem", { name: "ノート" });
    const homeClassOnHome = homeOnHome.className;
    const notesClassOnHome = notesOnHome.className;
    firstRender.unmount();

    // Re-render at /notes and compare the same tiles.
    // /notes で再描画し、同じタイル同士で比較する。
    renderAt("/notes");
    await user.click(screen.getByRole("button", { name: "メニュー" }));

    const notesOnNotes = await screen.findByRole("menuitem", { name: "ノート" });
    const homeOnNotes = await screen.findByRole("menuitem", { name: "ホーム" });

    // No active-state classes should be applied based on the current path.
    // 現在のパスに応じたアクティブ状態のクラスが付与されていないことを確認する。
    expect(notesOnNotes.className).not.toMatch(/bg-accent/);
    expect(homeOnNotes.className).not.toMatch(/bg-accent/);

    // Same tile renders with an identical className regardless of the route.
    // 同一タイルの className がルートに関わらず一致することを保証する。
    expect(homeOnNotes.className).toBe(homeClassOnHome);
    expect(notesOnNotes.className).toBe(notesClassOnHome);
    expect(notesOnNotes.className).toBe(homeOnNotes.className);
  });

  it("renders a Sheet-based menu on mobile", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const user = userEvent.setup();
    renderAt("/home");

    await user.click(screen.getByRole("button", { name: "メニュー" }));

    const homeLink = await screen.findByRole("link", { name: "ホーム" });
    expect(homeLink).toHaveAttribute("href", "/home");
  });
});
