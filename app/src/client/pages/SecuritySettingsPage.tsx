import { useEffect, useRef, useState } from "hono/jsx/dom";
import { PasskeyPromptError, messageFor, prompt, refusedAs } from "../lib/secondFactorErrors";
import {
  browserWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type WebAuthnClient,
} from "../lib/webauthn";
import {
  secondFactorApi,
  type PasskeySummary,
  type SecondFactorApi,
  type SecondFactorMethods,
} from "../secondFactorApi";
import {
  PasskeyEnrollView,
  TotpEnrollView,
  VerifyView,
  type VerifyMethod,
} from "./SecondFactorViews";

type Loaded =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; methods: SecondFactorMethods };

/** A change waiting for the user to say yes. */
type Confirming = { kind: "passkey"; id: string } | { kind: "totp" } | null;

/** What opens below the lists: adding a method, or the codes just made. */
type Panel =
  | { kind: "enrollPasskey"; options: PublicKeyCredentialCreationOptionsJSON }
  | { kind: "enrollTotp"; secret: string; uri: string }
  | { kind: "codes"; codes: string[]; offer: string; switched: boolean }
  | null;

/** Failures that leave the open panel to try again: a code to type again, a cancelled prompt. */
const retryable = (error: unknown) =>
  refusedAs(error, "invalid_code") || error instanceof PasskeyPromptError;

/** Refusals that mean the session is no longer fit for this page: let the app check it again. */
const sessionEnded = (error: unknown) =>
  refusedAs(error, "unauthorized") || refusedAs(error, "second_factor_required");

const day = (ms: number) => new Date(ms).toLocaleDateString("ja-JP");

/**
 * Reads the methods under a new ticket; only the latest ticket's answer is applied.
 * 新しい番号で一覧を読む。最新の番号の結果だけを反映する。
 */
function loadMethods(
  api: SecondFactorApi,
  ticketRef: { current: number },
  setLoaded: (loaded: Loaded) => void,
  onSessionEnded: () => void,
) {
  const ticket = ++ticketRef.current;
  const latest = () => ticketRef.current === ticket;
  api.methods().then(
    (methods) => {
      if (latest()) setLoaded({ status: "loaded", methods });
    },
    (e: unknown) => {
      if (!latest()) return;
      if (sessionEnded(e)) onSessionEnded();
      else setLoaded({ status: "failed" });
    },
  );
}

/**
 * Loads the methods; `reload` reads them again and keeps showing the old list meanwhile.
 * Reloads start from the event that needs them, not from an effect on a counter: hono/jsx can
 * run such an effect twice for one change.
 * 確認方法を読み込む。`reload` は読み直す間も前の一覧を出したままにする。
 */
function useMethods(api: SecondFactorApi, onSessionChange: () => void) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const ticketRef = useRef(0);
  const sessionChangedRef = useRef(onSessionChange);
  useEffect(() => {
    sessionChangedRef.current = onSessionChange;
  });

  useEffect(() => {
    loadMethods(api, ticketRef, setLoaded, () => sessionChangedRef.current());
    return () => {
      // Drops the answer of a load still in flight when the page goes away.
      ticketRef.current += 1;
    };
  }, [api]);

  const reload = () => loadMethods(api, ticketRef, setLoaded, () => sessionChangedRef.current());
  return { loaded, reload };
}

/** Asks for the second step again; changes are allowed for five minutes after it. */
function ReverifySection({
  methods,
  passkeySupported,
  busy,
  onPasskey,
  onCode,
}: {
  methods: SecondFactorMethods;
  passkeySupported: boolean;
  busy: boolean;
  onPasskey: () => void;
  onCode: (method: VerifyMethod, code: string) => void;
}) {
  const available: Record<VerifyMethod, boolean> = {
    passkey: methods.passkeys.length > 0 && passkeySupported,
    totp: methods.totp,
    recovery: methods.recoveryCodesRemaining > 0,
  };
  const first: VerifyMethod = available.passkey ? "passkey" : available.totp ? "totp" : "recovery";
  const [method, setMethod] = useState<VerifyMethod>(first);
  const shown = available[method] ? method : first;
  return (
    <section class="reverify">
      <h2>もう一度確認してください</h2>
      <p>確認方法を変えるには、2 段階目の確認がもう一度必要です。確認から 5 分間変更できます。</p>
      <VerifyView
        method={shown}
        available={available}
        busy={busy}
        onPasskey={onPasskey}
        onCode={(code) => onCode(shown, code)}
        onSwitch={setMethod}
      />
    </section>
  );
}

