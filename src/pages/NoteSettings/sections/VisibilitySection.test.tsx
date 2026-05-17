/**
 * VisibilitySection: 公開範囲・編集権限の保存セクション。
 *
 * 旧 ShareModalVisibilityTab をサブルートに移植したもの。
 * useNoteSettingsSaveWithPublicConfirm の確認ダイアログ系は同フックの独自
 * テストで網羅済みのため、ここではセクション固有のスモークだけを確認する:
 * ノート設定の保存が呼ばれる、read-only 表示、unlisted の URL コピー、など。
 *
 * Smoke tests for the visibility section. Dual-dialog confirmation flow is
 * covered by the hook's own suite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VisibilitySection from "./VisibilitySection";
import { NoteSettingsContext, type NoteSettingsContextValue } from "../NoteSettingsContext";
import { useNoteSettingsSaveWithPublicConfirm } from "../useNoteSettingsSaveWithPublicConfirm";
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

vi.mock("../useNoteSettingsSaveWithPublicConfirm", () => ({
  useNoteSettingsSaveWithPublicConfirm: vi.fn(),
}));

vi.mock("../DefaultNotePublicWarningDialog", () => ({
  DefaultNotePublicWarningDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="default-note-warning-dialog" /> : null,
}));

vi.mock("../PublicAnyLoggedInSaveAlertDialog", () => ({
  PublicAnyLoggedInSaveAlertDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="public-any-loggedin-dialog" /> : null,
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

function renderSection(value: Partial<NoteSettingsContextValue> = {}, note: Note = baseNote) {
  const ctx: NoteSettingsContextValue = {
    note,
    access: ownerAccess,
    role: "owner",
    canManage: true,
    canViewAsEditor: false,
    ...value,
  };
  return render(
    <NoteSettingsContext.Provider value={ctx}>
      <VisibilitySection />
    </NoteSettingsContext.Provider>,
  );
}

describe("VisibilitySection", () => {
  let handleSaveNote: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toastMock.mockReset();
    handleSaveNote = vi.fn();
    vi.mocked(useNoteSettingsSaveWithPublicConfirm).mockReturnValue({
      handleSaveNote,
      confirmOpen: false,
      setConfirmOpen: vi.fn(),
      handleConfirmPublicAnyLoggedInSave: vi.fn(),
      defaultNoteWarningOpen: false,
      setDefaultNoteWarningOpen: vi.fn(),
      handleConfirmDefaultNoteWarning: vi.fn(),
      isSaving: false,
    } as never);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://zedi.example/notes/note-1"),
    });
  });

  it("disables save when nothing changed", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "notes.shareSaveChanges" })).toBeDisabled();
  });

  it("enables save and forwards visibility change to handleSaveNote", () => {
    renderSection();
    fireEvent.click(screen.getByLabelText("notes.visibilityUnlisted"));
    const save = screen.getByRole("button", { name: "notes.shareSaveChanges" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(handleSaveNote).toHaveBeenCalledTimes(1);
  });

  it("shows the unlisted URL copy block once unlisted is selected", () => {
    renderSection();
    fireEvent.click(screen.getByLabelText("notes.visibilityUnlisted"));
    expect(screen.getByText("notes.shareUnlistedUrlHint")).toBeInTheDocument();
    expect(screen.getByLabelText("notes.shareLink")).toHaveValue(
      "https://zedi.example/notes/note-1",
    );
  });

  it("copies the share URL on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderSection();
    fireEvent.click(screen.getByLabelText("notes.visibilityUnlisted"));
    fireEvent.click(screen.getByRole("button", { name: "notes.copy" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://zedi.example/notes/note-1");
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.linkCopied" });
  });

  it("hides the save button and shows read-only notice for non-owners", () => {
    renderSection({ canManage: false, role: "viewer" });
    expect(
      screen.queryByRole("button", { name: "notes.shareSaveChanges" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("notes.shareReadOnlyNotice")).toBeInTheDocument();
  });
});
