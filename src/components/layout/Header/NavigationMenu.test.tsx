/**
 * Tests for {@link NavigationMenu}, the header dropdown that consolidates the
 * functional navigation (Home / Notes) into a single trigger with a grid of
 * icon-plus-label tiles.
 *
 * ヘッダーの機能ナビゲーション（Home / Notes）を 1 つのドロップダウンに集約した
 * {@link NavigationMenu} のテスト。タイル型（アイコン + ラベル）を検証する。
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
  });

  it("reveals Home and Notes links after opening", async () => {
    const user = userEvent.setup();
    renderAt("/home");
    await user.click(screen.getByRole("button", { name: "メニュー" }));

    const homeLink = await screen.findByRole("menuitem", { name: "ホーム" });
    const notesLink = await screen.findByRole("menuitem", { name: "ノート" });

    expect(homeLink).toHaveAttribute("href", "/home");
    expect(notesLink).toHaveAttribute("href", "/notes");
  });

  it("applies active styling to the item matching the current route", async () => {
    const user = userEvent.setup();
    renderAt("/notes");
    await user.click(screen.getByRole("button", { name: "メニュー" }));

    const notesLink = await screen.findByRole("menuitem", { name: "ノート" });
    const homeLink = await screen.findByRole("menuitem", { name: "ホーム" });

    expect(notesLink.className).toMatch(/bg-accent/);
    expect(homeLink.className).not.toMatch(/bg-accent/);
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
