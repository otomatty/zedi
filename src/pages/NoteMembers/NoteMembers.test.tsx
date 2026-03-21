/**
 * 仕様: docs/specs/app-layout-and-note-pages-spec.md §9.2, §9.3
 * ノートメンバー: 読み込み中／閲覧不可／canManageMembers 時は管理 UI、!canManageMembers 時は権限なしメッセージ。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NoteMembers from "./index";
import { useNote, useNoteMembers } from "@/hooks/useNoteQueries";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

vi.mock("@/hooks/useNoteQueries", () => ({
  useNote: vi.fn(),
  useNoteMembers: vi.fn(() => ({ data: [], isLoading: false })),
  useAddNoteMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateNoteMemberRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveNoteMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));
vi.mock("@/components/layout/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
}));
vi.mock("./NoteMembersManageSection", () => ({
  NoteMembersManageSection: () => <div data-testid="members-manage-section">ManageSection</div>,
}));

function renderNoteMembers(noteId: string) {
  return render(
    <MemoryRouter initialEntries={[`/note/${noteId}/members`]}>
      <Routes>
        <Route path="/note/:noteId/members" element={<NoteMembers />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoteMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNoteMembers).mockReturnValue({ data: [], isLoading: false } as never);
  });

  it("shows loading message when note is loading", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: true,
    } as never);
    renderNoteMembers("note-1");
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("shows not found or no access when note missing or no view access", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: false,
    } as never);
    renderNoteMembers("note-1");
    expect(screen.getByText("notes.noteNotFoundOrNoAccess")).toBeInTheDocument();
  });

  it("shows members heading and back to note link when note and access present", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note" },
      access: { canView: true, canManageMembers: true },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteMembers("note-1");
    expect(screen.getByRole("heading", { name: "notes.members" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "notes.backToNote" })).toHaveAttribute(
      "href",
      "/note/n1",
    );
  });

  it("shows no permission to manage members when canManageMembers is false", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note" },
      access: { canView: true, canManageMembers: false },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteMembers("note-1");
    expect(screen.getByText("notes.noPermissionToManageMembers")).toBeInTheDocument();
    expect(screen.queryByTestId("members-manage-section")).not.toBeInTheDocument();
  });

  it("shows manage section when canManageMembers is true", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note" },
      access: { canView: true, canManageMembers: true },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteMembers("note-1");
    expect(screen.getByTestId("members-manage-section")).toBeInTheDocument();
  });
});
