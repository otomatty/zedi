// @vitest-environment happy-dom
import { findByLabelText, findByRole, fireEvent, queryByRole, waitFor } from "@testing-library/dom";
import { render, useState } from "hono/jsx/dom";
import { describe, expect, it, vi } from "vitest";
import type { WebAuthnClient } from "../lib/webauthn";
import { SecondFactorError, type SecondFactorApi } from "../secondFactorApi";
import { SecondFactorPage } from "./SecondFactorPage";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/Zedi:a%40test.zedi-note.app?secret=${SECRET}&issuer=Zedi`;
const CODES = Array.from({ length: 10 }, (_, i) => `AAAA-BBBB-CCCC-${String(i).padStart(4, "0")}`);
const REG_OPTIONS = { challenge: "reg-challenge" } as never;
const AUTH_OPTIONS = { challenge: "auth-challenge" } as never;
const REG_RESPONSE = { id: "cred", type: "public-key" } as never;
const AUTH_RESPONSE = { id: "cred", type: "public-key", response: {} } as never;

type Status = Awaited<ReturnType<SecondFactorApi["status"]>>;
const statusOf = (factors: Partial<Status> = {}): Status => ({
  verified: false,
  totp: false,
  passkeys: 0,
  recoveryCodesRemaining: 0,
  ...factors,
});

function fakeApi(overrides: Partial<SecondFactorApi> = {}): SecondFactorApi {
  return {
    status: vi.fn(async () => statusOf()),
    startEnrollment: vi.fn(async () => ({ secret: SECRET, uri: URI, recoveryCodes: CODES })),
    confirmEnrollment: vi.fn(async () => ({})),
    verifyTotp: vi.fn(async () => ({})),
    verifyRecoveryCode: vi.fn(async () => ({ recoveryCodesRemaining: 9 })),
    startPasskeyRegistration: vi.fn(async () => ({ options: REG_OPTIONS, recoveryCodes: CODES })),
    confirmPasskeyRegistration: vi.fn(async () => ({})),
    startPasskeyAuthentication: vi.fn(async () => ({ options: AUTH_OPTIONS })),
    verifyPasskey: vi.fn(async () => ({})),
    ...overrides,
  };
}

function fakeWebAuthn(overrides: Partial<WebAuthnClient> = {}): WebAuthnClient {
  return {
    supported: () => true,
    register: vi.fn(async () => REG_RESPONSE),
    authenticate: vi.fn(async () => AUTH_RESPONSE),
    ...overrides,
  };
}

const withFactors = (factors: Partial<Status>) => vi.fn(async () => statusOf(factors));

function mount(api: SecondFactorApi, webauthn = fakeWebAuthn(), signOutWorks = true) {
  const container = document.createElement("div");
  document.body.append(container);
  const onSessionChange = vi.fn();
  const onSignOut = vi.fn(async () => signOutWorks);
  render(
    <SecondFactorPage
      api={api}
      webauthn={webauthn}
      onSessionChange={onSessionChange}
      onSignOut={onSignOut}
    />,
    container,
  );
  return { container, onSessionChange, onSignOut, webauthn };
}

/**
 * Types into a field and submits its form. hono/jsx/dom reads `detail` from submit events a
 * script dispatched (it supports form actions), and happy-dom's submit is such an event, so the
 * test dispatches one that carries `detail`; the smoke test clicks the button in Chromium.
 * 入力して送信する。happy-dom の送信イベントは hono/jsx/dom が `detail` を読む種類なので、それを持たせる。
 */
async function enter(container: HTMLElement, label: string, value: string, button: string) {
  const input = (await findByLabelText(container, label)) as HTMLInputElement;
  fireEvent.input(input, { target: { value } });
  const submit = (await findByRole(container, "button", { name: button })) as HTMLButtonElement;
  expect(submit.type).toBe("submit");
  submit.form?.dispatchEvent(
    new CustomEvent("submit", { bubbles: true, cancelable: true, detail: {} }),
  );
}

/** Clicks a button once it is enabled (a step that just finished re-enables it). */
async function click(container: HTMLElement, name: string) {
  const button = (await findByRole(container, "button", { name })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

/** Ticks "the recovery codes are saved". */
async function confirmSaved(container: HTMLElement) {
  const box = (await findByLabelText(container, "復旧用コードを保存しました")) as HTMLInputElement;
  fireEvent.click(box);
  expect(box.checked).toBe(true);
}

const codesShown = async (container: HTMLElement) => {
  const list = await findByRole(container, "list", { name: "復旧用コード" });
  return [...list.querySelectorAll("li")].map((li) => li.textContent);
};

describe("SecondFactorPage: choosing the first method", () => {
  it("recommends a passkey and offers an authenticator app instead", async () => {
    const api = fakeApi();
    const { container } = mount(api);
    expect(
      await findByRole(container, "button", { name: "パスキーを登録する（おすすめ）" }),
    ).toBeTruthy();
    expect(await findByRole(container, "button", { name: "認証アプリを使う" })).toBeTruthy();
    expect(api.startEnrollment).not.toHaveBeenCalled();
    expect(api.startPasskeyRegistration).not.toHaveBeenCalled();
  });

  it("offers only the authenticator app where the browser cannot use passkeys", async () => {
    const { container } = mount(fakeApi(), fakeWebAuthn({ supported: () => false }));
    expect(await findByRole(container, "button", { name: "認証アプリを使う" })).toBeTruthy();
    expect(queryByRole(container, "button", { name: "パスキーを登録する（おすすめ）" })).toBeNull();
  });
});

describe("SecondFactorPage: registering a passkey first", () => {
  it("shows the recovery codes, and registers the passkey only once they are saved", async () => {
    const api = fakeApi();
    const { container, webauthn } = mount(api);
    await click(container, "パスキーを登録する（おすすめ）");

    expect(await codesShown(container)).toEqual(CODES);
    const register = (await findByRole(container, "button", {
      name: "パスキーを登録",
    })) as HTMLButtonElement;
    expect(register.disabled).toBe(true);

    await confirmSaved(container);
    fireEvent.click(register);
    await waitFor(() => expect(api.confirmPasskeyRegistration).toHaveBeenCalledWith(REG_RESPONSE));
    expect(webauthn.register).toHaveBeenCalledWith(REG_OPTIONS);
  });

  it("then suggests an authenticator app as well, which can wait", async () => {
    const { container, onSessionChange } = mount(fakeApi());
    await click(container, "パスキーを登録する（おすすめ）");
    await confirmSaved(container);
    await click(container, "パスキーを登録");

    expect(await findByRole(container, "button", { name: "認証アプリも登録する" })).toBeTruthy();
    expect(onSessionChange).not.toHaveBeenCalled();
    await click(container, "あとで");
    expect(onSessionChange).toHaveBeenCalledTimes(1);
  });

  it("says so when the passkey prompt is cancelled, and lets the user try again", async () => {
    const cancelled = Object.assign(new Error("cancelled"), { name: "NotAllowedError" });
    const register = vi
      .fn<WebAuthnClient["register"]>()
      .mockRejectedValueOnce(cancelled)
      .mockResolvedValueOnce(REG_RESPONSE);
    const api = fakeApi();
    const { container } = mount(api, fakeWebAuthn({ register }));
    await click(container, "パスキーを登録する（おすすめ）");
    await confirmSaved(container);
    await click(container, "パスキーを登録");

    expect((await findByRole(container, "alert")).textContent).toContain("取り消されました");
    expect(api.confirmPasskeyRegistration).not.toHaveBeenCalled();
    await click(container, "パスキーを登録");
    await waitFor(() => expect(api.confirmPasskeyRegistration).toHaveBeenCalledTimes(1));
  });

  it("says so when the server does not accept the passkey", async () => {
    const api = fakeApi({
      confirmPasskeyRegistration: vi.fn(async () => {
        throw new SecondFactorError("invalid_passkey");
      }),
    });
    const { container, onSessionChange } = mount(api);
    await click(container, "パスキーを登録する（おすすめ）");
    await confirmSaved(container);
    await click(container, "パスキーを登録");

    expect((await findByRole(container, "alert")).textContent).toContain(
      "パスキーを確認できませんでした",
    );
    expect(onSessionChange).not.toHaveBeenCalled();
  });
});

describe("SecondFactorPage: registering an authenticator app first", () => {
  async function chooseApp(api = fakeApi(), webauthn = fakeWebAuthn()) {
    const mounted = mount(api, webauthn);
    await click(mounted.container, "認証アプリを使う");
    return mounted;
  }

  it("shows the QR code, the secret and the recovery codes together", async () => {
    const { container } = await chooseApp();
    expect(await findByRole(container, "img", { name: "認証アプリ用の QR コード" })).toBeTruthy();
    expect(container.querySelector("[data-testid=totp-secret]")?.textContent).toBe(
      "JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP",
    );
    const open = await findByRole(container, "link", { name: "この端末の認証アプリで開く" });
    expect(open.getAttribute("href")).toBe(URI);
    expect(await codesShown(container)).toEqual(CODES);
  });

  it("takes the first code only once the user says the recovery codes are saved", async () => {
    // 確定の応答が失われてもよいように、コードは確定の前に見せて保存してもらう。
    // The codes are shown and saved before confirming, so a lost confirmation loses nothing.
    const api = fakeApi();
    const { container } = await chooseApp(api);
    const submit = (await findByRole(container, "button", {
      name: "登録する",
    })) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await enter(container, "6 桁のコード", "123456", "登録する");
    expect(api.confirmEnrollment).not.toHaveBeenCalled();

    await confirmSaved(container);
    expect(submit.disabled).toBe(false);
    await enter(container, "6 桁のコード", "123 456", "登録する");
    await waitFor(() => expect(api.confirmEnrollment).toHaveBeenCalledWith("123 456"));
  });

  it("says a wrong code is wrong, and lets the user try again", async () => {
    const confirmEnrollment = vi
      .fn<SecondFactorApi["confirmEnrollment"]>()
      .mockRejectedValueOnce(new SecondFactorError("invalid_code"))
      .mockResolvedValueOnce({});
    const { container } = await chooseApp(fakeApi({ confirmEnrollment }));
    await confirmSaved(container);

    await enter(container, "6 桁のコード", "000000", "登録する");
    expect((await findByRole(container, "alert")).textContent).toContain(
      "コードが正しくありません",
    );
    await enter(container, "6 桁のコード", "123456", "登録する");
    await waitFor(() => expect(confirmEnrollment).toHaveBeenCalledTimes(2));
  });

  it("then suggests a passkey, registered without new recovery codes", async () => {
    const api = fakeApi({
      startPasskeyRegistration: vi.fn(async () => ({ options: REG_OPTIONS })),
    });
    const { container, onSessionChange } = await chooseApp(api);
    await confirmSaved(container);
    await enter(container, "6 桁のコード", "123456", "登録する");

    await click(container, "パスキーも登録する");
    const register = (await findByRole(container, "button", {
      name: "パスキーを登録",
    })) as HTMLButtonElement;
    expect(queryByRole(container, "list", { name: "復旧用コード" })).toBeNull();
    // No codes to save when a method is added: the button is usable without the tick.
    await waitFor(() => expect(register.disabled).toBe(false));
    fireEvent.click(register);
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
    expect(api.confirmPasskeyRegistration).toHaveBeenCalledWith(REG_RESPONSE);
  });

  it("goes straight on where the browser cannot use passkeys", async () => {
    const { container, onSessionChange } = await chooseApp(
      fakeApi(),
      fakeWebAuthn({ supported: () => false }),
    );
    await confirmSaved(container);
    await enter(container, "6 桁のコード", "123456", "登録する");
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
  });

  it("says when the other method can no longer be added from this sign-in", async () => {
    const api = fakeApi({
      startPasskeyRegistration: vi.fn(async () => {
        throw new SecondFactorError("reverification_required");
      }),
    });
    const { container, onSessionChange } = await chooseApp(api);
    await confirmSaved(container);
    await enter(container, "6 桁のコード", "123456", "登録する");
    await click(container, "パスキーも登録する");

    expect((await findByRole(container, "alert")).textContent).toContain("時間が経った");
    await click(container, "あとで");
    expect(onSessionChange).toHaveBeenCalledTimes(1);
  });

  it("keeps the same secret when the parent re-renders with a new callback", async () => {
    // 親の再描画で登録をやり直すと、読み取った QR コードの秘密鍵が無効になってしまう。
    // Restarting enrollment on a parent re-render would invalidate the QR code just scanned.
    const api = fakeApi();
    const webauthn = fakeWebAuthn();
    const container = document.createElement("div");
    document.body.append(container);
    function Parent() {
      const [renders, setRenders] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setRenders((n) => n + 1)}>
            再描画 {renders}
          </button>
          <SecondFactorPage
            api={api}
            webauthn={webauthn}
            onSessionChange={() => {}}
            onSignOut={async () => true}
          />
        </div>
      );
    }
    render(<Parent />, container);
    await click(container, "認証アプリを使う");
    await findByRole(container, "img", { name: "認証アプリ用の QR コード" });

    fireEvent.click(await findByRole(container, "button", { name: "再描画 0" }));
    await findByRole(container, "button", { name: "再描画 1" });
    // Effects run after the DOM updates; give a restart the chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(api.startEnrollment).toHaveBeenCalledTimes(1);
    expect(api.status).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-testid=totp-secret]")).toBeTruthy();
  });

  it("asks for the second step instead when a method was registered in the meantime", async () => {
    const status = vi
      .fn<SecondFactorApi["status"]>()
      .mockResolvedValueOnce(statusOf())
      .mockResolvedValue(statusOf({ totp: true, recoveryCodesRemaining: 10 }));
    const api = fakeApi({
      status,
      startEnrollment: vi.fn(async () => {
        throw new SecondFactorError("already_enrolled");
      }),
    });
    const { container } = await chooseApp(api);
    expect(await findByRole(container, "button", { name: "確認する" })).toBeTruthy();
    expect(container.querySelector("[data-testid=totp-secret]")).toBeNull();
  });
});

describe("SecondFactorPage: signing in again", () => {
  it("asks a user with a passkey to use it", async () => {
    const api = fakeApi({ status: withFactors({ passkeys: 1, recoveryCodesRemaining: 10 }) });
    const { container, onSessionChange, webauthn } = mount(api);

    await click(container, "パスキーで確認");

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
    expect(webauthn.authenticate).toHaveBeenCalledWith(AUTH_OPTIONS);
    expect(api.verifyPasskey).toHaveBeenCalledWith(AUTH_RESPONSE);
    expect(queryByRole(container, "button", { name: "認証アプリのコードを使う" })).toBeNull();
    expect(await findByRole(container, "button", { name: "復旧用コードを使う" })).toBeTruthy();
  });

  it("says so when the passkey is not accepted", async () => {
    const api = fakeApi({
      status: withFactors({ passkeys: 1 }),
      verifyPasskey: vi.fn(async () => {
        throw new SecondFactorError("invalid_passkey");
      }),
    });
    const { container, onSessionChange } = mount(api);
    await click(container, "パスキーで確認");
    expect((await findByRole(container, "alert")).textContent).toContain(
      "パスキーを確認できませんでした",
    );
    expect(onSessionChange).not.toHaveBeenCalled();
  });

  it("lets a user with both choose the authenticator app", async () => {
    const api = fakeApi({ status: withFactors({ passkeys: 1, totp: true }) });
    const { container, onSessionChange } = mount(api);
    await click(container, "認証アプリのコードを使う");
    await enter(container, "6 桁のコード", "123456", "確認する");
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
    expect(api.verifyTotp).toHaveBeenCalledWith("123456");
  });

  it("asks for the app's code where the browser cannot use the passkey", async () => {
    const api = fakeApi({ status: withFactors({ passkeys: 1, totp: true }) });
    const { container } = mount(api, fakeWebAuthn({ supported: () => false }));
    expect(await findByLabelText(container, "6 桁のコード")).toBeTruthy();
    expect(queryByRole(container, "button", { name: "パスキーで確認" })).toBeNull();
  });

  it("takes the app's code", async () => {
    const api = fakeApi({ status: withFactors({ totp: true }) });
    const { container, onSessionChange } = mount(api);
    await enter(container, "6 桁のコード", "123456", "確認する");
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
    expect(api.verifyTotp).toHaveBeenCalledWith("123456");
    expect(api.startEnrollment).not.toHaveBeenCalled();
  });

  it("takes a recovery code when neither is at hand", async () => {
    const api = fakeApi({ status: withFactors({ totp: true }) });
    const { container, onSessionChange } = mount(api);
    await click(container, "復旧用コードを使う");
    await enter(container, "復旧用コード", "AAAA-BBBB-CCCC-0001", "確認する");
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
    expect(api.verifyRecoveryCode).toHaveBeenCalledWith("AAAA-BBBB-CCCC-0001");
    await click(container, "認証アプリのコードを使う");
    expect(await findByLabelText(container, "6 桁のコード")).toBeTruthy();
  });

  it("says how long to wait after too many attempts", async () => {
    const api = fakeApi({
      status: withFactors({ totp: true }),
      verifyTotp: vi.fn(async () => {
        throw new SecondFactorError("too_many_attempts", 125);
      }),
    });
    const { container, onSessionChange } = mount(api);
    await enter(container, "6 桁のコード", "123456", "確認する");
    expect((await findByRole(container, "alert")).textContent).toContain("3 分");
    expect(onSessionChange).not.toHaveBeenCalled();
  });

  it("hands back to the sign-in page when the session has run out of time", async () => {
    const api = fakeApi({
      status: withFactors({ passkeys: 1 }),
      startPasskeyAuthentication: vi.fn(async () => {
        throw new SecondFactorError("unauthorized");
      }),
    });
    const { container, onSessionChange } = mount(api);
    await click(container, "パスキーで確認");
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
  });
});

describe("SecondFactorPage: around the forms", () => {
  it("shows an error with a retry when the status cannot be loaded", async () => {
    const status = vi
      .fn<SecondFactorApi["status"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(statusOf({ totp: true }));
    const { container } = mount(fakeApi({ status }));

    expect((await findByRole(container, "alert")).textContent).toContain("読み込めませんでした");
    await click(container, "再読み込み");
    expect(await findByRole(container, "button", { name: "確認する" })).toBeTruthy();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("offers to sign out", async () => {
    const { container, onSignOut } = mount(fakeApi({ status: withFactors({ totp: true }) }));
    await click(container, "サインアウト");
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("says so when signing out fails", async () => {
    const { container } = mount(
      fakeApi({ status: withFactors({ totp: true }) }),
      fakeWebAuthn(),
      false,
    );
    await click(container, "サインアウト");
    expect((await findByRole(container, "alert")).textContent).toContain(
      "サインアウトできませんでした",
    );
  });
});
