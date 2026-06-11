/**
 * NoteInviteLinksSection: 招待リンクの発行・コピー・取り消しと権限分岐。
 * Tests invite-link create/copy/revoke flows and role-based UI constraints.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NoteInviteLinksSection } from "./NoteInviteLinksSection";
import {
  useCreateInviteLink,
  useInviteLinksForNote,
  useRevokeInviteLink,
} from "@/hooks/auth/useInviteLinks";
import type { InviteLinkRow } from "@/lib/api/types";

const NOW_MS = Date.parse("2026-06-01T12:00:00.000Z");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
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

vi.mock("@/hooks/auth/useInviteLinks", () => ({
  useInviteLinksForNote: vi.fn(),
  useCreateInviteLink: vi.fn(),
  useRevokeInviteLink: vi.fn(),
}));

function makeLink(overrides: Partial<InviteLinkRow> = {}): InviteLinkRow {
  return {
    id: "link-1",
    note_id: "note-1",
    token: "share-token",
    role: "viewer",
    created_by_user_id: "user-1",
    expires_at: "2026-12-31T00:00:00.000Z",
    max_uses: 10,
    used_count: 2,
    revoked_at: null,
    require_sign_in: true,
    label: "Team link",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderSection(props: Partial<React.ComponentProps<typeof NoteInviteLinksSection>> = {}) {
  return render(
    <NoteInviteLinksSection
      noteId="note-1"
      now={() => NOW_MS}
      editPermission="members_editors"
      {...props}
    />,
  );
}

describe("NoteInviteLinksSection", () => {
  let createMutateAsync: ReturnType<typeof vi.fn>;
  let revokeMutateAsync: ReturnType<typeof vi.fn>;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toastMock.mockReset();
    createMutateAsync = vi.fn().mockResolvedValue(makeLink({ token: "new-token" }));
    revokeMutateAsync = vi.fn().mockResolvedValue({ revoked: true, revokedAt: "2026-06-02" });
    writeTextMock = vi.fn().mockResolvedValue(undefined);

    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);
    vi.mocked(useCreateInviteLink).mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
    vi.mocked(useRevokeInviteLink).mockReturnValue({
      mutateAsync: revokeMutateAsync,
      isPending: false,
    } as never);

    Object.defineProperty(window, "location", {
      value: { origin: "https://app.example.com" },
      writable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading text while links are fetching", () => {
    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [],
      isLoading: true,
    } as never);

    renderSection();

    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("shows empty state when there are no links", () => {
    renderSection();

    expect(screen.getByText("notes.inviteLinksEmptyState")).toBeInTheDocument();
  });

  it("hides create and revoke controls in read-only mode but keeps copy", () => {
    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [makeLink()],
      isLoading: false,
    } as never);

    renderSection({ readOnly: true });

    expect(
      screen.queryByRole("button", { name: "notes.inviteLinksCreateCta" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("notes.inviteLinksRevokeAria")).not.toBeInTheDocument();
    expect(screen.getByLabelText("notes.inviteLinksCopyAria")).toBeInTheDocument();
  });

  it("renders active, expired, and exhausted status badges", () => {
    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [
        makeLink({ id: "active", label: "Active link" }),
        makeLink({
          id: "expired",
          label: "Expired link",
          expires_at: "2026-01-01T00:00:00.000Z",
        }),
        makeLink({
          id: "exhausted",
          label: "Exhausted link",
          max_uses: 5,
          used_count: 5,
          expires_at: "2026-12-31T00:00:00.000Z",
        }),
      ],
      isLoading: false,
    } as never);

    renderSection({ readOnly: true });

    expect(screen.getByText("notes.inviteLinksStatusActive")).toBeInTheDocument();
    expect(screen.getByText("notes.inviteLinksStatusExpired")).toBeInTheDocument();
    expect(screen.getByText("notes.inviteLinksStatusExhausted")).toBeInTheDocument();
  });

  it("highlights editor links with the editor badge", () => {
    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [makeLink({ role: "editor", label: "Editor link" })],
      isLoading: false,
    } as never);

    renderSection({ readOnly: true });

    expect(screen.getByText("notes.inviteLinksRoleEditorBadge")).toBeInTheDocument();
  });

  it("creates a viewer link, copies the URL, and resets the form", async () => {
    renderSection();

    fireEvent.change(screen.getByLabelText("notes.inviteLinksLabelAria"), {
      target: { value: "  Ops link  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "notes.inviteLinksCreateCta" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        role: "viewer",
        expiresInMs: 7 * 24 * 60 * 60 * 1000,
        maxUses: 10,
        label: "Ops link",
        requireSignIn: true,
      });
    });
    expect(writeTextMock).toHaveBeenCalledWith("https://app.example.com/invite-links/new-token");
    expect(toastMock).toHaveBeenCalledWith({
      title: "notes.inviteLinkCreatedAndCopied",
      description: "https://app.example.com/invite-links/new-token",
    });
    expect((screen.getByLabelText("notes.inviteLinksLabelAria") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("shows destructive toast when create fails", async () => {
    createMutateAsync.mockRejectedValueOnce(new Error("rate limit"));
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "notes.inviteLinksCreateCta" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "notes.inviteLinkCreateFailed",
        variant: "destructive",
      });
    });
  });

  it("requires editor acknowledgement before create is enabled", async () => {
    renderSection();

    expect(screen.getByRole("button", { name: "notes.inviteLinksCreateCta" })).toBeEnabled();

    fireEvent.click(screen.getByLabelText("notes.inviteLinksRoleAria"));
    fireEvent.click(screen.getByRole("option", { name: "notes.inviteLinksRoleEditor" }));

    expect(screen.getByText("notes.inviteLinksEditorConfirmTitle")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "notes.inviteLinksEditorConfirmAcknowledge" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("notes.inviteLinksEditorConfirmTitle")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "notes.inviteLinksCreateCta" })).toBeEnabled();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("reverts to viewer when editor confirmation is cancelled", async () => {
    renderSection();

    fireEvent.click(screen.getByLabelText("notes.inviteLinksRoleAria"));
    fireEvent.click(screen.getByRole("option", { name: "notes.inviteLinksRoleEditor" }));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("notes.inviteLinksEditorConfirmTitle")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "notes.inviteLinksCreateCta" })).toBeEnabled();
  });

  it("blocks create with destructive toast when editPermission becomes owner_only with editor selected", async () => {
    const { rerender } = render(
      <NoteInviteLinksSection
        noteId="note-1"
        now={() => NOW_MS}
        editPermission="members_editors"
      />,
    );

    fireEvent.click(screen.getByLabelText("notes.inviteLinksRoleAria"));
    fireEvent.click(screen.getByRole("option", { name: "notes.inviteLinksRoleEditor" }));
    fireEvent.click(
      screen.getByRole("button", { name: "notes.inviteLinksEditorConfirmAcknowledge" }),
    );

    rerender(
      <NoteInviteLinksSection noteId="note-1" now={() => NOW_MS} editPermission="owner_only" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "notes.inviteLinksCreateCta" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "notes.inviteLinksEditorUnavailableOwnerOnly",
        variant: "destructive",
      });
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("sends selected expiry and max-uses presets to the create API", async () => {
    renderSection();

    fireEvent.click(screen.getByLabelText("notes.inviteLinksExpiryAria"));
    fireEvent.click(screen.getByRole("option", { name: "notes.inviteLinksExpiry30d" }));
    fireEvent.click(screen.getByLabelText("notes.inviteLinksMaxUsesAria"));
    fireEvent.click(screen.getByRole("option", { name: "notes.inviteLinksMaxUsesUnlimited" }));
    fireEvent.click(screen.getByRole("button", { name: "notes.inviteLinksCreateCta" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        role: "viewer",
        expiresInMs: 30 * 24 * 60 * 60 * 1000,
        maxUses: null,
        label: null,
        requireSignIn: true,
      });
    });
  });

  it("disables editor role option when editPermission is owner_only", () => {
    renderSection({ editPermission: "owner_only" });

    fireEvent.click(screen.getByLabelText("notes.inviteLinksRoleAria"));

    expect(screen.getByRole("option", { name: "notes.inviteLinksRoleEditor" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("copies an existing link URL to the clipboard", async () => {
    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [makeLink({ token: "existing-token" })],
      isLoading: false,
    } as never);

    renderSection();

    fireEvent.click(screen.getByLabelText("notes.inviteLinksCopyAria"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "https://app.example.com/invite-links/existing-token",
      );
    });
    expect(toastMock).toHaveBeenCalledWith({
      title: "notes.inviteLinkCopied",
      description: "https://app.example.com/invite-links/existing-token",
    });
  });

  it("shows destructive toast when copy fails", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("denied"));
    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [makeLink({ token: "existing-token" })],
      isLoading: false,
    } as never);

    renderSection();

    fireEvent.click(screen.getByLabelText("notes.inviteLinksCopyAria"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "notes.inviteLinkCopyFailed",
        description: "https://app.example.com/invite-links/existing-token",
        variant: "destructive",
      });
    });
  });

  it("revokes a link and shows success toast", async () => {
    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [makeLink({ id: "link-42" })],
      isLoading: false,
    } as never);

    renderSection();

    fireEvent.click(screen.getByLabelText("notes.inviteLinksRevokeAria"));

    await waitFor(() => {
      expect(revokeMutateAsync).toHaveBeenCalledWith({ linkId: "link-42" });
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.inviteLinkRevoked" });
  });

  it("shows destructive toast when revoke fails", async () => {
    revokeMutateAsync.mockRejectedValueOnce(new Error("forbidden"));
    vi.mocked(useInviteLinksForNote).mockReturnValue({
      data: [makeLink({ id: "link-42" })],
      isLoading: false,
    } as never);

    renderSection();

    fireEvent.click(screen.getByLabelText("notes.inviteLinksRevokeAria"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "notes.inviteLinkRevokeFailed",
        variant: "destructive",
      });
    });
  });
});
