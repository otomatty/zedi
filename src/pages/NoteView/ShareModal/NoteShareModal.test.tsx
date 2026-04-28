/**
 * NoteShareModal のタブ構造テスト。
 * Tests for the NoteShareModal tab structure.
 *
 * 観点 / Coverage:
 *   - 基本タブ (メンバー / リンク / ドメイン / 公開設定) が表示される
 *   - ドメインタブは showDomainsTab=false で隠せる
 *   - モーダルが閉じているときは hidden 状態
 *   - 公開設定タブで visibility が unlisted のとき共有 URL フィールドが表示される
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

vi.mock("@/hooks/useDomainAccess", () => ({
  useDomainAccessForNote: () => ({ data: [], isLoading: false }),
  useCreateDomainAccess: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDomainAccess: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

  it("renders members, links, domains, and visibility tabs by default", () => {
    renderModal();
    expect(screen.getByRole("tab", { name: "notes.shareTabMembers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabLinks" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabDomains" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabVisibility" })).toBeInTheDocument();
  });

  it("hides the domains tab when showDomainsTab is false", () => {
    renderModal({ showDomainsTab: false });
    expect(screen.queryByRole("tab", { name: "notes.shareTabDomains" })).not.toBeInTheDocument();
  });

  it("renders nothing visible when open is false", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("tab", { name: "notes.shareTabMembers" })).not.toBeInTheDocument();
  });

  it("renders the members-page link inside the members tab", () => {
    renderModal();
    expect(screen.getByRole("link", { name: /notes\.shareOpenMembersPage/ })).toHaveAttribute(
      "href",
      "/notes/note-1/members",
    );
  });

  it("renders the share URL field on visibility tab when note is unlisted", async () => {
    const user = userEvent.setup();
    renderModal({ note: { ...baseNote, visibility: "unlisted" } });
    await user.click(screen.getByRole("tab", { name: "notes.shareTabVisibility" }));
    const urlInputs = screen.getAllByLabelText("notes.shareLink");
    expect(urlInputs.length).toBeGreaterThan(0);
    expect(urlInputs[0]).toHaveValue(`${window.location.origin}/notes/note-1`);
  });

  it("does not render the share URL field on visibility tab when note is private", async () => {
    const user = userEvent.setup();
    renderModal({ note: { ...baseNote, visibility: "private" } });
    await user.click(screen.getByRole("tab", { name: "notes.shareTabVisibility" }));
    expect(screen.queryByLabelText("notes.shareLink")).not.toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Role-based tab visibility (#675)
  // ロール別タブ表示マトリックス (#675)
  // ------------------------------------------------------------------

  it("editor sees all tabs but the visibility tab shows the read-only notice", async () => {
    const user = userEvent.setup();
    renderModal({ userRole: "editor" });
    expect(screen.getByRole("tab", { name: "notes.shareTabMembers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabLinks" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabDomains" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabVisibility" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "notes.shareTabVisibility" }));
    expect(screen.getByText("notes.shareReadOnlyNotice")).toBeInTheDocument();
    // owner-only Save button must be absent for editors
    expect(
      screen.queryByRole("button", { name: "notes.shareSaveChanges" }),
    ).not.toBeInTheDocument();
  });

  it("viewer only sees the visibility tab and gets the read-only notice", () => {
    renderModal({ userRole: "viewer" });
    expect(screen.queryByRole("tab", { name: "notes.shareTabMembers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "notes.shareTabLinks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "notes.shareTabDomains" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabVisibility" })).toBeInTheDocument();
    expect(screen.getByText("notes.shareReadOnlyNotice")).toBeInTheDocument();
  });

  it("owner sees all tabs and the visibility tab Save button (no read-only notice)", async () => {
    const user = userEvent.setup();
    renderModal({ userRole: "owner" });
    expect(screen.getByRole("tab", { name: "notes.shareTabMembers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabLinks" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabDomains" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabVisibility" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "notes.shareTabVisibility" }));
    const visibilityPanel = screen.getByRole("tabpanel");
    expect(
      within(visibilityPanel).queryByText("notes.shareReadOnlyNotice"),
    ).not.toBeInTheDocument();
    expect(
      within(visibilityPanel).getByRole("button", { name: "notes.shareSaveChanges" }),
    ).toBeInTheDocument();
  });

  it("editor's members tab hides the invite form and full-page link", () => {
    renderModal({ userRole: "editor" });
    // Invite form heading is replaced by a plain "members" heading in read-only mode
    expect(screen.queryByRole("heading", { name: "notes.inviteMember" })).not.toBeInTheDocument();
    // The full-members-page link (rendered in the footer of the tab) is hidden for editors
    expect(
      screen.queryByRole("link", { name: /notes\.shareOpenMembersPage/ }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the members tab when showDomainsTab flips to false on the active tab", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NoteShareModal open onOpenChange={() => {}} note={baseNote} showDomainsTab />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("tab", { name: "notes.shareTabDomains" }));
    expect(screen.getByRole("tab", { name: "notes.shareTabDomains" })).toHaveAttribute(
      "data-state",
      "active",
    );

    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NoteShareModal open onOpenChange={() => {}} note={baseNote} showDomainsTab={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("tab", { name: "notes.shareTabDomains" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "notes.shareTabMembers" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
