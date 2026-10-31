import { useEffect, useState } from "hono/jsx/dom";

/** Sign-in providers the server enables (`GET /api/sign-in-options`). */
export interface SignInOptions {
  google: boolean;
  testIdp: boolean;
}

type Provider = "google" | "test-idp";

async function fetchSignInOptions(): Promise<SignInOptions> {
  const res = await fetch("/api/sign-in-options");
  if (!res.ok) throw new Error(`sign-in options: ${res.status}`);
  return (await res.json()) as SignInOptions;
}

/** Starts the OAuth redirect; the browser leaves the app on success. */
async function startSocialSignIn(provider: Provider): Promise<void> {
  const { authClient } = await import("../authClient");
  const { error } = await authClient.signIn.social({ provider, callbackURL: "/notes" });
  if (error) throw new Error(error.message);
}

/**
 * Sign-in with Google. Outside production the server may also enable the test IdP, which
 * stands in for Google in local runs, tests and staging.
 * Google でサインインする画面。本番以外ではテスト用 IdP も出ることがある。
 */
export function SignInPage({
  loadOptions = fetchSignInOptions,
  startSignIn = startSocialSignIn,
}: {
  loadOptions?: () => Promise<SignInOptions>;
  startSignIn?: (provider: Provider) => Promise<void>;
}) {
  const [options, setOptions] = useState<SignInOptions | "loading" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<Provider | null>(null);
  const [startFailed, setStartFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setOptions("loading");
    loadOptions().then(
      (loaded) => active && setOptions(loaded),
      () => active && setOptions("error"),
    );
    return () => {
      active = false;
    };
  }, [attempt, loadOptions]);

  const signIn = async (provider: Provider) => {
    setPending(provider);
    setStartFailed(false);
    try {
      await startSignIn(provider);
    } catch {
      setStartFailed(true);
      setPending(null);
    }
  };

  return (
    <main class="sign-in">
      <h1>Zedi にサインイン</h1>
      {options === "error" && (
        <p role="alert">
          サインインの方法を読み込めませんでした。{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            再読み込み
          </button>
        </p>
      )}
      {typeof options === "object" && !options.google && !options.testIdp && (
        <p role="alert">利用できるサインインの方法がありません。管理者に連絡してください。</p>
      )}
      {typeof options === "object" && options.google && (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => signIn("google")}
          data-testid="sign-in-google"
        >
          Google でサインイン
        </button>
      )}
      {typeof options === "object" && options.testIdp && (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => signIn("test-idp")}
          data-testid="sign-in-test-idp"
        >
          テスト用 IdP でサインイン
        </button>
      )}
      {startFailed && (
        <p role="alert">サインインを開始できませんでした。時間をおいて再度お試しください。</p>
      )}
    </main>
  );
}
