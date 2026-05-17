/**
 * MembersSection: 旧 NoteMembers ページの中身を設定画面のサブルートに取り込んだ
 * 薄いラッパー。`NoteMembersManageSection` 自体には専用テストがあるため、
 * ここでは「権限による表示分岐」のみを確認する。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MembersSection from "./MembersSection";
import { NoteSettingsContext, type NoteSettingsContextValue } from "../NoteSettingsContext";
import type { Note, NoteAccess } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/pages/NoteMembers/NoteMembersManageSection", () => ({
  NoteMembersManageSection: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="members-manage-section" data-read-only={String(readOnly)} />
  ),
}));

vi.mock("@/pages/NoteMembers/useNoteMembersController", () => ({
  useNoteMembersController: () => ({
    members: [],
    isMembersLoading: false,
    memberEmail: "",
    setMemberEmail: vi.fn(),
    memberRole: "viewer",
    setMemberRole: vi.fn(),
    roleOptions: [],
    handleAddMember: vi.fn(),
    handleUpdateMemberRole: vi.fn(),
    handleRemoveMember: vi.fn(),
    handleResendInvitation: vi.fn(),
  }),
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
  showTagFilterBar: false,
  defaultFilterTags: [],
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
      <MembersSection />
    </NoteSettingsContext.Provider>,
  );
}

describe("MembersSection", () => {
  it("renders the manage section editable for owners", () => {
    renderSection({
      note: baseNote,
      access: ownerAccess,
      role: "owner",
      canManage: true,
      canViewAsEditor: false,
    });
    expect(screen.getByTestId("members-manage-section")).toHaveAttribute("data-read-only", "false");
  });

  it("renders the manage section read-only for editors", () => {
    renderSection({
      note: baseNote,
      access: { ...ownerAccess, role: "editor", canManageMembers: false },
      role: "editor",
      canManage: false,
      canViewAsEditor: true,
    });
    expect(screen.getByTestId("members-manage-section")).toHaveAttribute("data-read-only", "true");
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
    expect(screen.queryByTestId("members-manage-section")).not.toBeInTheDocument();
  });
});