/** "Delete" and "Cancel" for a change the user asked for. */
function ConfirmRemoval({
  what,
  busy,
  onConfirm,
  onCancel,
}: {
  what: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div class="confirm" role="group" aria-label={`${what}の削除`}>
      <span>{what}を削除しますか？</span>
      <button type="button" class="danger-button" disabled={busy} onClick={onConfirm}>
        削除する
      </button>
      <button type="button" class="link-button" onClick={onCancel}>
        やめる
      </button>
    </div>
  );
}

/**
 * What the change buttons share: whether a change may start now (recently verified, nothing in
 * flight), whether a method may go (not the last one), and which removal awaits a yes.
 */
interface Controls {
  canChange: boolean;
  canRemove: boolean;
  busy: boolean;
  confirming: Confirming;
  setConfirming: (confirming: Confirming) => void;
}

function PasskeyItem({
  passkey,
  controls,
  onRemove,
}: {
  passkey: PasskeySummary;
  controls: Controls;
  onRemove: () => void;
}) {
  const { canChange, canRemove, busy, confirming, setConfirming } = controls;
  return (
    <li>
      <span class="method-name">{passkey.name}</span>
      <span class="muted">
        登録: {day(passkey.createdAt)} ・{" "}
        {passkey.lastUsedAt === null
          ? "まだ使っていません"
          : `最後に使った日: ${day(passkey.lastUsedAt)}`}
      </span>
      {confirming?.kind === "passkey" && confirming.id === passkey.id ? (
        <ConfirmRemoval
          what={passkey.name}
          busy={busy}
          onConfirm={onRemove}
          onCancel={() => setConfirming(null)}
        />
      ) : (
        <button
          type="button"
          disabled={!canChange || !canRemove}
          onClick={() => setConfirming({ kind: "passkey", id: passkey.id })}
        >
          {passkey.name} を削除
        </button>
      )}
    </li>
  );
}

function PasskeySection({
  passkeys,
  supported,
  controls,
  onRemove,
  onAdd,
}: {
  passkeys: PasskeySummary[];
  /** Whether this browser can make a passkey. */
  supported: boolean;
  controls: Controls;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section>
      <h2>パスキー</h2>
      {passkeys.length > 0 ? (
        <ul aria-label="登録したパスキー" class="method-list">
          {passkeys.map((passkey) => (
            <PasskeyItem
              passkey={passkey}
              controls={controls}
              onRemove={() => onRemove(passkey.id)}
            />
          ))}
        </ul>
      ) : (
        <p class="muted">パスキーは登録されていません。</p>
      )}
      {supported && (
        <button type="button" disabled={!controls.canChange} onClick={onAdd}>
          パスキーを追加
        </button>
      )}
    </section>
  );
}

function TotpSection({
  registered,
  controls,
  onRemove,
  onAdd,
}: {
  registered: boolean;
  controls: Controls;
  onRemove: () => void;
  onAdd: () => void;
}) {
  const { canChange, canRemove, busy, confirming, setConfirming } = controls;
  const asked = registered && confirming?.kind === "totp";
  return (
    <section>
      <h2>認証アプリ</h2>
      <p>認証アプリ: {registered ? "登録済み" : "未登録"}</p>
      {asked && (
        <ConfirmRemoval
          what="認証アプリ"
          busy={busy}
          onConfirm={onRemove}
          onCancel={() => setConfirming(null)}
        />
      )}
      {registered && !asked && (
        <button
          type="button"
          disabled={!canChange || !canRemove}
          onClick={() => setConfirming({ kind: "totp" })}
        >
          認証アプリを削除
        </button>
      )}
      {!registered && (
        <button type="button" disabled={!canChange} onClick={onAdd}>
          認証アプリを登録
        </button>
      )}
    </section>
  );
}

function RecoveryCodesSection({
  remaining,
  canChange,
  onRenew,
}: {
  remaining: number;
  canChange: boolean;
  onRenew: () => void;
}) {
  return (
    <section>
      <h2>復旧用コード</h2>
      <p>確認方法をすべて使えなくなったときに使います。残り {remaining} 個</p>
      <button type="button" disabled={!canChange} onClick={onRenew}>
        復旧用コードを作り直す
      </button>
    </section>
  );
}

