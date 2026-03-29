/**
 * Chrome 拡張用認可開始ページ
 *
 * クエリ: redirect_uri, code_challenge, state
 * Google/GitHub でサインインし、callbackURL（ExtensionAuthCallback）へ遷移する。
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

  const handleSocialSignIn = (provider: "google" | "github") => async () => {
    setError(null);
    try {
      await signIn.social({ provider, callbackURL });
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
                  onClick={() => handleSocialSignIn("google")()}
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
                <button
                  type="button"
                  onClick={() => handleSocialSignIn("github")()}
                  className="border-border bg-card text-foreground hover:bg-accent/50 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 font-medium shadow-sm transition-colors duration-200"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  {t("auth.signIn.github")}
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
