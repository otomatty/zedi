/**
 * GeneralSection: タイトル編集セクション。
 *
 * 検証ポイント / Coverage:
 *   - owner はタイトル入力 + 保存ボタンを操作できる
 *   - 空タイトル保存はエラートースト + mutate 呼ばれない
 *   - dirty でないときボタンは disabled
 *   - read-only（非 owner）では Input が readonly + 保存ボタン非表示
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GeneralSection from "./GeneralSection";
import { NoteSettingsContext, type NoteSettingsContextValue } from "../NoteSettingsContext";
import { useUpdateNote } from "@/hooks/useNoteQueries";
import type { Note, NoteAccess } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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
  useUpdateNote: vi.fn(),
}));

const baseNote: Note = {
  id: "note-1",
  ownerUserId: "user-1",
  title: "Original",
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

function renderSection(overrides: Partial<NoteSettingsContextValue> = {}) {
  const value: NoteSettingsContextValue = {
    note: baseNote,
    access: ownerAccess,
    role: "owner",
    canManage: true,
    canViewAsEditor: false,
    ...overrides,
  };
  return render(
    <NoteSettingsContext.Provider value={value}>
      <GeneralSection />
    </NoteSettingsContext.Provider>,
  );
}

describe("GeneralSection", () => {
  let mutateAsync: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    toastMock.mockReset();
    mutateAsync = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useUpdateNote).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it("renders the current title and disables save while dirty=false", () => {
    renderSection();
    const input = screen.getByLabelText("notes.noteTitle") as HTMLInputElement;
    expect(input.value).toBe("Original");
    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
  });

  it("enables save once the title changes and persists via useUpdateNote", async () => {
    renderSection();
    const input = screen.getByLabelText("notes.noteTitle");
    fireEvent.change(input, { target: { value: "Updated" } });
    const save = screen.getByRole("button", { name: "common.save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        noteId: "note-1",
        updates: { title: "Updated" },
      });
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.noteUpdated" });
  });

  it("rejects an empty title with a destructive toast and no API call", async () => {
    renderSection();
    const input = screen.getByLabelText("notes.noteTitle");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "notes.titleRequired",
        variant: "destructive",
      });
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("renders read-only and hides the save button for non-owners", () => {
    renderSection({ canManage: false, role: "editor", canViewAsEditor: true });
    const input = screen.getByLabelText("notes.noteTitle") as HTMLInputElement;
    expect(input).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "common.save" })).not.toBeInTheDocument();
    expect(screen.getByText("notes.shareReadOnlyNotice")).toBeInTheDocument();
  });
});
