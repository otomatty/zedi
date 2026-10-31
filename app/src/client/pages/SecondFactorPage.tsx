import { useEffect, useRef, useState } from "hono/jsx/dom";
import { qrCode } from "../lib/qrCode";
import { SecondFactorError, secondFactorApi, type SecondFactorApi } from "../secondFactorApi";

type View =
  | { kind: "loading" }
  | { kind: "loadFailed" }
  | { kind: "enroll"; secret: string; uri: string }
  | { kind: "recoveryCodes"; codes: string[] }
  | { kind: "verify"; method: "totp" | "recovery" };

const refusedAs = (error: unknown, reason: SecondFactorError["reason"]) =>
  error instanceof SecondFactorError && error.reason === reason;

function messageFor(error: unknown): string {
  if (refusedAs(error, "invalid_code")) {
    return "コードが正しくありません。もう一度入力してください。";
  }
  if (error instanceof SecondFactorError && error.reason === "too_many_attempts") {
    const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 15 * 60) / 60));
    return `試行回数が上限に達しました。${minutes} 分ほど待ってから再度お試しください。`;
  }
  return "確認できませんでした。時間をおいて再度お試しください。";
}

/** Splits a Base32 secret into groups of four so it can be typed by hand. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

function QrCode({ text }: { text: string }) {
  const { size, path } = qrCode(text);
  return (
    <svg
      role="img"
      aria-label="認証アプリ用の QR コード"
      class="qr-code"
      viewBox={`0 0 ${size} ${size}`}
      width="200"
      height="200"
      shape-rendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

function CodeForm({
  label,
  button,
  numeric,
  busy,
  testId,
  onSubmit,
}: {
  label: string;
  button: string;
  numeric: boolean;
  busy: boolean;
  testId: string;
  onSubmit: (code: string) => void;
}) {
  return (
    <form
      onSubmit={(event: Event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        onSubmit(String(new FormData(form).get("code") ?? ""));
      }}
    >
      <label>
        {label}
        <input
          name="code"
          required
          autocomplete={numeric ? "one-time-code" : "off"}
          inputmode={numeric ? "numeric" : "text"}
          data-testid={testId}
        />
      </label>
      <button type="submit" disabled={busy} data-testid={`${testId}-submit`}>
        {button}
      </button>
    </form>
  );
}

function EnrollView({
  secret,
  uri,
  busy,
  onSubmit,
}: {
  secret: string;
  uri: string;
  busy: boolean;
  onSubmit: (code: string) => void;
}) {
  return (
    <section>
      <p>
        Zedi では、Google のサインインに加えて 2 段階目の確認が必要です。認証アプリ（Google
        Authenticator や 1Password など）でこの QR コードを読み取り、表示された 6
        桁のコードを入力してください。
      </p>
      <QrCode text={uri} />
      <p class="muted">
        読み取れないときは、次のキーを入力してください:{" "}
        <code data-testid="totp-secret">{grouped(secret)}</code>
      </p>
      <p>
        <a href={uri}>この端末の認証アプリで開く</a>
      </p>
      <CodeForm
        label="6 桁のコード"
        button="登録する"
        numeric
        busy={busy}
        testId="totp-code"
        onSubmit={onSubmit}
      />
    </section>
  );
}

function RecoveryCodesView({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  return (
    <section>
      <h2>復旧用コードを保存してください</h2>
      <p>
        認証アプリを使えなくなったときに、ここに並んだコードでサインインできます。1 つにつき 1
        回だけ使えます。このコードは今しか表示されません。
      </p>
      <ol aria-label="復旧用コード" class="recovery-codes" data-testid="recovery-codes">
        {codes.map((code) => (
          <li>{code}</li>
        ))}
      </ol>
      <button type="button" onClick={onSaved} data-testid="recovery-codes-saved">
        保存しました
      </button>
    </section>
  );
}

function VerifyView({
  method,
  busy,
  onSubmit,
  onSwitch,
}: {
  method: "totp" | "recovery";
  busy: boolean;
  onSubmit: (code: string) => void;
  onSwitch: () => void;
}) {
  const totp = method === "totp";
  return (
    <section>
      <p>
        {totp
          ? "認証アプリに表示されている 6 桁のコードを入力してください。"
          : "保存しておいた復旧用コードを 1 つ入力してください。使ったコードは使えなくなります。"}
      </p>
      <CodeForm
        label={totp ? "6 桁のコード" : "復旧用コード"}
        button="確認する"
        numeric={totp}
        busy={busy}
        testId={totp ? "totp-code" : "recovery-code"}
        onSubmit={onSubmit}
      />
      <button type="button" class="link-button" onClick={onSwitch}>
        {totp ? "復旧用コードを使う" : "認証アプリのコードを使う"}
      </button>
    </section>
  );
}

/**
 * The second step after Google sign-in: register an authenticator app the first time (then
 * show the recovery codes once), and afterwards enter its code or a recovery code.
 * Google のサインインのあとの 2 段階目。初回は認証アプリを登録して復旧用コードを一度だけ表示し、
 * 2 回目以降はそのコードか復旧用コードを入力する。
 */