/**
 * New recovery codes: shown first, switched to once the user ticks that they saved them. Until
 * then the old codes keep working, so nothing is lost when the page or the network fails.
 * 新しい復旧用コード。保存したと確かめてから切り替える。それまでは前のコードが使える。
 */
function NewCodesView({
  codes,
  switched,
  busy,
  onSwitch,
}: {
  codes: string[];
  switched: boolean;
  busy: boolean;
  onSwitch: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <>
      <h2>新しい復旧用コード</h2>
      <p>
        {switched
          ? "切り替えました。前のコードは使えなくなりました。"
          : "このコードを保存してから切り替えてください。切り替えるまでは前のコードが使えます。このコードは今しか表示されません。"}
      </p>
      <ol aria-label="新しい復旧用コード" class="recovery-codes" data-testid="new-recovery-codes">
        {codes.map((code) => (
          <li>{code}</li>
        ))}
      </ol>
      {!switched && (
        <>
          <label class="checkbox">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event: Event) => setSaved((event.target as HTMLInputElement).checked)}
              data-testid="new-recovery-codes-saved"
            />
            新しいコードを保存しました
          </label>
          <button type="button" disabled={busy || !saved} onClick={onSwitch}>
            このコードに切り替える
          </button>
        </>
      )}
    </>
  );
}

/** What opens below the lists. */
function PanelView({
  panel,
  busy,
  onRegisterPasskey,
  onConfirmTotp,
  onSwitchCodes,
  onClose,
}: {
  panel: Exclude<Panel, null>;
  busy: boolean;
  onRegisterPasskey: (options: PublicKeyCredentialCreationOptionsJSON) => void;
  onConfirmTotp: (code: string) => void;
  onSwitchCodes: (offer: string) => void;
  onClose: () => void;
}) {
  return (
    <section class="panel">
      {panel.kind === "enrollPasskey" && (
        <>
          <h2>パスキーを追加</h2>
          <PasskeyEnrollView busy={busy} onRegister={() => onRegisterPasskey(panel.options)} />
        </>
      )}
      {panel.kind === "enrollTotp" && (
        <>
          <h2>認証アプリを登録</h2>
          <TotpEnrollView
            secret={panel.secret}
            uri={panel.uri}
            busy={busy}
            onSubmit={onConfirmTotp}
          />
        </>
      )}
      {panel.kind === "codes" && (
        <NewCodesView
          codes={panel.codes}
          switched={panel.switched}
          busy={busy}
          onSwitch={() => onSwitchCodes(panel.offer)}
        />
      )}
      <button type="button" class="link-button" onClick={onClose}>
        {panel.kind === "codes" && panel.switched ? "閉じる" : "やめる"}
      </button>
    </section>
  );
}

/**
 * The requests behind the page's buttons. Each runs one at a time; a refusal is explained and
 * the list is read again, since it may be what changed.
 * ボタンの裏の操作。1 つずつ実行し、断られたら理由を出して一覧を読み直す。
 */
function useChanges(
  api: SecondFactorApi,
  webauthn: WebAuthnClient,
  reload: () => void,
  onSessionChange: () => void,
) {
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Runs a step; `keepsPanel` says which failures leave the open panel to try again. */
  const run = (step: () => Promise<void>, keepsPanel = retryable) => {
    setBusy(true);
    setError(null);
    step()
      .catch((e: unknown) => {
        if (sessionEnded(e)) return onSessionChange();
        setError(messageFor(e));
        if (!refusedAs(e, "invalid_code")) setConfirming(null);
        if (!keepsPanel(e)) setPanel(null);
        reload();
      })
      .finally(() => setBusy(false));
  };

  /** After a change went through: close what was open and read the list again. */
  const changed = () => {
    setConfirming(null);
    setPanel(null);
    reload();
  };

  const actions = {
    verifyPasskey: () =>
      run(async () => {
        const { options } = await api.startPasskeyAuthentication();
        await api.verifyPasskey(await prompt(() => webauthn.authenticate(options)));
        reload();
      }),
    verifyCode: (method: VerifyMethod, code: string) =>
      run(async () => {
        if (method === "totp") await api.verifyTotp(code);
        else await api.verifyRecoveryCode(code);
        reload();
      }),
    removePasskey: (id: string) =>
      run(async () => {
        await api.deletePasskey(id);
        changed();
      }),
    removeTotp: () =>
      run(async () => {
        await api.deleteTotp();
        changed();
      }),
    startPasskey: () =>
      run(async () => {
        const { options } = await api.startPasskeyRegistration();
        setPanel({ kind: "enrollPasskey", options });
      }),
    registerPasskey: (options: PublicKeyCredentialCreationOptionsJSON) =>
      run(async () => {
        await api.confirmPasskeyRegistration(await prompt(() => webauthn.register(options)));
        changed();
      }),
    startTotp: () =>
      run(async () => {
        const { secret, uri } = await api.startEnrollment();
        setPanel({ kind: "enrollTotp", secret, uri });
      }),
    confirmTotp: (code: string) =>
      run(async () => {
        await api.confirmEnrollment(code);
        changed();
      }),
    renewCodes: () =>
      run(async () => {
        const { recoveryCodes, offer } = await api.newRecoveryCodes();
        setConfirming(null);
        setPanel({ kind: "codes", codes: recoveryCodes, offer, switched: false });
      }),
    // Any failure but a spent offer keeps the codes on screen: the same offer can be sent again.
    switchCodes: (offer: string) =>
      run(
        async () => {
          await api.confirmRecoveryCodes(offer);
          setPanel((current) =>
            current?.kind === "codes" ? { ...current, switched: true } : current,
          );
          reload();
        },
        (e) => !refusedAs(e, "invalid_offer"),
      ),
    closePanel: () => setPanel(null),
  };

  return { confirming, setConfirming, panel, error, busy, actions };
}

