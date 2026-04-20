/**
 * NoteShareModal のタブ構造テスト。
 * Tests for the NoteShareModal tab structure.
 *
 * 観点 / Coverage:
 *   - 基本タブ (メンバー / リンク / 公開設定) が表示される
 *   - ドメインタブは showDomainsTab が true のときのみ表示される
 *   - モーダルが閉じているときは hidden 状態
 *   - 公開設定タブで visibility が unlisted のとき共有 URL フィールドが表示される
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteShareModal } from "./NoteShareModal";
import type { Note } from "@/types/note";

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

const baseNote: Note = {
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

function renderModal(props: Partial<React.ComponentProps<typeof NoteShareModal>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NoteShareModal open onOpenChange={() => {}} note={baseNote} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NoteShareModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders members, links, and visibility tabs by default", () => {
    renderModal();
    expect(screen.getByRole("tab", { name: "notes.shareTabMembers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabLinks" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabVisibility" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "notes.shareTabDomains" })).not.toBeInTheDocument();
  });

  it("shows domains tab when showDomainsTab is true", () => {
    renderModal({ showDomainsTab: true });
    expect(screen.getByRole("tab", { name: "notes.shareTabDomains" })).toBeInTheDocument();
  });

  it("renders nothing visible when open is false", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("tab", { name: "notes.shareTabMembers" })).not.toBeInTheDocument();
  });

  it("renders the members-page link inside the members tab", () => {
    renderModal();
    expect(screen.getByRole("link", { name: /notes\.shareOpenMembersPage/ })).toHaveAttribute(
      "href",
      "/note/note-1/members",
    );
  });

  it("renders the share URL field on visibility tab when note is unlisted", async () => {
    const user = userEvent.setup();
    renderModal({ note: { ...baseNote, visibility: "unlisted" } });
    await user.click(screen.getByRole("tab", { name: "notes.shareTabVisibility" }));
    const urlInputs = screen.getAllByLabelText("notes.shareLink");
    expect(urlInputs.length).toBeGreaterThan(0);
    expect(urlInputs[0]).toHaveValue(`${window.location.origin}/note/note-1`);
  });

  it("does not render the share URL field on visibility tab when note is private", async () => {
    const user = userEvent.setup();
    renderModal({ note: { ...baseNote, visibility: "private" } });
    await user.click(screen.getByRole("tab", { name: "notes.shareTabVisibility" }));
    expect(screen.queryByLabelText("notes.shareLink")).not.toBeInTheDocument();
  });
});
