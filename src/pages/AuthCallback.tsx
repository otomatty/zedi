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
/** 認証後に許可されるリダイレクトパス（CodeQL: オープンリダイレクト防止）。Allowed post-auth redirect paths (CodeQL: avoid open redirect). */
const ALLOWED_RETURN_PATHS = ["/home"] as const;

/**
 * returnTo を検証し、安全なリダイレクト先を返す。pathname は許可リストの定数のみ使用し CodeQL を満たす。
 * Validates returnTo and returns a safe redirect target; pathname comes only from allowlist constant (CodeQL).
 */
function getSafeReturnTarget(returnTo: string | null): string {
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) return "/home";
  try {
    const parsed = new URL(returnTo, "http://dummy");
    const allowedPathname = ALLOWED_RETURN_PATHS.find((p) => p === parsed.pathname);
    if (!allowedPathname) return "/home";
    return allowedPathname + (parsed.search ?? "") + (parsed.hash ?? "");
  } catch {
    return "/home";
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
      const raw = errorDescription || errorParam;
      const safe = String(raw ?? "").replace(/[<>"'`]/g, "");
      queueMicrotask(() => setError(safe || t("common.error")));
      return;
    }

    if (!isPending && session) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const target = getSafeReturnTarget(params.get("returnTo"));
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
      <div className="bg-background flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-destructive mb-4">{error}</p>
        <a href="/sign-in" className="text-primary hover:underline">
          {t("auth.backToSignIn")}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center p-4">
      <p className="text-muted-foreground">{t("auth.signingIn")}</p>
    </div>
  );
}
