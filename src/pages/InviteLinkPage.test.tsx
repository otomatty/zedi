/**
 * InviteLinkPage: share-link acceptance flow tests.
 * 共有リンク受諾ページの統合テスト。
 *
 * Covers loading / invalid / preview-error / status-blocked / sign-in / join branches
 * without reading the page implementation (spec-driven).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InviteLinkPage from "./InviteLinkPage";
import { ApiError } from "@/lib/api/apiClient";
import type { InviteLinkPreviewResponse } from "@/lib/api/types";

const { mockNavigate, mockToast, mockSignInSocial, mockRedeemMutate, mockUseParams } = vi.hoisted(
  () => ({
    mockNavigate: vi.fn(),
    mockToast: vi.fn(),
    mockSignInSocial: vi.fn(),
    mockRedeemMutate: vi.fn(),
    mockUseParams: vi.fn(() => ({ token: "share-token" })),
  }),
);

let authState = { isLoaded: true, isSignedIn: false };
let previewState: {
  data: InviteLinkPreviewResponse | undefined;
  isLoading: boolean;
  error: Error | null;
} = {
  data: undefined,
  isLoading: false,
  error: null,
};
let redeemState = {
  isPending: false,
  error: null as Error | null,
};

const validPreview: InviteLinkPreviewResponse = {
  status: "valid",
  noteId: "note-abc",
  noteTitle: "Shared Note",
  inviterName: "Alice",
  role: "editor",
  expiresAt: "2026-12-31T00:00:00.000Z",
  remainingUses: 3,
  maxUses: 10,
  usedCount: 7,
  requireSignIn: true,
  label: null,
};

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

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
    useToast: () => ({ toast: mockToast }),
  };
});

vi.mock("@/lib/auth", () => ({
  signIn: { social: mockSignInSocial },
}));

vi.mock("@/hooks/auth/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/auth/useInviteLinks", () => ({
  useInviteLinkPreview: () => ({
    data: previewState.data,
    isLoading: previewState.isLoading,
    error: previewState.error,
  }),
  useRedeemInviteLink: () => ({
    mutateAsync: mockRedeemMutate,
    isPending: redeemState.isPending,
    error: redeemState.error,
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invite-links/:token" element={<InviteLinkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function resetPreview(overrides?: Partial<typeof previewState>) {
  previewState = {
    data: undefined,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

describe("InviteLinkPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ token: "share-token" });
    authState = { isLoaded: true, isSignedIn: false };
    redeemState = { isPending: false, error: null };
    resetPreview();
    mockSignInSocial.mockResolvedValue(undefined);
    mockRedeemMutate.mockResolvedValue({
      noteId: "note-abc",
      role: "editor",
      isNewRedemption: true,
      alreadyMember: false,
      status: "accepted",
    });
  });

  describe("loading state", () => {
    it("shows link title and loading message while auth is not loaded", () => {
      authState = { isLoaded: false, isSignedIn: false };
      renderAt("/invite-links/token-1");

      expect(screen.getByText("invite.linkTitle")).toBeInTheDocument();
      expect(screen.getByText("invite.loading")).toBeInTheDocument();
    });

    it("shows loading message while preview is fetching", () => {
      resetPreview({ isLoading: true, data: undefined });
      renderAt("/invite-links/token-1");

      expect(screen.getByText("invite.linkTitle")).toBeInTheDocument();
      expect(screen.getByText("invite.loading")).toBeInTheDocument();
    });
  });

  describe("invalid state", () => {
    it("shows invalid status when the route token is empty", () => {
      mockUseParams.mockReturnValue({ token: "" });
      renderAt("/invite-links/share-token");

      expect(screen.getByText("invite.linkStatusInvalid")).toBeInTheDocument();
    });

    it("shows invalid status when preview returns 404 ApiError", () => {
      resetPreview({
        error: new ApiError("Not found", 404, "NOT_FOUND"),
      });
      renderAt("/invite-links/missing-token");

      expect(screen.getByText("invite.linkStatusInvalid")).toBeInTheDocument();
    });
  });

  describe("preview error (non-404)", () => {
    it("shows the preview error message with destructive styling", () => {
      resetPreview({
        error: new ApiError("Server unavailable", 503, "SERVICE_UNAVAILABLE"),
      });
      renderAt("/invite-links/token-1");

      const message = screen.getByText("Server unavailable");
      expect(message).toBeInTheDocument();
      expect(message).toHaveClass("text-destructive");
    });
  });

  describe("non-valid preview status", () => {
    it.each([
      ["revoked", "invite.linkStatusRevoked"],
      ["expired", "invite.linkStatusExpired"],
      ["exhausted", "invite.linkStatusExhausted"],
    ] as const)("shows %s status message", (status, expectedKey) => {
      resetPreview({
        data: { ...validPreview, status },
      });
      renderAt("/invite-links/token-1");

      expect(screen.getByText(expectedKey)).toBeInTheDocument();
    });

    it("falls back to invalid message for an unknown preview status", () => {
      resetPreview({
        data: { ...validPreview, status: "unknown" as InviteLinkPreviewResponse["status"] },
      });
      renderAt("/invite-links/token-1");

      expect(screen.getByText("invite.linkStatusInvalid")).toBeInTheDocument();
    });
  });

  describe("valid preview — signed out (SignInPane)", () => {
    beforeEach(() => {
      authState = { isLoaded: true, isSignedIn: false };
      resetPreview({ data: validPreview });
    });

    it("shows note title, inviter, role, and sign-in requirement", () => {
      renderAt("/invite-links/share-token");

      expect(screen.getByRole("heading", { name: "Shared Note" })).toBeInTheDocument();
      expect(screen.getByText(/invite\.linkInviterLabel:.*"name":"Alice"/)).toBeInTheDocument();
      expect(
        screen.getByText(/invite\.linkRoleLabel:.*"role":"invite\.roleEditor"/),
      ).toBeInTheDocument();
      expect(screen.getByText("invite.linkSignInRequired")).toBeInTheDocument();
    });

    it("shows viewer role label when the invite grants viewer access", () => {
      resetPreview({
        data: { ...validPreview, role: "viewer" },
      });
      renderAt("/invite-links/share-token");

      expect(
        screen.getByText(/invite\.linkRoleLabel:.*"role":"invite\.roleViewer"/),
      ).toBeInTheDocument();
    });

    it("renders Google and GitHub sign-in buttons", () => {
      renderAt("/invite-links/share-token");

      expect(screen.getByRole("button", { name: "invite.signInWithGoogle" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "invite.signInWithGitHub" })).toBeInTheDocument();
    });

    it("starts Google social sign-in with returnTo callback URL", async () => {
      renderAt("/invite-links/share-token");
      fireEvent.click(screen.getByRole("button", { name: "invite.signInWithGoogle" }));

      await waitFor(() => expect(mockSignInSocial).toHaveBeenCalledTimes(1));
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "http://localhost:3000/auth/callback?returnTo=%2Finvite-links%2Fshare-token",
      });
    });

    it("starts GitHub social sign-in with returnTo callback URL", async () => {
      renderAt("/invite-links/share-token");
      fireEvent.click(screen.getByRole("button", { name: "invite.signInWithGitHub" }));

      await waitFor(() => expect(mockSignInSocial).toHaveBeenCalledTimes(1));
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "github",
        callbackURL: "http://localhost:3000/auth/callback?returnTo=%2Finvite-links%2Fshare-token",
      });
    });

    it("shows destructive toast when social sign-in fails", async () => {
      mockSignInSocial.mockRejectedValueOnce(new Error("OAuth failed"));
      renderAt("/invite-links/share-token");
      fireEvent.click(screen.getByRole("button", { name: "invite.signInWithGoogle" }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({
          variant: "destructive",
          description: "auth.signIn.error",
        }),
      );
    });
  });

  describe("valid preview — signed in (JoinPane)", () => {
    beforeEach(() => {
      authState = { isLoaded: true, isSignedIn: true };
      resetPreview({ data: validPreview });
    });

    it("shows join details including inviter, role, expiry, and remaining uses", () => {
      renderAt("/invite-links/share-token");

      expect(screen.getByText(/invite\.linkInviterLabel:.*"name":"Alice"/)).toBeInTheDocument();
      expect(
        screen.getByText(/invite\.linkRoleLabel:.*"role":"invite\.roleEditor"/),
      ).toBeInTheDocument();
      expect(screen.getByText(/invite\.linkExpiresLabel:/)).toBeInTheDocument();
      expect(screen.getByText(/invite\.linkRemainingLabel:.*"count":3/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "invite.linkJoinCta" })).toBeInTheDocument();
    });

    it("shows unlimited label when remaining uses is null", () => {
      resetPreview({
        data: { ...validPreview, remainingUses: null },
      });
      renderAt("/invite-links/share-token");

      expect(screen.getByText("invite.linkUnlimitedLabel")).toBeInTheDocument();
    });

    it("shows optional link label when preview includes one", () => {
      resetPreview({
        data: { ...validPreview, label: "Team onboarding link" },
      });
      renderAt("/invite-links/share-token");

      expect(screen.getByText("Team onboarding link")).toBeInTheDocument();
    });

    it("redeems the link and navigates to the note on success", async () => {
      renderAt("/invite-links/share-token");
      fireEvent.click(screen.getByRole("button", { name: "invite.linkJoinCta" }));

      await waitFor(() => expect(mockRedeemMutate).toHaveBeenCalledTimes(1));
      expect(mockRedeemMutate).toHaveBeenCalledWith({ token: "share-token" });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/notes/note-abc"));
    });

    it("shows redeem error alert when the redeem mutation reports an error", () => {
      redeemState = { isPending: false, error: new Error("redeem failed") };
      renderAt("/invite-links/share-token");

      expect(screen.getByRole("alert")).toHaveTextContent("invite.linkRedeemError");
    });

    it("does not navigate when join redeem fails", async () => {
      mockRedeemMutate.mockRejectedValueOnce(new Error("redeem failed"));
      renderAt("/invite-links/share-token");
      fireEvent.click(screen.getByRole("button", { name: "invite.linkJoinCta" }));

      await waitFor(() => expect(mockRedeemMutate).toHaveBeenCalledTimes(1));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("disables join button and shows joining label while redeem is pending", () => {
      redeemState = { isPending: true, error: null };
      renderAt("/invite-links/share-token");

      const joinButton = screen.getByRole("button", { name: "invite.linkJoining" });
      expect(joinButton).toBeDisabled();
    });
  });
});
