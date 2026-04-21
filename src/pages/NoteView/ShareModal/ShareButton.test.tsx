/**
 * ShareButton のバッジ表示テスト。
 * Tests for the share button accepted-member badge.
 *
 * 観点 / Coverage:
 *   - accepted メンバー 0 のときバッジを表示しない
 *   - accepted メンバー 2 のときバッジに「2」を表示する
 *   - pending メンバーはカウントに含まない
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShareButton } from "./ShareButton";
import { useNoteMembers } from "@/hooks/useNoteQueries";
import type { Note, NoteMember } from "@/types/note";

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

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

vi.mock("@/hooks/useNoteQueries", () => ({
  useNoteMembers: vi.fn(() => ({ data: [], isLoading: false })),
  useAddNoteMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateNoteMemberRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveNoteMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResendInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useInviteLinks", () => ({
  useInviteLinksForNote: () => ({ data: [], isLoading: false }),
  useCreateInviteLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeInviteLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const note: Note = {
  id: "note-1",
  ownerUserId: "user-1",
  title: "Test note",
  visibility: "private",
  editPermission: "owner_only",
  isOfficial: false,
  viewCount: 0,
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
};

function mockMember(overrides: Partial<NoteMember>): NoteMember {
  return {
    noteId: "note-1",
    memberEmail: "x@example.com",
    role: "viewer",
    status: "pending",
    invitedByUserId: "user-1",
    createdAt: 0,
    updatedAt: 0,
    isDeleted: false,
    invitation: null,
    ...overrides,
  };
}

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ShareButton note={note} canManageMembers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ShareButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows no badge when there are no accepted members", () => {
    vi.mocked(useNoteMembers).mockReturnValue({
      data: [mockMember({ status: "pending" })],
      isLoading: false,
    } as never);
    renderButton();
    expect(screen.queryByLabelText(/notes\.shareMemberCountAria/)).not.toBeInTheDocument();
  });

  it("shows the accepted-member count as a badge", () => {
    vi.mocked(useNoteMembers).mockReturnValue({
      data: [
        mockMember({ status: "accepted", memberEmail: "a@example.com" }),
        mockMember({ status: "accepted", memberEmail: "b@example.com" }),
        mockMember({ status: "pending", memberEmail: "c@example.com" }),
      ],
      isLoading: false,
    } as never);
    renderButton();
    expect(screen.getByLabelText("notes.shareMemberCountAria(count=2)")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
