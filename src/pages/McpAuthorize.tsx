/**
 * MCP authorization consent page / MCP 認可同意ページ
 *
 * Reached from `zedi-mcp-cli login`. Required query params:
 *   - redirect_uri  (loopback URL on user's machine)
 *   - code_challenge (PKCE)
 *   - state         (CSRF guard)
 *   - scopes        (comma-separated, e.g. "mcp:read,mcp:write")
 *
 * Behavior:
 *   1. If the user is signed in (Better Auth cookie), show a consent screen
 *      listing the granted scopes.
 *   2. On approval, POST `/api/mcp/authorize-code` to receive a one-time `code`,
 *      then redirect the browser to `redirect_uri?code=...&state=...`.
 *
 * MCP authorization consent page used by the local CLI login flow.
 */
import React, { useEffect, useMemo, useState } from "react";
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
 * MCP authorization consent page component.
 * MCP 認可同意ページコンポーネント。
 */
const McpAuthorize: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const state = searchParams.get("state") ?? "";
  const scopesParam = searchParams.get("scopes") ?? "mcp:read,mcp:write";

  const scopes = useMemo(
    () =>
      scopesParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [scopesParam],
  );

  const paramError =
    !redirectUri || !codeChallenge ? "redirect_uri and code_challenge are required" : null;

  const onApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/api/mcp/authorize-code`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          state,
          scopes,
        }),
      });
      if (res.status === 401) {
        // Send the user through Better Auth and bring them back here.
        // 未ログインなら Better Auth のサインイン経由で戻ってくる。
        // Use path+search (not full URL) so SignIn's returnTo safety check accepts it.
        // SignIn の returnTo 検査が通るよう、絶対 URL ではなくパス+クエリだけを渡す。
        const here = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/sign-in?returnTo=${encodeURIComponent(here)}`;
        return;
      }
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
      let target: URL;
      try {
        target = new URL(redirectUri);
      } catch {
        setError("Invalid redirect URI");
        return;
      }
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      setDone(true);
      window.location.replace(target.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  // Render error state when params are malformed.
  // パラメータ不備の場合はエラー表示。
  useEffect(() => {
    if (paramError) setError(paramError);
  }, [paramError]);

  if (done) {
    return (
      <div className="bg-background flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">Authorized. You can close this tab.</p>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">Authorize Zedi MCP Server</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          A local Claude Code instance is requesting access to your Zedi data.
        </p>
        <div className="mb-4">
          <p className="mb-1 text-sm font-medium">Requested scopes:</p>
          <ul className="list-inside list-disc text-sm">
            {scopes.map((s) => (
              <li key={s}>
                <code>{s}</code>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-muted-foreground mb-4 text-xs">
          <p>
            <span className="font-medium">Redirect URI: </span>
            <code className="break-all">{redirectUri}</code>
          </p>
        </div>
        {error ? <p className="text-destructive mb-4 text-sm">{error}</p> : null}
        <button
          type="button"
          onClick={onApprove}
          disabled={loading || !!paramError}
          className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Authorizing…" : "Approve"}
        </button>
      </div>
    </div>
  );
};

export default McpAuthorize;
