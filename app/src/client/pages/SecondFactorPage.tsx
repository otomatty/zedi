import { useEffect, useRef, useState } from "hono/jsx/dom";
import { messageFor, prompt, refusedAs } from "../lib/secondFactorErrors";
import {
  browserWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type WebAuthnClient,
} from "../lib/webauthn";
import { secondFactorApi, type SecondFactorApi, type SecondFactorStatus } from "../secondFactorApi";
import {
  ChooseView,
  PasskeyEnrollView,
  SuggestView,
  TotpEnrollView,
  VerifyView,
  type VerifyMethod,
} from "./SecondFactorViews";

type View =
  | { kind: "loading" }
  | { kind: "loadFailed" }
  | { kind: "choose" }
  | { kind: "enrollTotp"; secret: string; uri: string; recoveryCodes?: string[]; first: boolean }
  | {
      kind: "enrollPasskey";
      options: PublicKeyCredentialCreationOptionsJSON;
      recoveryCodes?: string[];
      first: boolean;
    }
  | { kind: "suggest"; other: "passkey" | "totp" }
  | { kind: "verify"; method: VerifyMethod; available: Record<VerifyMethod, boolean> };

/** The view a loaded status leads to; null once the session has passed the second step. */
function viewFor(status: SecondFactorStatus, passkeySupported: boolean): View | null {
  if (status.verified) return null;
  const available = {
    passkey: status.passkeys > 0 && passkeySupported,
    totp: status.totp,
    recovery: true,
  };
  if (status.passkeys === 0 && !status.totp) return { kind: "choose" };
  const method = available.passkey ? "passkey" : available.totp ? "totp" : "recovery";
  return { kind: "verify", method, available };
}

/**
 * Loads the session's second-factor status and turns it into the first view; `reload` loads it
 * again. A verified or expired session is handed back through `onSessionChange`.
 * 2 段階目の状態を読み込んで最初の画面を決める。確認済みや期限切れなら `onSessionChange` に返す。
 */
