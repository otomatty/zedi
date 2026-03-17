/**
 * OAuth callback page.
 * Better Auth handles the code exchange server-side; this page simply waits
 * for the session to become available and then redirects to /home.
 * セッションが取得できない場合はタイムアウト後にエラー表示し、サインインへ戻れるようにする。
 */
import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/lib/auth/authClient";

const SESSION_WAIT_TIMEOUT_MS = 15_000;
/** Allowed post-auth redirect paths (CodeQL: avoid open redirect). */
const ALLOWED_RETURN_PATHS = ["/home"];

/**
 * returnTo が許可された pathname でありオープンリダイレクトでないか検証する。
 * Validates returnTo is an allowed pathname and not an open redirect; allows query/hash.
 */
function isSafeReturnTo(returnTo: string): boolean {
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return false;
  try {
    const parsed = new URL(returnTo, "http://dummy");
    return ALLOWED_RETURN_PATHS.includes(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * OAuth callback page component. Waits for session then redirects.
 * OAuthコールバックページ。セッション取得後にリダイレクトする。
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTimedOutRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    const errorDescription = params.get("error_description");

    if (errorParam) {
      queueMicrotask(() => setError(errorDescription || errorParam));
      return;
    }

    if (!isPending && session) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const returnTo = params.get("returnTo");
      const target = returnTo && isSafeReturnTo(returnTo) ? returnTo : "/home";
      window.location.assign(target);
      return;
    }

    if (!isPending && !session && !timeoutRef.current && !hasTimedOutRef.current) {
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        hasTimedOutRef.current = true;
        setError(t("auth.callbackTimeout"));
      }, SESSION_WAIT_TIMEOUT_MS);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [session, isPending, t]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <p className="mb-4 text-destructive">{error}</p>
        <a href="/sign-in" className="text-primary hover:underline">
          {t("auth.backToSignIn")}
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <p className="text-muted-foreground">{t("auth.signingIn")}</p>
    </div>
  );
}
