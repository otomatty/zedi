/**
 * NoteViewHeaderActions: ノート画面のヘッダー右上アクション。
 *
 * 共有モーダル廃止後は `/notes/:id/settings/*` へのエントリポイントとして
 * 機能する。Issue #675 の精神 (editor / viewer にもアクセス透明性を) を
 * 満たすため、ロール別に異なるアイコン / リンク先を提示する。
 *
 * テストの観点 / Coverage:
 *   - Owner: 歯車アイコン → `/notes/:id/settings`
 *   - Editor: 共有閲覧アイコン → `/notes/:id/settings/members` (read-only)
 *   - Viewer (canView=true): 共有閲覧アイコン → `/notes/:id/settings/visibility`
 *   - Guest / canView=false: 何もレンダリングしない
 *
 * Header-right actions on the note page. Renders a role-aware entry point
 * into `/notes/:id/settings/*`. Owners get a gear icon to general settings,
 * editors and viewers get a read-only "view share settings" icon landing on
 * the most relevant section for their role.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NoteViewHeaderActions } from "./NoteViewHeaderActions";
import type { Note, NoteAccessRole } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

const baseNote: Note = {
  id: "note-1",
  ownerUserId: "user-1",
  title: "Test note",
  visibility: "private",
  editPermission: "owner_only",
  isOfficial: false,
  isDefault: false,
  viewCount: 0,
  showTagFilterBar: false,
  defaultFilterTags: [],
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
};

function renderActions(props: Partial<React.ComponentProps<typeof NoteViewHeaderActions>> = {}) {
  const merged = {
    note: baseNote,
    canManageMembers: false,
    canView: false,
    userRole: "none" as NoteAccessRole,
    ...props,
  };
  return render(
    <MemoryRouter>
      <NoteViewHeaderActions {...merged} />
    </MemoryRouter>,
  );
}

describe("NoteViewHeaderActions", () => {
  it("owner には設定ページへ遷移する歯車アイコンを表示する", () => {
    renderActions({ canManageMembers: true, canView: true, userRole: "owner" });
    const link = screen.getByRole("link", { name: "notes.openSettings" });
    expect(link).toHaveAttribute("href", "/notes/note-1/settings");
  });

  it("editor には共有閲覧アイコンを表示し、members セクションへリンクする", () => {
    renderActions({ canManageMembers: false, canView: true, userRole: "editor" });
    const link = screen.getByRole("link", { name: "notes.openShareSettingsReadOnly" });
    expect(link).toHaveAttribute("href", "/notes/note-1/settings/members");
    // owner 向けの歯車アイコンは出ない
    expect(screen.queryByRole("link", { name: "notes.openSettings" })).not.toBeInTheDocument();
  });

  it("viewer には共有閲覧アイコンを表示し、visibility セクションへリンクする", () => {
    renderActions({ canManageMembers: false, canView: true, userRole: "viewer" });
    const link = screen.getByRole("link", { name: "notes.openShareSettingsReadOnly" });
    expect(link).toHaveAttribute("href", "/notes/note-1/settings/visibility");
  });

  it("canView=false の guest には何もレンダリングしない", () => {
    const { container } = renderActions({
      canManageMembers: false,
      canView: false,
      userRole: "guest",
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("canView=false の none (未ログイン) には何もレンダリングしない", () => {
    const { container } = renderActions({
      canManageMembers: false,
      canView: false,
      userRole: "none",
    });
    expect(container).toBeEmptyDOMElement();
  });
});
