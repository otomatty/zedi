/**
 * Share-link acceptance page — `/invite-links/:token`.
 *
 * 招待メール経由の `/invite` とは UI を分離し、「リンクを踏んだ人は誰でも
 * 見られる（ただし参加には明示クリックが必要）」という Phase 3 の設計に合わせる。
 *
 * Separate UI from the email-invite `/invite` route to match the Phase-3
 * design: anyone with the URL can preview, but joining requires an explicit
 * click after sign-in.
 */
import React, { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from "@zedi/ui";
import { signIn } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { useInviteLinkPreview, useRedeemInviteLink } from "@/hooks/useInviteLinks";
import { ApiError } from "@/lib/api/apiClient";
import type { InviteLinkPreviewResponse, InviteLinkStatus } from "@/lib/api/types";

/**
 * Google icon SVG (shared with InvitePage; duplicated for layout locality).
 * Google アイコン SVG（InvitePage と同じデザインをローカル複製）。
 */
const GoogleIcon: React.FC = () => (
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
);

const GitHubIcon: React.FC = () => (
  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

/**
 * Social sign-in button wrapper for the share-link layout.
 * 共有リンクページ用のソーシャルサインインボタン。
 */
const SocialButton: React.FC<{
  provider: "google" | "github";
  label: string;
  onClick: () => void;
}> = ({ provider, label, onClick }) => (
  <Button variant="outline" className="w-full gap-2" size="lg" onClick={onClick}>
    {provider === "google" ? <GoogleIcon /> : <GitHubIcon />}
    {label}
  </Button>
);

/**
 * Page layout wrapper identical in shape to the email-invite page so the two
 * flows feel consistent without sharing code (different state machines).
 *
 * メール招待ページと同じレイアウトで UI を揃えつつ、状態機械は分けておく。
 */
const InviteLinkLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
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
 * Pick the i18n key for non-valid link statuses.
 * `valid` 以外のステータスに対応する i18n キーを返す。
 */
function statusMessageKey(status: InviteLinkStatus): string {
  switch (status) {
    case "revoked":
      return "invite.linkStatusRevoked";
    case "expired":
      return "invite.linkStatusExpired";
    case "exhausted":
      return "invite.linkStatusExhausted";
    default:
      return "invite.linkStatusInvalid";
  }
}

const MessageOnly: React.FC<{ message: string; variant?: "default" | "error" }> = ({
  message,
  variant = "default",
}) => {
  const { t } = useTranslation();
  return (
    <>
      <CardHeader>
        <CardTitle>{t("invite.linkTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={variant === "error" ? "text-destructive" : "text-muted-foreground text-sm"}>
          {message}
        </p>
      </CardContent>
    </>
  );
};

/**
 * Sign-in pane for signed-out visitors. A redeem-eligible link always shows
 * the preview above the sign-in buttons so the visitor can decide.
 *
 * 未サインイン時は preview を先に見せてから社認ボタンを表示する。
 */
const SignInPane: React.FC<{
  preview: InviteLinkPreviewResponse;
  token: string;
}> = ({ preview, token }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const redirectTarget = `/invite-links/${encodeURIComponent(token)}`;
  const handle = (provider: "google" | "github") => async () => {
    const callbackURL = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(redirectTarget)}`;
    try {
      await signIn.social({ provider, callbackURL });
    } catch {
      toast({ variant: "destructive", description: t("auth.signIn.error") });
    }
  };
  const roleLabel = preview.role === "editor" ? t("invite.roleEditor") : t("invite.roleViewer");
  return (
    <>
      <CardHeader>
        <CardTitle>{preview.noteTitle}</CardTitle>
        <CardDescription>
          {t("invite.linkInviterLabel", { name: preview.inviterName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {t("invite.linkRoleLabel", { role: roleLabel })}
        </p>
        <p className="text-foreground/70 text-sm">{t("invite.linkSignInRequired")}</p>
        <div className="space-y-3">
          <SocialButton
            provider="google"
            label={t("invite.signInWithGoogle")}
            onClick={handle("google")}
          />
          <SocialButton
            provider="github"
            label={t("invite.signInWithGitHub")}
            onClick={handle("github")}
          />
        </div>
      </CardContent>
    </>
  );
};

/**
 * Primary join pane. `remainingUses === null` means unlimited; we surface that
 * as a distinct label rather than a number.
 *
 * 参加パネル。`remainingUses === null` は無制限で、数値ではなく専用ラベル表示。
 */
const JoinPane: React.FC<{
  preview: InviteLinkPreviewResponse;
  onJoin: () => void;
  pending: boolean;
  error: Error | null;
}> = ({ preview, onJoin, pending, error }) => {
  const { t } = useTranslation();
  const roleLabel = preview.role === "editor" ? t("invite.roleEditor") : t("invite.roleViewer");
  const expiresDate = new Date(preview.expiresAt).toLocaleString();
  const remaining =
    preview.remainingUses === null
      ? t("invite.linkUnlimitedLabel")
      : t("invite.linkRemainingLabel", { count: preview.remainingUses });

  return (
    <>
      <CardHeader>
        <CardTitle>{preview.noteTitle}</CardTitle>
        <CardDescription>
          {t("invite.linkInviterLabel", { name: preview.inviterName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li>{t("invite.linkRoleLabel", { role: roleLabel })}</li>
          <li>{t("invite.linkExpiresLabel", { date: expiresDate })}</li>
          <li>{remaining}</li>
          {preview.label ? <li className="italic">{preview.label}</li> : null}
        </ul>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {t("invite.linkRedeemError")}
          </p>
        )}
        <Button className="w-full" onClick={onJoin} disabled={pending}>
          {pending ? t("invite.linkJoining") : t("invite.linkJoinCta")}
        </Button>
      </CardContent>
    </>
  );
};

/**
 * Share-link acceptance page component.
 * 共有リンク受諾ページ。
 */
const InviteLinkPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = "" } = useParams<{ token: string }>();
  const { isLoaded, isSignedIn } = useAuth();

  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
  } = useInviteLinkPreview(token);
  const redeemMutation = useRedeemInviteLink();

  const handleJoin = useCallback(async () => {
    if (!token) return;
    try {
      const result = await redeemMutation.mutateAsync({ token });
      navigate(`/notes/${result.noteId}`);
    } catch {
      // 表示側で redeemMutation.error を描画するため何もしない。
      // Surface the error through redeemMutation.error rather than throwing here.
    }
  }, [token, redeemMutation, navigate]);

  // Loading
  if (!isLoaded || (!preview && previewLoading)) {
    return (
      <InviteLinkLayout>
        <MessageOnly message={t("invite.loading")} />
      </InviteLinkLayout>
    );
  }

  // Invalid token / preview failed
  if (!token || (previewError instanceof ApiError && previewError.status === 404)) {
    return (
      <InviteLinkLayout>
        <MessageOnly message={t("invite.linkStatusInvalid")} />
      </InviteLinkLayout>
    );
  }

  if (previewError) {
    return (
      <InviteLinkLayout>
        <MessageOnly message={previewError.message} variant="error" />
      </InviteLinkLayout>
    );
  }

  if (!preview) return null;

  // Non-valid statuses render a blocking message.
  if (preview.status !== "valid") {
    return (
      <InviteLinkLayout>
        <MessageOnly message={t(statusMessageKey(preview.status))} />
      </InviteLinkLayout>
    );
  }

  // Signed out — show sign-in options layered on top of the preview context.
  if (!isSignedIn) {
    return (
      <InviteLinkLayout>
        <SignInPane preview={preview} token={token} />
      </InviteLinkLayout>
    );
  }

  return (
    <InviteLinkLayout>
      <JoinPane
        preview={preview}
        onJoin={handleJoin}
        pending={redeemMutation.isPending}
        error={redeemMutation.error}
      />
    </InviteLinkLayout>
  );
};

export default InviteLinkPage;
