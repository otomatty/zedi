/**
 * LinksSection: `NoteInviteLinksSection` を包む薄いラッパー。
 * 権限による表示分岐と read-only フラグの伝播だけを確認する。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LinksSection from "./LinksSection";
import { NoteSettingsContext, type NoteSettingsContextValue } from "../NoteSettingsContext";
import type { Note, NoteAccess } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/pages/NoteMembers/NoteInviteLinksSection", () => ({
  NoteInviteLinksSection: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="invite-links-section" data-read-only={String(readOnly)} />
  ),
}));

const baseNote: Note = {
  id: "note-1",
  ownerUserId: "user-1",
  title: "Note",
  visibility: "private",
  editPermission: "owner_only",
  isOfficial: false,
  isDefault: false,
  viewCount: 0,
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
};

const ownerAccess: NoteAccess = {
  role: "owner",
  visibility: "private",
  editPermission: "owner_only",
  canView: true,
  canEdit: true,
  canAddPage: true,
  canManageMembers: true,
  canDeletePage: () => true,
};

function renderSection(value: NoteSettingsContextValue) {
  return render(
    <NoteSettingsContext.Provider value={value}>
      <LinksSection />
    </NoteSettingsContext.Provider>,
  );
}

describe("LinksSection", () => {
  it("renders editable invite links for owners", () => {
    renderSection({
      note: baseNote,
      access: ownerAccess,
      role: "owner",
      canManage: true,
      canViewAsEditor: false,
    });
    expect(screen.getByTestId("invite-links-section")).toHaveAttribute("data-read-only", "false");
  });

  it("renders invite links read-only for editors", () => {
    renderSection({
      note: baseNote,
      access: { ...ownerAccess, role: "editor", canManageMembers: false },
      role: "editor",
      canManage: false,
      canViewAsEditor: true,
    });
    expect(screen.getByTestId("invite-links-section")).toHaveAttribute("data-read-only", "true");
  });

  it("shows no-permission notice for viewers", () => {
    renderSection({
      note: baseNote,
      access: { ...ownerAccess, role: "viewer", canManageMembers: false },
      role: "viewer",
      canManage: false,
      canViewAsEditor: false,
    });
    expect(screen.getByText("notes.noPermissionToManageMembers")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-links-section")).not.toBeInTheDocument();
  });
});
