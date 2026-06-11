/**
 * useNoteMembersController: メンバー招待・ロール変更・削除・再送のハンドラ契約。
 * Tests controller hook handlers for member invite, role update, remove, and resend.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNoteMembersController } from "./useNoteMembersController";
import {
  useAddNoteMember,
  useNoteMembers,
  useRemoveNoteMember,
  useResendInvitation,
  useUpdateNoteMemberRole,
} from "@/hooks/notes/useNoteQueries";
import type { NoteMember } from "@/types/note";

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

vi.mock("@/hooks/notes/useNoteQueries", () => ({
  useNoteMembers: vi.fn(),
  useAddNoteMember: vi.fn(),
  useUpdateNoteMemberRole: vi.fn(),
  useRemoveNoteMember: vi.fn(),
  useResendInvitation: vi.fn(),
}));

const sampleMember: NoteMember = {
  noteId: "note-1",
  memberEmail: "guest@example.com",
  role: "viewer",
  status: "pending",
  invitedByUserId: "user-1",
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
  invitation: null,
};

describe("useNoteMembersController", () => {
  let addMutateAsync: ReturnType<typeof vi.fn>;
  let updateMutateAsync: ReturnType<typeof vi.fn>;
  let removeMutateAsync: ReturnType<typeof vi.fn>;
  let resendMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toastMock.mockReset();
    addMutateAsync = vi.fn().mockResolvedValue(undefined);
    updateMutateAsync = vi.fn().mockResolvedValue(undefined);
    removeMutateAsync = vi.fn().mockResolvedValue(undefined);
    resendMutateAsync = vi.fn().mockResolvedValue({ resent: true });

    vi.mocked(useNoteMembers).mockReturnValue({
      data: [sampleMember],
      isLoading: false,
    } as never);
    vi.mocked(useAddNoteMember).mockReturnValue({
      mutateAsync: addMutateAsync,
    } as never);
    vi.mocked(useUpdateNoteMemberRole).mockReturnValue({
      mutateAsync: updateMutateAsync,
    } as never);
    vi.mocked(useRemoveNoteMember).mockReturnValue({
      mutateAsync: removeMutateAsync,
    } as never);
    vi.mocked(useResendInvitation).mockReturnValue({
      mutateAsync: resendMutateAsync,
    } as never);
  });

  it("starts with empty email and viewer role", () => {
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    expect(result.current.memberEmail).toBe("");
    expect(result.current.memberRole).toBe("viewer");
    expect(result.current.members).toEqual([sampleMember]);
    expect(result.current.isMembersLoading).toBe(false);
  });

  it("exposes translated role options for viewer and editor", () => {
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    expect(result.current.roleOptions).toEqual([
      { value: "viewer", label: "notes.roleViewer" },
      { value: "editor", label: "notes.roleEditor" },
    ]);
  });

  it("does not fetch members when enabled is false", () => {
    vi.mocked(useNoteMembers).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never);

    const { result } = renderHook(() => useNoteMembersController("note-1", false));

    expect(result.current.members).toEqual([]);
    expect(result.current.isMembersLoading).toBe(false);
  });

  it("skips add when email is blank and does not call API", async () => {
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(addMutateAsync).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("skips add when noteId is empty", async () => {
    const { result } = renderHook(() => useNoteMembersController("", true));

    act(() => {
      result.current.setMemberEmail("guest@example.com");
    });

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(addMutateAsync).not.toHaveBeenCalled();
  });

  it("adds a member with trimmed email and resets form on success", async () => {
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    act(() => {
      result.current.setMemberEmail("  guest@example.com  ");
      result.current.setMemberRole("editor");
    });

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(addMutateAsync).toHaveBeenCalledWith({
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "editor",
    });
    expect(result.current.memberEmail).toBe("");
    expect(result.current.memberRole).toBe("viewer");
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.memberAdded" });
  });

  it("keeps form values and shows destructive toast when add fails", async () => {
    addMutateAsync.mockRejectedValueOnce(new Error("conflict"));
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    act(() => {
      result.current.setMemberEmail("guest@example.com");
      result.current.setMemberRole("editor");
    });

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(result.current.memberEmail).toBe("guest@example.com");
    expect(result.current.memberRole).toBe("editor");
    expect(toastMock).toHaveBeenCalledWith({
      title: "notes.memberAddFailed",
      variant: "destructive",
    });
  });

  it("updates member role and toasts on success", async () => {
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await act(async () => {
      await result.current.handleUpdateMemberRole("guest@example.com", "editor");
    });

    expect(updateMutateAsync).toHaveBeenCalledWith({
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "editor",
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.roleUpdated" });
  });

  it("shows destructive toast when role update fails", async () => {
    updateMutateAsync.mockRejectedValueOnce(new Error("forbidden"));
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await act(async () => {
      await result.current.handleUpdateMemberRole("guest@example.com", "editor");
    });

    expect(toastMock).toHaveBeenCalledWith({
      title: "notes.roleUpdateFailed",
      variant: "destructive",
    });
  });

  it("skips role update when noteId is empty", async () => {
    const { result } = renderHook(() => useNoteMembersController("", true));

    await act(async () => {
      await result.current.handleUpdateMemberRole("guest@example.com", "editor");
    });

    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("removes a member and toasts on success", async () => {
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await act(async () => {
      await result.current.handleRemoveMember("guest@example.com");
    });

    expect(removeMutateAsync).toHaveBeenCalledWith({
      noteId: "note-1",
      memberEmail: "guest@example.com",
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.memberRemoved" });
  });

  it("shows destructive toast when remove fails", async () => {
    removeMutateAsync.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await act(async () => {
      await result.current.handleRemoveMember("guest@example.com");
    });

    expect(toastMock).toHaveBeenCalledWith({
      title: "notes.memberRemoveFailed",
      variant: "destructive",
    });
  });

  it("resends invitation and toasts success when resent is true", async () => {
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await act(async () => {
      await result.current.handleResendInvitation("guest@example.com");
    });

    expect(resendMutateAsync).toHaveBeenCalledWith({
      noteId: "note-1",
      memberEmail: "guest@example.com",
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.resendInvitationSuccess" });
  });

  it("shows destructive toast when resend returns resent=false", async () => {
    resendMutateAsync.mockResolvedValueOnce({ resent: false });
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await act(async () => {
      await result.current.handleResendInvitation("guest@example.com");
    });

    expect(toastMock).toHaveBeenCalledWith({
      title: "notes.resendInvitationFailed",
      variant: "destructive",
    });
  });

  it("shows destructive toast when resend throws", async () => {
    resendMutateAsync.mockRejectedValueOnce(new Error("smtp"));
    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await act(async () => {
      await result.current.handleResendInvitation("guest@example.com");
    });

    expect(toastMock).toHaveBeenCalledWith({
      title: "notes.resendInvitationFailed",
      variant: "destructive",
    });
  });

  it("reflects loading state from useNoteMembers", async () => {
    vi.mocked(useNoteMembers).mockReturnValue({
      data: [],
      isLoading: true,
    } as never);

    const { result } = renderHook(() => useNoteMembersController("note-1", true));

    await waitFor(() => {
      expect(result.current.isMembersLoading).toBe(true);
    });
    expect(result.current.members).toEqual([]);
  });
});
