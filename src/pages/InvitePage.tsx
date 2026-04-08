/**
 * Invitation acceptance page — `/invite?token=xxx`.
 * Manages 6 states: loading, signed-out, email-match, email-mismatch, expired, invalid.
 *
 * 招待受諾ページ — `/invite?token=xxx`。
 * 6 つの状態を管理: ローディング中、未ログイン、メール一致、メール不一致、期限切れ、無効。
 */
import React, { useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { signIn } from "@/lib/auth";
import { useAuth, useUser } from "@/hooks/useAuth";
import { useInvitation, useAcceptInvitation } from "@/hooks/useInvitation";
import { ApiError } from "@/lib/api/apiClient";
import type { InvitationInfoResponse } from "@/lib/api/types";

/**
 * Skeleton loader for invitation page.
 * 招待ページのスケルトンローダー。
 */
const InviteSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-4">
    <div className="bg-muted h-6 w-48 rounded" />
    <div className="bg-muted h-4 w-64 rounded" />
    <div className="bg-muted h-4 w-32 rounded" />
    <div className="bg-muted mt-6 h-10 w-full rounded" />
  </div>
);

/**
 * Social sign-in button (Google / GitHub).
 * ソーシャルサインインボタン。
 */
const SocialButton: React.FC<{
  provider: "google" | "github";
  label: string;
  onClick: () => void;
}> = ({ provider, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="border-border bg-card text-foreground hover:bg-accent/50 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 font-medium shadow-sm transition-colors duration-200 hover:shadow-md"
  >
    {provider === "google" ? (
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ) : (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    )}
    {label}
  </button>
);

/**
 * Page layout wrapper for the invite page.
 * 招待ページのレイアウトラッパー。
 */
const InviteLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-background flex min-h-screen flex-col">
    <header className="border-border/50 border-b">
      <div className="container mx-auto flex h-16 items-center px-4">
        <Link
          to="/"
          className="from-primary to-primary/70 bg-gradient-to-r bg-clip-text text-xl font-bold tracking-tight text-transparent"
        >
          Zedi
        </Link>
      </div>
    </header>
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </main>
    <footer className="border-border/50 border-t py-4">
      <div className="text-foreground/60 container mx-auto px-4 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} Zedi. All rights reserved.</p>
      </div>
    </footer>
  </div>
);

/**
 * Message-only card content (loading, error, expired, invalid).
 * メッセージのみのカード内容。
 */
