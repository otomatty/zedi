/**
 * Save flow chains the default-note warning (issue #830) with the existing
 * `public + any_logged_in` warning. Title-only edits (and saves that stay
 * private) skip both dialogs.
 *
 * 保存フローは既定ノート公開警告（#830）と既存の `public + any_logged_in` 警告を
 * 直列に表示する。タイトル変更だけ・private のままの保存はどちらも出さない。
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/types/note";
import { useNoteSettingsSaveWithPublicConfirm } from "./useNoteSettingsSaveWithPublicConfirm";

const mutateAsyncMock = vi.fn();
const toastMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@zedi/ui", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useUpdateNote: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

const baseDefaultNote: Note = {
  id: "note-default",
  ownerUserId: "user-1",
  title: "user のノート",
  visibility: "private",
  editPermission: "owner_only",
  isOfficial: false,
  isDefault: true,
  viewCount: 0,
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
};

const baseRegularNote: Note = {
  ...baseDefaultNote,
  id: "note-regular",
  title: "Some shared note",
  isDefault: false,
};

beforeEach(() => {
  mutateAsyncMock.mockReset();
  mutateAsyncMock.mockResolvedValue(undefined);
  toastMock.mockReset();
});

describe("useNoteSettingsSaveWithPublicConfirm", () => {
  it("saves immediately when nothing risky changes (private default note, title only)", async () => {
    const { result } = renderHook(() =>
      useNoteSettingsSaveWithPublicConfirm({
        noteId: baseDefaultNote.id,
        note: baseDefaultNote,
        title: "Renamed",
        visibility: "private",
        editPermission: "owner_only",
      }),
    );

    act(() => {
      result.current.handleSaveNote();
    });

    expect(result.current.defaultNoteWarningOpen).toBe(false);
    expect(result.current.confirmOpen).toBe(false);
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
  });

  it("opens the default-note warning when flipping default note to public", () => {
    const { result } = renderHook(() =>
      useNoteSettingsSaveWithPublicConfirm({
        noteId: baseDefaultNote.id,
        note: baseDefaultNote,
        title: baseDefaultNote.title,
        visibility: "public",
        editPermission: "owner_only",
      }),
    );

    act(() => {
      result.current.handleSaveNote();
    });

    expect(result.current.defaultNoteWarningOpen).toBe(true);
    expect(result.current.confirmOpen).toBe(false);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("opens the default-note warning when flipping default note to unlisted", () => {
    const { result } = renderHook(() =>
      useNoteSettingsSaveWithPublicConfirm({
        noteId: baseDefaultNote.id,
        note: baseDefaultNote,
        title: baseDefaultNote.title,
        visibility: "unlisted",
        editPermission: "owner_only",
      }),
    );

    act(() => {
      result.current.handleSaveNote();
    });

    expect(result.current.defaultNoteWarningOpen).toBe(true);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("does not open the default-note warning for non-default notes going public", () => {
    const { result } = renderHook(() =>
      useNoteSettingsSaveWithPublicConfirm({
        noteId: baseRegularNote.id,
        note: baseRegularNote,
        title: baseRegularNote.title,
        visibility: "public",
        editPermission: "owner_only",
      }),
    );

    act(() => {
      result.current.handleSaveNote();
    });

    expect(result.current.defaultNoteWarningOpen).toBe(false);
  });

  it("cancelling the default-note warning leaves form state untouched and skips the save", () => {
    const { result } = renderHook(() =>
      useNoteSettingsSaveWithPublicConfirm({
        noteId: baseDefaultNote.id,
        note: baseDefaultNote,
        title: baseDefaultNote.title,
        visibility: "public",
        editPermission: "owner_only",
      }),
    );

    act(() => {
      result.current.handleSaveNote();
    });
    expect(result.current.defaultNoteWarningOpen).toBe(true);

    act(() => {
      result.current.setDefaultNoteWarningOpen(false);
    });

    expect(result.current.defaultNoteWarningOpen).toBe(false);
    expect(result.current.confirmOpen).toBe(false);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("confirming the default-note warning saves directly when no any_logged_in dialog applies", async () => {
    const { result } = renderHook(() =>
      useNoteSettingsSaveWithPublicConfirm({
        noteId: baseDefaultNote.id,
        note: baseDefaultNote,
        title: baseDefaultNote.title,
        visibility: "public",
        editPermission: "owner_only",
      }),
    );

    act(() => {
      result.current.handleSaveNote();
    });
    expect(result.current.defaultNoteWarningOpen).toBe(true);

    act(() => {
      result.current.handleConfirmDefaultNoteWarning();
    });

    expect(result.current.defaultNoteWarningOpen).toBe(false);
    expect(result.current.confirmOpen).toBe(false);
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
  });

  it("chains into the any_logged_in confirm dialog when both warnings apply", async () => {
    const { result } = renderHook(() =>
      useNoteSettingsSaveWithPublicConfirm({
        noteId: baseDefaultNote.id,
        note: baseDefaultNote,
        title: baseDefaultNote.title,
        visibility: "public",
        editPermission: "any_logged_in",
      }),
    );

    act(() => {
      result.current.handleSaveNote();
    });
    expect(result.current.defaultNoteWarningOpen).toBe(true);
    expect(result.current.confirmOpen).toBe(false);

    act(() => {
      result.current.handleConfirmDefaultNoteWarning();
    });

    expect(result.current.defaultNoteWarningOpen).toBe(false);
    expect(result.current.confirmOpen).toBe(true);
    expect(mutateAsyncMock).not.toHaveBeenCalled();

    act(() => {
      result.current.handleConfirmPublicAnyLoggedInSave();
    });

    expect(result.current.confirmOpen).toBe(false);
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
  });

  it("blocks saving with an empty title and surfaces the toast", () => {
    const { result } = renderHook(() =>
      useNoteSettingsSaveWithPublicConfirm({
        noteId: baseDefaultNote.id,
        note: baseDefaultNote,
        title: "   ",
        visibility: "private",
        editPermission: "owner_only",
      }),
    );

    act(() => {
      result.current.handleSaveNote();
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "notes.titleRequired", variant: "destructive" }),
    );
    expect(result.current.defaultNoteWarningOpen).toBe(false);
    expect(result.current.confirmOpen).toBe(false);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
