/**
 * Chrome extension authorization callback / Chrome 拡張用認可コールバック
 *
 * After Better Auth finishes, this page exchanges the current session for a one-time code
 * and redirects to redirect_uri with code and state.
 * Better Auth 認証完了後、このページは現在のセッションをワンタイムコードに交換し、
 * code と state を付与して redirect_uri へリダイレクトします。
 */
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

function getApiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (typeof env === "string" && env.trim() !== "") return env.trim().replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Extension auth callback page component / 拡張認証コールバックページコンポーネント
 */
const ExtensionAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const state = searchParams.get("state") ?? "";

  const paramError =
    !redirectUri || !codeChallenge || !state
      ? "redirect_uri, code_challenge, and state are required"
      : null;
  const viewError = paramError ?? error;

  useEffect(() => {
    if (paramError) return;

    const run = async () => {
      try {
        const base = getApiBase();
        const params = new URLSearchParams();
        params.set("redirect_uri", redirectUri);
        params.set("code_challenge", codeChallenge);
        params.set("state", state);

        const res = await fetch(`${base}/api/ext/authorize-code?${params.toString()}`, {
          credentials: "include",
        });

        if (!res.ok) {
          const data: unknown = await res.json().catch(() => ({}));
          const message =
            isObject(data) && typeof data.message === "string"
              ? data.message
              : `Request failed: ${res.status}`;
          setError(message);
          return;
        }

        const body: unknown = await res.json();
        if (!isObject(body) || typeof body.code !== "string" || body.code.length === 0) {
          setError("Invalid authorize-code response");
          return;
        }
        const { code } = body as { code: string };
        const target = new URL(redirectUri);
        target.searchParams.set("code", code);
        target.searchParams.set("state", state);

        window.location.replace(target.toString());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    };

    run();
    // paramError を依存に含めない: エラー時は effect を再実行せず表示のみ更新する
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when redirectUri/codeChallenge/state are valid
  }, [redirectUri, codeChallenge, state]);

  if (viewError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <p className="mb-4 text-destructive">{viewError}</p>
        <p className="text-sm text-muted-foreground">You can close this tab.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <p className="text-muted-foreground">Completing connection…</p>
    </div>
  );
};

export default ExtensionAuthCallback;