export function SecondFactorPage({
  api = secondFactorApi,
  onSessionChange,
  onSignOut,
}: {
  api?: SecondFactorApi;
  /** Called when the session passed the second step or ran out of time; refresh it. */
  onSessionChange: () => void;
  /** Resolves false when the sign-out did not go through. */
  onSignOut: () => Promise<boolean>;
}) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Kept in a ref: a new callback from the parent must not restart enrollment (a new secret).
  const sessionChangedRef = useRef(onSessionChange);
  useEffect(() => {
    sessionChangedRef.current = onSessionChange;
  });

  useEffect(() => {
    let active = true;
    setView({ kind: "loading" });
    const load = async (): Promise<View | null> => {
      const status = await api.status();
      if (status.verified) return null;
      if (status.totp) return { kind: "verify", method: "totp" };
      try {
        return { kind: "enroll", ...(await api.startEnrollment()) };
      } catch (e) {
        if (refusedAs(e, "already_enrolled")) return { kind: "verify", method: "totp" };
        throw e;
      }
    };
    load().then(
      (next) => {
        if (!active) return;
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
  }, [attempt, api]);

  const submit = (send: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    send()
      .catch((e: unknown) => {
        if (refusedAs(e, "unauthorized")) onSessionChange();
        else setError(messageFor(e));
      })
      .finally(() => setBusy(false));
  };

  const signOut = async () => {
    setError(null);
    if (!(await onSignOut())) {
      setError("サインアウトできませんでした。時間をおいて再度お試しください。");
    }
  };

  const switchTo = (method: "totp" | "recovery") => {
    setError(null);
    setView({ kind: "verify", method });
  };

  return (
    <main class="sign-in second-factor">
      <h1>2 段階目の確認</h1>
      {view.kind === "loading" && <p class="muted">読み込み中…</p>}
      {view.kind === "loadFailed" && (
        <p role="alert">
          確認の方法を読み込めませんでした。{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            再読み込み
          </button>
        </p>
      )}
      {view.kind === "enroll" && (
        <EnrollView
          secret={view.secret}
          uri={view.uri}
          busy={busy}
          onSubmit={(code) =>
            submit(async () => {
              const { recoveryCodes } = await api.confirmEnrollment(code);
              setView({ kind: "recoveryCodes", codes: recoveryCodes });
            })
          }
        />
      )}
      {view.kind === "recoveryCodes" && (
        <RecoveryCodesView codes={view.codes} onSaved={onSessionChange} />
      )}
      {view.kind === "verify" && (
        <VerifyView
          method={view.method}
          busy={busy}
          onSubmit={(code) =>
            submit(async () => {
              if (view.method === "totp") await api.verifyTotp(code);
              else await api.verifyRecoveryCode(code);
              onSessionChange();
            })
          }
          onSwitch={() => switchTo(view.method === "totp" ? "recovery" : "totp")}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {view.kind !== "recoveryCodes" && (
        <button type="button" class="link-button" onClick={() => void signOut()}>
          サインアウト
        </button>
      )}
    </main>
  );
}

export default SecondFactorPage;
