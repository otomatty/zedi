/**
 * NoteViewHeaderActions: ノート画面のヘッダー右上アクション。
 *
 * 旧仕様（共有モーダル + 設定リンクの 2 系統）から「歯車アイコン 1 個」に
 * 簡素化済み。テストの観点 / Coverage:
 *   - Owner: 設定ページ (`/notes/:id/settings`) へ遷移する歯車リンクを表示
 *   - Editor / Viewer / Guest: 何もレンダリングしない（共有モーダル廃止）
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
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
};

function renderActions(props: Partial<React.ComponentProps<typeof NoteViewHeaderActions>> = {}) {
  const merged = {
    note: baseNote,
    canManageMembers: false,
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
    renderActions({ canManageMembers: true, userRole: "owner" });
    const link = screen.getByRole("link", { name: "notes.openSettings" });
    expect(link).toHaveAttribute("href", "/notes/note-1/settings");
  });

  it("editor には何もレンダリングしない（設定画面の編集権限を持たないため）", () => {
    const { container } = renderActions({ canManageMembers: false, userRole: "editor" });
    expect(container).toBeEmptyDOMElement();
  });

  it("viewer には何もレンダリングしない", () => {
    const { container } = renderActions({ canManageMembers: false, userRole: "viewer" });
    expect(container).toBeEmptyDOMElement();
  });

  it("guest (canManageMembers=false) でも何もレンダリングしない", () => {
    const { container } = renderActions({ canManageMembers: false, userRole: "guest" });
    expect(container).toBeEmptyDOMElement();
  });
});