/**
 * Lists the second-factor methods and changes them: add or remove a passkey or the
 * authenticator app, and make new recovery codes. Changes need the second step within the last
 * five minutes; past that the page asks for it again first. The last method cannot be removed.
 * 確認方法の一覧と変更。パスキー・認証アプリの追加と削除、復旧用コードの作り直し。変更には直近 5 分以内の
 * 2 段階目の確認が要り、過ぎていればここでもう一度確認する。最後の 1 つは削除できない。
 */
export function SecuritySettingsPage({
  api = secondFactorApi,
  webauthn = browserWebAuthn,
  onSessionChange,
}: {
  api?: SecondFactorApi;
  webauthn?: WebAuthnClient;
  /** Called when the session ran out or lost its second step; refresh it. */
  onSessionChange: () => void;
}) {
  const { loaded, reload } = useMethods(api, onSessionChange);
  const { confirming, setConfirming, panel, error, busy, actions } = useChanges(
    api,
    webauthn,
    reload,
    onSessionChange,
  );

  if (loaded.status === "loading") return <p class="muted">読み込み中…</p>;
  if (loaded.status === "failed") {
    return (
      <p role="alert">
        確認方法を読み込めませんでした。{" "}
        <button type="button" onClick={reload}>
          再読み込み
        </button>
      </p>
    );
  }

  const { methods } = loaded;
  const verified = methods.recentlyVerified;
  const canRemove = methods.passkeys.length + (methods.totp ? 1 : 0) > 1;
  const passkeySupported = webauthn.supported();
  const controls: Controls = {
    canChange: verified && !busy && panel === null,
    canRemove,
    busy,
    confirming,
    setConfirming,
  };

  return (
    <section class="security-settings">
      <h1>セキュリティ</h1>
      <p class="muted">
        Google のサインインのあとに使う 2 段階目の確認方法です。最後の 1 つは削除できません。
        {!canRemove && "ほかの確認方法を登録すると削除できます。"}
      </p>
      {!verified && (
        <ReverifySection
          methods={methods}
          passkeySupported={passkeySupported}
          busy={busy}
          onPasskey={actions.verifyPasskey}
          onCode={actions.verifyCode}
        />
      )}
      <PasskeySection
        passkeys={methods.passkeys}
        supported={passkeySupported}
        controls={controls}
        onRemove={actions.removePasskey}
        onAdd={actions.startPasskey}
      />
      <TotpSection
        registered={methods.totp}
        controls={controls}
        onRemove={actions.removeTotp}
        onAdd={actions.startTotp}
      />
      <RecoveryCodesSection
        remaining={methods.recoveryCodesRemaining}
        canChange={controls.canChange}
        onRenew={actions.renewCodes}
      />
      {panel && (
        <PanelView
          panel={panel}
          busy={busy}
          onRegisterPasskey={actions.registerPasskey}
          onConfirmTotp={actions.confirmTotp}
          onSwitchCodes={actions.switchCodes}
          onClose={actions.closePanel}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default SecuritySettingsPage;
