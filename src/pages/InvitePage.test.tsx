/**
 * InvitePage: email-mismatch rescue flow tests.
 * 招待ページ: メール不一致時の救済フローのテスト。
 *
 * 既存の mismatch 分岐が新しいマジックリンク UI に置き換わったことを検証する。
 * Validates that the mismatch branch now offers a magic-link resend CTA,
 * surfaces rate-limit responses, and preserves the re-sign-in option.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InvitePage from "./InvitePage";
import { ApiError } from "@/lib/api/apiClient";

// ── Toast / signIn mocks ───────────────────────────────────────────────────

const toastMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: toastMock }),
  };
});

vi.mock("@/lib/auth", () => ({
  signIn: { social: vi.fn() },
}));

// ── Auth hooks: return signed-in user with a different email ───────────────

const userEmail = "alice@gmail.com";
const invitedEmail = "alice@example.com";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, signOut: vi.fn() }),
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: userEmail } },
  }),
}));

// ── Invitation hooks ───────────────────────────────────────────────────────

const sendMagicLinkMock = vi.fn<(vars: { token: string }) => Promise<unknown>>(async () => ({
  sent: true as const,
  memberEmail: invitedEmail,
  retryAfterSec: 300,
}));

vi.mock("@/hooks/useInvitation", () => ({
  useInvitation: () => ({
    data: {
      noteId: "note-1",
      noteTitle: "Shared Note",
      inviterName: "Bob",
      role: "editor",
      memberEmail: invitedEmail,
      isExpired: false,
      isUsed: false,
    },
    isLoading: false,
    error: null,
  }),
  useAcceptInvitation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
  useSendInvitationEmailLink: () => ({
    mutateAsync: (vars: { token: string }) => sendMagicLinkMock(vars),
    isPending: false,
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InvitePage />
    </MemoryRouter>,
  );
}

describe("InvitePage — email mismatch branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMagicLinkMock.mockResolvedValue({
      sent: true,
      memberEmail: invitedEmail,
      retryAfterSec: 300,
    });
  });

  it("shows magic-link CTA referencing the invited email and the re-sign-in fallback", () => {
    renderAt("/invite?token=abc123");

    // Mismatch banner is rendered with both emails in the params.
    expect(
      screen.getByText(/invite\.emailMismatch:.*"email":"alice@example\.com"/),
    ).toBeInTheDocument();
    // CTA button is labelled with the invited email
    expect(
      screen.getByRole("button", { name: /invite\.sendMagicLinkCta.*alice@example\.com/ }),
    ).toBeEnabled();
    // Fallback option still available
    expect(screen.getByRole("button", { name: /invite\.signOutAndRetry/ })).toBeInTheDocument();
  });

  it("triggers the magic-link send and surfaces a success toast", async () => {
    renderAt("/invite?token=abc123");
    const cta = screen.getByRole("button", { name: /invite\.sendMagicLinkCta/ });
    fireEvent.click(cta);

    await waitFor(() => expect(sendMagicLinkMock).toHaveBeenCalledTimes(1));
    expect(sendMagicLinkMock).toHaveBeenCalledWith({ token: "abc123" });
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringMatching(/invite\.sendMagicLinkSent/),
        }),
      ),
    );
    // After a successful send the CTA becomes disabled (cooldown begins).
    await waitFor(() => {
      const btn = screen.getByRole("button", {
        name: /invite\.sendMagicLink(ResendCountdown|Sent)/,
      });
      expect(btn).toBeDisabled();
    });
  });

  it("surfaces a destructive rate-limit toast when the server returns 429", async () => {
    sendMagicLinkMock.mockRejectedValueOnce(
      new ApiError("Rate limited (short window). Retry in 240 seconds", 429, "RATE_LIMIT_EXCEEDED"),
    );
    renderAt("/invite?token=abc123");
    const cta = screen.getByRole("button", { name: /invite\.sendMagicLinkCta/ });
    fireEvent.click(cta);

    await waitFor(() => expect(sendMagicLinkMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
    // Button is disabled while the rate-limit cooldown is active.
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /invite\.sendMagicLinkRateLimited/ });
      expect(btn).toBeDisabled();
    });
  });
});