const InviteMessage: React.FC<{ message: string; variant?: "default" | "error" }> = ({
  message,
  variant = "default",
}) => {
  const { t } = useTranslation();
  return (
    <>
      <CardHeader>
        <CardTitle>{t("invite.noteInvitation")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={variant === "error" ? "text-destructive" : "text-muted-foreground"}>
          {message}
        </p>
      </CardContent>
    </>
  );
};

/**
 * Invitation detail content — renders the appropriate state view.
 * 招待詳細コンテンツ — 適切な状態ビューをレンダリングする。
 */
const InviteContent: React.FC<{
  invitation: InvitationInfoResponse;
  token: string;
  isSignedIn: boolean;
  userEmail: string | null;
  onSignOut: () => void;
  onAccept: () => void;
  acceptPending: boolean;
  acceptError: Error | null;
  onSocialSignIn: (provider: "google" | "github") => () => void;
}> = ({
  invitation,
  isSignedIn,
  userEmail,
  onSignOut,
  onAccept,
  acceptPending,
  acceptError,
  onSocialSignIn,
}) => {
  const { t } = useTranslation();
  const roleName = invitation.role === "editor" ? t("invite.roleEditor") : t("invite.roleViewer");

  // Already used
  if (invitation.isUsed) {
    return (
      <>
        <CardHeader>
          <CardTitle>{invitation.noteTitle}</CardTitle>
          <CardDescription>
            {t("invite.invitedBy", { inviterName: invitation.inviterName })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t("invite.alreadyAccepted")}</p>
          <Button className="w-full" asChild>
            <Link to={`/note/${invitation.noteId}`}>{t("invite.goToNote")}</Link>
          </Button>
        </CardContent>
      </>
    );
  }

  // Signed out
  if (!isSignedIn) {
    return (
      <>
        <CardHeader>
          <CardTitle>{invitation.noteTitle}</CardTitle>
          <CardDescription>
            {t("invite.invitedBy", { inviterName: invitation.inviterName })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {t("invite.roleLabel", { role: roleName })}
          </p>
          <p className="text-foreground/70 text-sm">{t("invite.signInToAccept")}</p>
          <div className="space-y-3">
            <SocialButton
              provider="google"
              label={t("invite.signInWithGoogle")}
              onClick={onSocialSignIn("google")}
            />
            <SocialButton
              provider="github"
              label={t("invite.signInWithGitHub")}
              onClick={onSocialSignIn("github")}
            />
          </div>
        </CardContent>
      </>
    );
  }

  // Email mismatch
  if (userEmail && userEmail.toLowerCase() !== invitation.memberEmail.toLowerCase()) {
    return (
      <>
        <CardHeader>
          <CardTitle>{invitation.noteTitle}</CardTitle>
          <CardDescription>
            {t("invite.invitedBy", { inviterName: invitation.inviterName })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-destructive text-sm">
            {t("invite.emailMismatch", { email: invitation.memberEmail })}
          </p>
          <Button variant="outline" className="w-full" onClick={onSignOut}>
            {t("invite.signOutAndRetry")}
          </Button>
        </CardContent>
      </>
    );
  }

  // Signed in, email matches
  return (
    <>
      <CardHeader>
        <CardTitle>{invitation.noteTitle}</CardTitle>
        <CardDescription>
          {t("invite.invitedBy", { inviterName: invitation.inviterName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("invite.roleLabel", { role: roleName })}</p>
        {acceptError && (
          <p className="text-destructive text-sm" role="alert">
            {t("invite.acceptError")}
          </p>
        )}
        <Button className="w-full" onClick={onAccept} disabled={acceptPending}>
          {acceptPending ? t("invite.joining") : t("invite.joinNote")}
        </Button>
      </CardContent>
    </>
  );
};

/**
 * Invitation acceptance page component.
 * 招待受諾ページコンポーネント。
 */
const InvitePage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const { isLoaded, isSignedIn, signOut: authSignOut } = useAuth();
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  const {
    data: invitation,
    isLoading: invitationLoading,
    error: invitationError,
  } = useInvitation(token);
  const acceptMutation = useAcceptInvitation();

  const currentPagePath = `/invite?token=${encodeURIComponent(token)}`;

  const handleSocialSignIn = useCallback(
    (provider: "google" | "github") => async () => {
      const baseCallback = `${window.location.origin}/auth/callback`;
      const callbackURL = `${baseCallback}?returnTo=${encodeURIComponent(currentPagePath)}`;
      try {
        await signIn.social({ provider, callbackURL });
      } catch (err) {
        if (err instanceof Error) console.warn("Social sign-in failed:", err.message);
      }
    },
    [currentPagePath],
  );

  const handleAccept = useCallback(async () => {
    if (!token) return;
    try {
      const result = await acceptMutation.mutateAsync({ token });
      navigate(`/note/${result.noteId}`);
    } catch {
      // Error is handled via acceptMutation.error
    }
  }, [token, acceptMutation, navigate]);

  const handleSignOutAndRetry = useCallback(async () => {
    await authSignOut();
  }, [authSignOut]);

  // Loading
  if (!isLoaded || (!invitation && invitationLoading)) {
    return (
      <InviteLayout>
        <CardHeader>
          <CardTitle>{t("invite.noteInvitation")}</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteSkeleton />
        </CardContent>
      </InviteLayout>
    );
  }

  // Invalid token
  if (!token || (invitationError instanceof ApiError && invitationError.status === 404)) {
    return (
      <InviteLayout>
        <InviteMessage message={t("invite.invalid")} />
      </InviteLayout>
    );
  }

  // Network / unexpected error
  if (invitationError) {
    return (
      <InviteLayout>
        <InviteMessage message={invitationError.message} variant="error" />
      </InviteLayout>
    );
  }

  if (!invitation) return null;

  // Expired
  if (invitation.isExpired) {
    return (
      <InviteLayout>
        <InviteMessage message={t("invite.expired")} />
      </InviteLayout>
    );
  }

  return (
    <InviteLayout>
      <InviteContent
        invitation={invitation}
        token={token}
        isSignedIn={isSignedIn ?? false}
        userEmail={userEmail}
        onSignOut={handleSignOutAndRetry}
        onAccept={handleAccept}
        acceptPending={acceptMutation.isPending}
        acceptError={acceptMutation.error}
        onSocialSignIn={handleSocialSignIn}
      />
    </InviteLayout>
  );
};

export default InvitePage;
