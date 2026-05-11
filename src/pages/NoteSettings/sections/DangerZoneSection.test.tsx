/**
 * DangerZoneSection: ノート削除セクション。
 *
 * 検証ポイント / Coverage:
 *   - owner: 削除ボタン → 確認ダイアログ → 確定で `useDeleteNote.mutateAsync(noteId)`
 *     が呼ばれ、成功時に `/notes` へ遷移
 *   - 非 owner: `noPermissionToEdit` メッセージのみ表示し、削除フォームは出ない
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import DangerZoneSection from "./DangerZoneSection";
import { NoteSettingsContext, type NoteSettingsContextValue } from "../NoteSettingsContext";
import { useDeleteNote } from "@/hooks/useNoteQueries";
import type { Note, NoteAccess } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? `${key}(${Object.entries(opts)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(",")})`
        : key,
    i18n: { language: "ja" },
  }),
}));

const toastMock = vi.fn();
vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: toastMock }),
  };
});

vi.mock("@/hooks/useNoteQueries", () => ({
  useDeleteNote: vi.fn(),
}));

const baseNote: Note = {
  id: "note-42",
  ownerUserId: "user-1",
  title: "My note",
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-pathname">{location.pathname}</div>;
}

function renderSection(value: NoteSettingsContextValue) {
  return render(
    <MemoryRouter initialEntries={[`/notes/${value.note.id}/settings/danger`]}>
      <Routes>
        <Route
          path="/notes/:noteId/settings/danger"
          element={
            <NoteSettingsContext.Provider value={value}>
              <DangerZoneSection />
              <LocationProbe />
            </NoteSettingsContext.Provider>
          }
        />
        <Route path="/notes" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DangerZoneSection", () => {
  let mutateAsync: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    toastMock.mockReset();
    mutateAsync = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useDeleteNote).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it("calls useDeleteNote on confirm and navigates to /notes", async () => {
    renderSection({
      note: baseNote,
      access: ownerAccess,
      role: "owner",
      canManage: true,
      canViewAsEditor: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "notes.deleteNote" }));
    fireEvent.click(screen.getByRole("button", { name: "notes.delete" }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith("note-42");
    });
    await waitFor(() => {
      expect(screen.getByTestId("location-pathname")).toHaveTextContent("/notes");
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.noteDeleted" });
  });

  it("renders the no-permission notice for non-owners and does not render the delete button", () => {
    renderSection({
      note: baseNote,
      access: { ...ownerAccess, role: "editor", canManageMembers: false },
      role: "editor",
      canManage: false,
      canViewAsEditor: true,
    });
    expect(screen.getByText("notes.noPermissionToEdit")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "notes.deleteNote" })).not.toBeInTheDocument();
  });
});
