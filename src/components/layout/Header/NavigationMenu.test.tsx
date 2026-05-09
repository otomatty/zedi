/**
 * Tests for {@link NavigationMenu}, the header dropdown that consolidates the
 * primary navigation (My Note / Notes / AI) into a single trigger with a grid
 * of icon-plus-label tiles. The entries come from the shared
 * {@link PRIMARY_NAV_ITEMS} config so the header and the mobile bottom
 * navigation stay in sync.
 *
 * ヘッダーの機能ナビゲーション（マイノート / ノート / AI）を 1 つのドロップダウンに集約した
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
        "nav.myNote": "マイノート",
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
    renderAt("/notes/me");
    expect(screen.getByRole("button", { name: "メニュー" })).toBeInTheDocument();
  });

  it("does not render nav items until the trigger is clicked", () => {
    renderAt("/notes/me");
    expect(screen.queryByRole("link", { name: "マイノート" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ノート" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI" })).not.toBeInTheDocument();
  });

  it("reveals My Note, Notes, and AI links after opening", async () => {
    const user = userEvent.setup();
    renderAt("/notes/me");
    await user.click(screen.getByRole("button", { name: "メニュー" }));

    const myNoteLink = await screen.findByRole("menuitem", { name: "マイノート" });
    const notesLink = await screen.findByRole("menuitem", { name: "ノート" });
    const aiLink = await screen.findByRole("menuitem", { name: "AI" });

    expect(myNoteLink).toHaveAttribute("href", "/notes/me");
    expect(notesLink).toHaveAttribute("href", "/notes");
    expect(aiLink).toHaveAttribute("href", "/ai");
  });

  it("does not vary item styling based on the current route", async () => {
    const user = userEvent.setup();

    // Render at /notes/me first, capture class names for both tiles.
    // /notes/me で描画し、両タイルの className を取得する。
    const firstRender = renderAt("/notes/me");
    await user.click(screen.getByRole("button", { name: "メニュー" }));
    const myNoteOnLanding = await screen.findByRole("menuitem", { name: "マイノート" });
    const notesOnLanding = await screen.findByRole("menuitem", { name: "ノート" });
    const myNoteClassOnLanding = myNoteOnLanding.className;
    const notesClassOnLanding = notesOnLanding.className;
    firstRender.unmount();

    // Re-render at /notes and compare the same tiles.
    // /notes で再描画し、同じタイル同士で比較する。
    renderAt("/notes");
    await user.click(screen.getByRole("button", { name: "メニュー" }));

    const notesOnNotes = await screen.findByRole("menuitem", { name: "ノート" });
    const myNoteOnNotes = await screen.findByRole("menuitem", { name: "マイノート" });

    // No active-state classes should be applied based on the current path.
    // 現在のパスに応じたアクティブ状態のクラスが付与されていないことを確認する。
    expect(notesOnNotes.className).not.toMatch(/bg-accent/);
    expect(myNoteOnNotes.className).not.toMatch(/bg-accent/);

    // Same tile renders with an identical className regardless of the route.
    // 同一タイルの className がルートに関わらず一致することを保証する。
    expect(myNoteOnNotes.className).toBe(myNoteClassOnLanding);
    expect(notesOnNotes.className).toBe(notesClassOnLanding);
    expect(notesOnNotes.className).toBe(myNoteOnNotes.className);
  });

  it("renders a Sheet-based menu on mobile", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const user = userEvent.setup();
    renderAt("/notes/me");

    await user.click(screen.getByRole("button", { name: "メニュー" }));

    const myNoteLink = await screen.findByRole("link", { name: "マイノート" });
    expect(myNoteLink).toHaveAttribute("href", "/notes/me");
  });
});
