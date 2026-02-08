/**
 * OAuth callback: exchange code for tokens, then redirect to /home.
 * Tracks codes already submitted so React Strict Mode (double effect) doesn't
 * exchange the same code twice and trigger Cognito invalid_grant.
 */
import { useEffect, useState } from "react";
import { exchangeCodeForTokens, setTokens } from "@/lib/auth";

const exchangedCodes = new Set<string>();
const MAX_TRACKED_CODES = 20;

export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorParam = params.get("error");
    const errorDescription = params.get("error_description");

    if (errorParam) {
      setError(errorDescription || errorParam);
      return;
    }

    if (!code) {
      // コールバックに code が無い場合（GCP のリダイレクト URI 不一致などで Google が戻ってこない）
      const qs = window.location.search;
      const msg = qs
        ? `No authorization code in URL. Query: ${qs}`
        : "No authorization code received. If you clicked \"Sign in with Google\", check that GCP has the Cognito redirect URI (see docs/guides/troubleshooting-cognito-google-callback.md).";
      setError(msg);
      return;
    }

    if (exchangedCodes.has(code)) {
      return;
    }
    exchangedCodes.add(code);
    if (exchangedCodes.size > MAX_TRACKED_CODES) {
      const first = exchangedCodes.values().next().value;
      if (first !== undefined) exchangedCodes.delete(first);
    }

    let cancelled = false;
    exchangeCodeForTokens(code)
      .then((tokens) => {
        setTokens(tokens);
        window.location.assign("/home");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Sign-in failed");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <p className="text-destructive mb-4">{error}</p>
        <a href="/sign-in" className="text-primary hover:underline">
          サインインに戻る
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <p className="text-muted-foreground">サインイン中...</p>
    </div>
  );
}