function useStatusView(
  api: SecondFactorApi,
  webauthn: WebAuthnClient,
  onSessionChange: () => void,
) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Kept in a ref: a new callback from the parent must not restart enrollment (a new secret).
  const sessionChangedRef = useRef(onSessionChange);
  useEffect(() => {
    sessionChangedRef.current = onSessionChange;
  });

  useEffect(() => {
    let active = true;
    setView({ kind: "loading" });
    api.status().then(
      (status) => {
        if (!active) return;
        const next = viewFor(status, webauthn.supported());
        if (next) setView(next);
        else sessionChangedRef.current();
      },
      (e: unknown) => {
        if (!active) return;
        if (refusedAs(e, "unauthorized")) sessionChangedRef.current();
        else setView({ kind: "loadFailed" });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, api, webauthn]);

  return { view, setView, reload: () => setAttempt((n) => n + 1) };
}

/**
 * The second step after Google sign-in. The first time, the user registers a passkey
 * (recommended) or an authenticator app; its recovery codes are shown once and saved before the
 * method is confirmed, and the other method is suggested afterwards. Later sign-ins use a
 * registered method or a recovery code.
 * Google のサインインのあとの 2 段階目。初回はパスキー（おすすめ）か認証アプリを登録し、復旧用コードを
 * 確定前に一度だけ見せる。登録後はもう一方も勧める。2 回目以降は登録した方法か復旧用コードで確認する。
 */
export function SecondFactorPage({
  api = secondFactorApi,
  webauthn = browserWebAuthn,
  onSessionChange,
  onSignOut,
}: {
  api?: SecondFactorApi;
  webauthn?: WebAuthnClient;
  /** Called when the session passed the second step or ran out of time; refresh it. */
  onSessionChange: () => void;
  /** Resolves false when the sign-out did not go through. */
  onSignOut: () => Promise<boolean>;
}) {
  const { view, setView, reload } = useStatusView(api, webauthn, onSessionChange);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Runs a step; an expired session goes back to sign-in, a registered factor reloads. */
  const run = (step: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    step()
      .catch((e: unknown) => {
        if (refusedAs(e, "unauthorized")) onSessionChange();
        else if (refusedAs(e, "already_enrolled")) reload();
        else setError(messageFor(e));
        if (refusedAs(e, "invalid_passkey") || refusedAs(e, "no_pending_registration")) {
          // The challenge is spent: start again from the first-time choice, or from the
          // suggestion when the passkey was being added to a method the user already has.
          setView((current) => {
            if (current.kind !== "enrollPasskey") return current;
            return current.first ? { kind: "choose" } : { kind: "suggest", other: "passkey" };
          });
        }
      })
      .finally(() => setBusy(false));
  };

  /** After a method is confirmed: suggest the other one the first time, else carry on. */
  const enrolled = (first: boolean, other: "passkey" | "totp") => {
    if (first && (other === "totp" || webauthn.supported())) setView({ kind: "suggest", other });
    else onSessionChange();
  };

  const startPasskey = (first: boolean) =>
    run(async () => {
      const { options, recoveryCodes } = await api.startPasskeyRegistration();
      setView({ kind: "enrollPasskey", options, recoveryCodes, first });
    });

  const startTotp = (first: boolean) =>
    run(async () => {
      const started = await api.startEnrollment();
      setView({ kind: "enrollTotp", ...started, first });
    });

  const signOut = async () => {
    setError(null);
    if (!(await onSignOut())) {
      setError("サインアウトできませんでした。時間をおいて再度お試しください。");
    }
  };

  return (
    <main class="sign-in second-factor">
      <h1>2 段階目の確認</h1>
      {view.kind === "loading" && <p class="muted">読み込み中…</p>}
      {view.kind === "loadFailed" && (
        <p role="alert">
          確認の方法を読み込めませんでした。{" "}
          <button type="button" onClick={reload}>
            再読み込み
          </button>
        </p>
      )}
      {view.kind === "choose" && (
        <ChooseView
          passkeySupported={webauthn.supported()}
          busy={busy}
          onPasskey={() => startPasskey(true)}
          onTotp={() => startTotp(true)}
        />
      )}
      {view.kind === "enrollPasskey" && (
        <PasskeyEnrollView
          recoveryCodes={view.recoveryCodes}
          busy={busy}
          onRegister={() =>
            run(async () => {
              const response = await prompt(() => webauthn.register(view.options));
              await api.confirmPasskeyRegistration(response);
              enrolled(view.first, "totp");
            })
          }
        />
      )}
      {view.kind === "enrollTotp" && (
        <TotpEnrollView
          secret={view.secret}
          uri={view.uri}
          recoveryCodes={view.recoveryCodes}
          busy={busy}
          onSubmit={(code) =>
            run(async () => {
              await api.confirmEnrollment(code);
              enrolled(view.first, "passkey");
            })
          }
        />
      )}
      {view.kind === "suggest" && (
        <SuggestView
          other={view.other}
          busy={busy}
          onAdd={() => (view.other === "passkey" ? startPasskey(false) : startTotp(false))}
          onLater={onSessionChange}
        />
      )}
      {view.kind === "verify" && (
        <VerifyView
          method={view.method}
          available={view.available}
          busy={busy}
          onPasskey={() =>
            run(async () => {
              const { options } = await api.startPasskeyAuthentication();
              await api.verifyPasskey(await prompt(() => webauthn.authenticate(options)));
              onSessionChange();
            })
          }
          onCode={(code) =>
            run(async () => {
              if (view.method === "totp") await api.verifyTotp(code);
              else await api.verifyRecoveryCode(code);
              onSessionChange();
            })
          }
          onSwitch={(method) => {
            setError(null);
            setView({ ...view, method });
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
      <button type="button" class="link-button" onClick={() => void signOut()}>
        サインアウト
      </button>
    </main>
  );
}

export default SecondFactorPage;
