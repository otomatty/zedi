/**
 * Chrome 拡張用認可コールバック
 *
 * Better Auth 認証完了後に遷移。セッションがあればワンタイムコードを取得し、
 * redirect_uri?code=xxx&state=xxx へリダイレクトする。
 */
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

function getApiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (typeof env === "string" && env.trim() !== "") return env.trim().replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/**
 *
 */
const ExtensionAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const state = searchParams.get("state") ?? "";

  const paramError =
    !redirectUri || !codeChallenge ? "redirect_uri and code_challenge are required" : null;
  const viewError = paramError ?? error;

  useEffect(() => {
    if (paramError) return;

    const run = async () => {
      try {
        const base = getApiBase();
        const params = new URLSearchParams();
        params.set("redirect_uri", redirectUri);
        params.set("code_challenge", codeChallenge);
        if (state) params.set("state", state);

        const res = await fetch(`${base}/api/ext/authorize-code?${params.toString()}`, {
          credentials: "include",
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message ?? `Request failed: ${res.status}`);
          return;
        }

        const { code } = (await res.json()) as { code: string; state?: string };
        const target = new URL(redirectUri);
        target.searchParams.set("code", code);
        if (state) target.searchParams.set("state", state);

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
