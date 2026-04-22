/**
 * Note settings: loading / no access / canManage shows share, visibility, delete; otherwise permission message.
 * ノート設定: 読み込み中／閲覧不可／canManage 時は共有・公開範囲・削除、!canManage 時は権限なしメッセージ。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NoteSettings from "./index";
import { useNote } from "@/hooks/useNoteQueries";

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
  useUpdateNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
vi.mock("./NoteSettingsShareSection", () => ({
  NoteSettingsShareSection: () => <div data-testid="share-section">ShareSection</div>,
}));
vi.mock("./NoteSettingsVisibilitySection", () => ({
  NoteSettingsVisibilitySection: () => (
    <div data-testid="visibility-section">VisibilitySection</div>
  ),
}));
vi.mock("./NoteSettingsDeleteSection", () => ({
  NoteSettingsDeleteSection: () => <div data-testid="delete-section">DeleteSection</div>,
}));

function renderNoteSettings(noteId: string) {
  return render(
    <MemoryRouter initialEntries={[`/notes/${noteId}/settings`]}>
      <Routes>
        <Route path="/notes/:noteId/settings" element={<NoteSettings />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoteSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: false,
    } as never);
  });

  it("shows loading message when note is loading", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: true,
    } as never);
    renderNoteSettings("note-1");
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("shows not found or no access when note missing or no view access", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: false,
    } as never);
    renderNoteSettings("note-1");
    expect(screen.getByText("notes.noteNotFoundOrNoAccess")).toBeInTheDocument();
  });

  it("shows note settings heading and back to note link when note and access present", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note", visibility: "private", editPermission: "owner_only" },
      access: { canView: true, canManageMembers: true },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteSettings("note-1");
    expect(screen.getByRole("heading", { name: "notes.noteSettings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "notes.backToNote" })).toHaveAttribute(
      "href",
      "/notes/n1",
    );
  });

  it("shows no permission message when canManage is false", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note", visibility: "private", editPermission: "owner_only" },
      access: { canView: true, canManageMembers: false },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteSettings("note-1");
    expect(screen.getByText("notes.noPermissionToEdit")).toBeInTheDocument();
    expect(screen.queryByTestId("share-section")).not.toBeInTheDocument();
  });

  it("shows share, visibility, and delete sections when canManage is true", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note", visibility: "private", editPermission: "owner_only" },
      access: { canView: true, canManageMembers: true },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteSettings("note-1");
    expect(screen.getByTestId("share-section")).toBeInTheDocument();
    expect(screen.getByTestId("visibility-section")).toBeInTheDocument();
    expect(screen.getByTestId("delete-section")).toBeInTheDocument();
  });
});
