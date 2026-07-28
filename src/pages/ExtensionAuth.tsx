/**
 * Chrome 拡張用認可開始ページ
 *
 * クエリ: redirect_uri, code_challenge, state
 * Google でサインインし、callbackURL（ExtensionAuthCallback）へ遷移する。
 */
import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signIn } from "@/lib/auth";

/**
 * Chrome extension auth start page. Redirects to IdP then extension callback.
 * Chrome拡張認可開始ページ。IdP経由で拡張コールバックへ遷移する。
 */
const ExtensionAuth: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const state = searchParams.get("state") ?? "";

  const baseCallback = `${window.location.origin}/auth/extension-callback`;
  const params = new URLSearchParams();
  if (redirectUri) params.set("redirect_uri", redirectUri);
  if (codeChallenge) params.set("code_challenge", codeChallenge);
  if (state) params.set("state", state);
  const callbackURL = params.toString() ? `${baseCallback}?${params.toString()}` : baseCallback;

  const handleGoogle = async () => {
    setError(null);
    try {
      await signIn.social({ provider: "google", callbackURL });
    } catch (err) {
      if (err instanceof Error) console.warn("Social sign-in failed:", err.message);
      setError(t("auth.signIn.error"));
    }
  };

  const hasParams = Boolean(redirectUri && codeChallenge && state);

  return (
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
        <div className="w-full max-w-md">
          {!hasParams ? (
            <div className="text-center">
              <h1 className="text-foreground mb-2 text-xl font-bold">
                {t("auth.extension.invalidRequest")}
              </h1>
              <p className="text-muted-foreground">
                {t("auth.extension.invalidRequestDescription")}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-foreground mb-2 text-2xl font-bold">
                  {t("auth.extension.connectTitle")}
                </h1>
                <p className="text-foreground/70">{t("auth.extension.connectDescription")}</p>
              </div>
              {error && (
                <p className="text-destructive mb-4 text-sm" role="alert">
                  {error}
                </p>
              )}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogle}
                  className="border-border bg-card text-foreground hover:bg-accent/50 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 font-medium shadow-sm transition-colors duration-200"
                >
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
                  {t("auth.signIn.google")}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ExtensionAuth;
