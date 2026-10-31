import { useState } from "hono/jsx/dom";
import { qrCode } from "../lib/qrCode";

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
  /** Keeps the form from being sent (a request in flight, or a step still to do). */
  busy: boolean;
  testId: string;
  onSubmit: (code: string) => void;
}) {
  return (
    <form
      onSubmit={(event: Event) => {
        event.preventDefault();
        if (busy) return;
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

/**
 * The recovery codes of a first factor, with the "saved" tick the next step waits for. Renders
 * nothing (and counts as saved) when a method is added and no codes come with it.
 * 最初の確認方法の復旧用コードと「保存しました」のチェック。コードがなければ何も出さない。
 */
function useRecoveryCodes(codes: string[] | undefined) {
  const [saved, setSaved] = useState(false);
  const view = codes ? (
    <>
      <h2>復旧用コードを保存してください</h2>
      <p>
        確認方法を使えなくなったときに、ここに並んだコードでサインインできます。1 つにつき 1
        回だけ使えます。このコードは今しか表示されません。
      </p>
      <ol aria-label="復旧用コード" class="recovery-codes" data-testid="recovery-codes">
        {codes.map((code) => (
          <li>{code}</li>
        ))}
      </ol>
      <label class="checkbox">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event: Event) => setSaved((event.target as HTMLInputElement).checked)}
          data-testid="recovery-codes-saved"
        />
        復旧用コードを保存しました
      </label>
    </>
  ) : null;
  return { saved: !codes || saved, view };
}

/** The first time: a passkey (recommended where the browser supports it) or an authenticator app. */
export function ChooseView({
  passkeySupported,
  busy,
  onPasskey,
  onTotp,
}: {
  passkeySupported: boolean;
  busy: boolean;
  onPasskey: () => void;
  onTotp: () => void;
}) {
  return (
    <section>
      <p>
        Zedi では、Google のサインインに加えて 2
        段階目の確認が必要です。確認に使う方法を登録してください。
      </p>
      {passkeySupported && (
        <button type="button" disabled={busy} onClick={onPasskey} data-testid="choose-passkey">
          パスキーを登録する（おすすめ）
        </button>
      )}
      <button type="button" disabled={busy} onClick={onTotp} data-testid="choose-totp">
        認証アプリを使う
      </button>
    </section>
  );
}

/** Registering an authenticator app: QR code, secret, the first factor's codes, first code. */
export function TotpEnrollView({
  secret,
  uri,
  recoveryCodes,
  busy,
  onSubmit,
}: {
  secret: string;
  uri: string;
  recoveryCodes?: string[];
  busy: boolean;
  onSubmit: (code: string) => void;
}) {
  const codes = useRecoveryCodes(recoveryCodes);
  return (
    <section>
      <p>
        認証アプリ（Google Authenticator や 1Password など）でこの QR コードを読み取ってください。
      </p>
      <QrCode text={uri} />
      <p class="muted">
        読み取れないときは、次のキーを入力してください:{" "}
        <code data-testid="totp-secret">{grouped(secret)}</code>
      </p>
      <p>
        <a href={uri}>この端末の認証アプリで開く</a>
      </p>
      {codes.view}
      <CodeForm
        label="6 桁のコード"
        button="登録する"
        numeric
        busy={busy || !codes.saved}
        testId="totp-code"
        onSubmit={onSubmit}
      />
    </section>
  );
}

/** Registering a passkey: the first factor's codes, then the browser's prompt. */
export function PasskeyEnrollView({
  recoveryCodes,
  busy,
  onRegister,
}: {
  recoveryCodes?: string[];
  busy: boolean;
  onRegister: () => void;
}) {
  const codes = useRecoveryCodes(recoveryCodes);
  return (
    <section>
      <p>
        この端末やパスワード管理アプリにパスキーを作ります。指紋・顔認証・画面ロックなどで確認します。
      </p>
      {codes.view}
      <button
        type="button"
        disabled={busy || !codes.saved}
        onClick={onRegister}
        data-testid="passkey-register"
      >
        パスキーを登録
      </button>
    </section>
  );
}

/** After the first method: suggests registering the other one too. */
export function SuggestView({
  other,
  busy,
  onAdd,
  onLater,
}: {
  other: "passkey" | "totp";
  busy: boolean;
  onAdd: () => void;
  onLater: () => void;
}) {
  return (
    <section>
      <p>
        確認方法をもう 1
        つ登録しておくと、端末をなくしたときにも復旧用コードを使わずにサインインできます。
      </p>
      <button type="button" disabled={busy} onClick={onAdd} data-testid="suggest-add">
        {other === "passkey" ? "パスキーも登録する" : "認証アプリも登録する"}
      </button>
      <button type="button" class="link-button" onClick={onLater} data-testid="suggest-later">
        あとで
      </button>
    </section>
  );
}

/** One way to pass the second step. */
export type VerifyMethod = "passkey" | "totp" | "recovery";

/** Signing in again: the chosen method, and links to the user's other ones. */
export function VerifyView({
  method,
  available,
  busy,
  onPasskey,
  onCode,
  onSwitch,
}: {
  method: VerifyMethod;
  available: Record<VerifyMethod, boolean>;
  busy: boolean;
  onPasskey: () => void;
  onCode: (code: string) => void;
  onSwitch: (method: VerifyMethod) => void;
}) {
  const links: [VerifyMethod, string][] = [
    ["passkey", "パスキーを使う"],
    ["totp", "認証アプリのコードを使う"],
    ["recovery", "復旧用コードを使う"],
  ];
  return (
    <section>
      {method === "passkey" && (
        <>
          <p>登録したパスキーで確認してください。</p>
          <button type="button" disabled={busy} onClick={onPasskey} data-testid="passkey-verify">
            パスキーで確認
          </button>
        </>
      )}
      {method === "totp" && (
        <>
          <p>認証アプリに表示されている 6 桁のコードを入力してください。</p>
          <CodeForm
            label="6 桁のコード"
            button="確認する"
            numeric
            busy={busy}
            testId="totp-code"
            onSubmit={onCode}
          />
        </>
      )}
      {method === "recovery" && (
        <>
          <p>保存しておいた復旧用コードを 1 つ入力してください。使ったコードは使えなくなります。</p>
          <CodeForm
            label="復旧用コード"
            button="確認する"
            numeric={false}
            busy={busy}
            testId="recovery-code"
            onSubmit={onCode}
          />
        </>
      )}
      {links
        .filter(([other]) => other !== method && available[other])
        .map(([other, label]) => (
          <button type="button" class="link-button" onClick={() => onSwitch(other)}>
            {label}
          </button>
        ))}
    </section>
  );
}
