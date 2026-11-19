import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signIn } from "@/lib/auth";
import { Button } from "@zedi/ui";

/** サインイン後の戻り先として許可するパス（先頭が / かつ // でない） */
function getSafeReturnTo(returnTo: string | null): string | null {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  return returnTo;
}

/**
 * Sign-in page. Google social login and returnTo redirect.
 * サインインページ。Google ソーシャルログインと returnTo リダイレクト。
 */
const SignIn: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
  const [socialError, setSocialError] = useState<string | null>(null);

  const baseCallback = `${window.location.origin}/auth/callback`;
  const callbackURL = returnTo
    ? `${baseCallback}?returnTo=${encodeURIComponent(returnTo)}`
    : baseCallback;

  const handleGoogle = async () => {
    setSocialError(null);
    try {
      await signIn.social({ provider: "google", callbackURL });
    } catch (err) {
      if (err instanceof Error) console.warn("Social sign-in failed:", err.message);
      setSocialError(t("auth.signIn.error"));
    }
  };

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
          <div className="mb-8 text-center">
            <h1 className="text-foreground mb-2 text-2xl font-bold">{t("auth.signIn.title")}</h1>
            <p className="text-foreground/70">{t("auth.signIn.subtitle")}</p>
          </div>
          {socialError && (
            <p className="text-destructive mb-4 text-sm" role="alert">
              {socialError}
            </p>
          )}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogle}
              className="border-border bg-card text-foreground hover:bg-accent/50 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 font-medium shadow-sm transition-colors duration-200 hover:shadow-md"
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
          <div className="border-border mt-6 border-t pt-6">
            <Link to="/home" className="block">
              <Button variant="outline" className="w-full" size="lg">
                {t("common.useWithoutSignIn")}
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-border/50 border-t py-4">
        <div className="text-foreground/60 container mx-auto px-4 text-center text-sm">
          <p>© {new Date().getFullYear()} Zedi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default SignIn;
