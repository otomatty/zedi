// @vitest-environment happy-dom
import { findByLabelText, findByRole, fireEvent, queryByRole, waitFor } from "@testing-library/dom";
import { render } from "hono/jsx/dom";
import { describe, expect, it, vi } from "vitest";
import type { WebAuthnClient } from "../lib/webauthn";
import {
  SecondFactorError,
  type SecondFactorApi,
  type SecondFactorMethods,
} from "../secondFactorApi";
import { SecuritySettingsPage } from "./SecuritySettingsPage";

const PASSKEY = {
  id: "cred-1",
  name: "パスキー",
  createdAt: Date.UTC(2026, 9, 1),
  lastUsedAt: null,
};
const CODES = Array.from({ length: 10 }, (_, i) => `NEWC-ODES-0000-${String(i).padStart(4, "0")}`);
const REG_OPTIONS = { challenge: "reg" } as never;
const AUTH_OPTIONS = { challenge: "auth" } as never;

const methodsOf = (overrides: Partial<SecondFactorMethods> = {}): SecondFactorMethods => ({
  passkeys: [PASSKEY],
  totp: true,
  recoveryCodesRemaining: 7,
  recentlyVerified: true,
  ...overrides,
});

function fakeApi(overrides: Partial<SecondFactorApi> = {}): SecondFactorApi {
  return {
    status: vi.fn(),
    startEnrollment: vi.fn(async () => ({ secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x" })),
    confirmEnrollment: vi.fn(async () => ({})),
    verifyTotp: vi.fn(async () => ({})),
    verifyRecoveryCode: vi.fn(async () => ({ recoveryCodesRemaining: 6 })),
    startPasskeyRegistration: vi.fn(async () => ({ options: REG_OPTIONS })),
    confirmPasskeyRegistration: vi.fn(async () => ({})),
    startPasskeyAuthentication: vi.fn(async () => ({ options: AUTH_OPTIONS })),
    verifyPasskey: vi.fn(async () => ({})),
    methods: vi.fn(async () => methodsOf()),
    deletePasskey: vi.fn(async () => ({})),
    deleteTotp: vi.fn(async () => ({})),
    newRecoveryCodes: vi.fn(async () => ({ recoveryCodes: CODES, offer: "OFFER" })),
    confirmRecoveryCodes: vi.fn(async () => ({})),
    ...overrides,
  } as SecondFactorApi;
}

function fakeWebAuthn(overrides: Partial<WebAuthnClient> = {}): WebAuthnClient {
  return {
    supported: () => true,
    register: vi.fn(async () => ({ id: "new" }) as never),
    authenticate: vi.fn(async () => ({ id: "cred-1" }) as never),
    ...overrides,
  };
}

function mount(api: SecondFactorApi, webauthn = fakeWebAuthn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const onSessionChange = vi.fn();
  render(
    <SecuritySettingsPage api={api} webauthn={webauthn} onSessionChange={onSessionChange} />,
    container,
  );
  return { container, onSessionChange, webauthn };
}

/** Clicks a button once it is enabled. */
async function click(container: HTMLElement, name: string) {
  const button = (await findByRole(container, "button", { name })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

/** Ticks "the new codes are saved". */
async function saved(container: HTMLElement) {
  const box = (await findByLabelText(container, "新しいコードを保存しました")) as HTMLInputElement;
  fireEvent.click(box);
  expect(box.checked).toBe(true);
}

/** Submits a code form (see SecondFactorPage.test.tsx for why the event carries `detail`). */
async function enter(container: HTMLElement, label: string, value: string, button: string) {
  const input = (await findByLabelText(container, label)) as HTMLInputElement;
  fireEvent.input(input, { target: { value } });
  const submit = (await findByRole(container, "button", { name: button })) as HTMLButtonElement;
  await waitFor(() => expect(submit.disabled).toBe(false));
  submit.form?.dispatchEvent(
    new CustomEvent("submit", { bubbles: true, cancelable: true, detail: {} }),
  );
}

describe("SecuritySettingsPage: what is registered", () => {
  it("lists the passkeys, the authenticator app and the recovery codes left", async () => {
    const { container } = mount(fakeApi());
    const list = await findByRole(container, "list", { name: "登録したパスキー" });
    expect(list.textContent).toContain("パスキー");
    expect(container.textContent).toContain("認証アプリ: 登録済み");
    expect(container.textContent).toContain("残り 7 個");
  });

  it("hides adding a passkey where the browser cannot use passkeys", async () => {
    const { container } = mount(fakeApi(), fakeWebAuthn({ supported: () => false }));
    await findByRole(container, "list", { name: "登録したパスキー" });
    expect(queryByRole(container, "button", { name: "パスキーを追加" })).toBeNull();
  });
});

describe("SecuritySettingsPage: loading", () => {
  it("hands a session that ran out back to the app", async () => {
    const api = fakeApi({
      methods: vi.fn(async () => {
        throw new SecondFactorError("unauthorized");
      }),
    });
    const { onSessionChange } = mount(api);
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
  });

  it("offers to load again when the list cannot be read", async () => {
    const methods = vi
      .fn<SecondFactorApi["methods"]>()
      .mockRejectedValueOnce(new SecondFactorError("unexpected"))
      .mockResolvedValue(methodsOf());
    const { container, onSessionChange } = mount(fakeApi({ methods }));
    await click(container, "再読み込み");
    await findByRole(container, "list", { name: "登録したパスキー" });
    expect(onSessionChange).not.toHaveBeenCalled();
  });
});

describe("SecuritySettingsPage: checking again", () => {
  it("asks to pass the second step again before changes, then allows them", async () => {
    const methods = vi
      .fn<SecondFactorApi["methods"]>()
      .mockResolvedValueOnce(methodsOf({ recentlyVerified: false }))
      .mockResolvedValue(methodsOf());
    const api = fakeApi({ methods });
    const { container, webauthn } = mount(api);

    const remove = (await findByRole(container, "button", {
      name: "パスキー を削除",
    })) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    expect(container.textContent).toContain("もう一度確認してください");

    await click(container, "パスキーで確認");
    await waitFor(() => expect(methods).toHaveBeenCalledTimes(2));
    expect(webauthn.authenticate).toHaveBeenCalledWith(AUTH_OPTIONS);
    await waitFor(async () =>
      expect(
        ((await findByRole(container, "button", { name: "パスキー を削除" })) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });

  it("can check again with the app's code", async () => {
    const methods = vi
      .fn<SecondFactorApi["methods"]>()
      .mockResolvedValueOnce(methodsOf({ recentlyVerified: false }))
      .mockResolvedValue(methodsOf());
    const api = fakeApi({ methods });
    const { container } = mount(api);
    await click(container, "認証アプリのコードを使う");
    await enter(container, "6 桁のコード", "123456", "確認する");
    await waitFor(() => expect(api.verifyTotp).toHaveBeenCalledWith("123456"));
    await waitFor(() => expect(methods).toHaveBeenCalledTimes(2));
  });

  it("asks again when the five minutes ran out in the meantime", async () => {
    const methods = vi
      .fn<SecondFactorApi["methods"]>()
      .mockResolvedValueOnce(methodsOf())
      .mockResolvedValue(methodsOf({ recentlyVerified: false }));
    const api = fakeApi({
      methods,
      newRecoveryCodes: vi.fn(async () => {
        throw new SecondFactorError("reverification_required");
      }),
    });
    const { container } = mount(api);
    await click(container, "復旧用コードを作り直す");
    expect((await findByRole(container, "alert")).textContent).toContain(
      "もう一度確認してください",
    );
    await findByRole(container, "button", { name: "パスキーで確認" });
  });
});

describe("SecuritySettingsPage: changes", () => {
  it("removes a passkey after the user confirms", async () => {
    const api = fakeApi();
    const { container } = mount(api);
    await click(container, "パスキー を削除");
    expect(api.deletePasskey).not.toHaveBeenCalled();
    await click(container, "削除する");
    await waitFor(() => expect(api.deletePasskey).toHaveBeenCalledWith("cred-1"));
    await waitFor(() => expect(api.methods).toHaveBeenCalledTimes(2));
  });

  it("can cancel a removal", async () => {
    const api = fakeApi();
    const { container } = mount(api);
    await click(container, "パスキー を削除");
    await click(container, "やめる");
    expect(api.deletePasskey).not.toHaveBeenCalled();
    expect(queryByRole(container, "button", { name: "削除する" })).toBeNull();
  });

  it("does not offer removing the last method", async () => {
    const { container } = mount(
      fakeApi({ methods: vi.fn(async () => methodsOf({ totp: false })) }),
    );
    const remove = (await findByRole(container, "button", {
      name: "パスキー を削除",
    })) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    expect(container.textContent).toContain("ほかの確認方法を登録すると削除できます");
  });

  it("says the last method cannot be removed when the other one went meanwhile", async () => {
    const methods = vi
      .fn<SecondFactorApi["methods"]>()
      .mockResolvedValueOnce(methodsOf())
      .mockResolvedValue(methodsOf({ totp: false }));
    const api = fakeApi({
      methods,
      deletePasskey: vi.fn(async () => {
        throw new SecondFactorError("last_factor");
      }),
    });
    const { container } = mount(api);
    await click(container, "パスキー を削除");
    await click(container, "削除する");
    expect((await findByRole(container, "alert")).textContent).toContain(
      "最後の確認方法は削除できません",
    );
    await waitFor(() => expect(methods).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.textContent).toContain("認証アプリ: 未登録"));
  });

  it("removes the authenticator app", async () => {
    const api = fakeApi();
    const { container } = mount(api);
    await click(container, "認証アプリを削除");
    await click(container, "削除する");
    await waitFor(() => expect(api.deleteTotp).toHaveBeenCalledTimes(1));
  });

  it("adds a passkey", async () => {
    const api = fakeApi();
    const { container, webauthn } = mount(api);
    await click(container, "パスキーを追加");
    await click(container, "パスキーを登録");
    await waitFor(() => expect(api.confirmPasskeyRegistration).toHaveBeenCalledTimes(1));
    expect(webauthn.register).toHaveBeenCalledWith(REG_OPTIONS);
    await waitFor(() => expect(api.methods).toHaveBeenCalledTimes(2));
  });

  it("keeps adding a passkey open when the prompt is cancelled, and closes it when refused", async () => {
    const cancelled = Object.assign(new Error("x"), { name: "NotAllowedError" });
    const register = vi
      .fn<WebAuthnClient["register"]>()
      .mockRejectedValueOnce(cancelled)
      .mockResolvedValue({ id: "new" } as never);
    const api = fakeApi({
      confirmPasskeyRegistration: vi.fn(async () => {
        throw new SecondFactorError("invalid_passkey");
      }),
    });
    const { container } = mount(api, fakeWebAuthn({ register }));
    await click(container, "パスキーを追加");
    await click(container, "パスキーを登録");
    expect((await findByRole(container, "alert")).textContent).toContain("取り消されました");
    await click(container, "パスキーを登録");
    await waitFor(() => expect(api.confirmPasskeyRegistration).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(queryByRole(container, "button", { name: "パスキーを登録" })).toBeNull(),
    );
    expect((await findByRole(container, "alert")).textContent).toContain(
      "パスキーを確認できませんでした",
    );
  });

  it("registers an authenticator app when there is none", async () => {
    const api = fakeApi({ methods: vi.fn(async () => methodsOf({ totp: false })) });
    const { container } = mount(api);
    await waitFor(() => expect(container.textContent).toContain("認証アプリ: 未登録"));
    expect(queryByRole(container, "button", { name: "認証アプリを削除" })).toBeNull();
    await click(container, "認証アプリを登録");
    await enter(container, "6 桁のコード", "654321", "登録する");
    await waitFor(() => expect(api.confirmEnrollment).toHaveBeenCalledWith("654321"));
    await waitFor(() => expect(api.methods).toHaveBeenCalledTimes(2));
  });
});

describe("SecuritySettingsPage: new recovery codes", () => {
  it("shows new recovery codes, and switches to them once the user saved them", async () => {
    const api = fakeApi();
    const { container } = mount(api);
    await click(container, "復旧用コードを作り直す");
    const list = await findByRole(container, "list", { name: "新しい復旧用コード" });
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(CODES);
    expect(container.textContent).toContain("切り替えるまでは前のコードが使えます");
    const switchTo = (await findByRole(container, "button", {
      name: "このコードに切り替える",
    })) as HTMLButtonElement;
    expect(switchTo.disabled).toBe(true);

    await saved(container);
    await click(container, "このコードに切り替える");
    await waitFor(() => expect(api.confirmRecoveryCodes).toHaveBeenCalledWith("OFFER"));
    await waitFor(() => expect(container.textContent).toContain("前のコードは使えなくなりました"));
    expect(api.methods).toHaveBeenCalledTimes(2);
  });

  it("keeps the new codes on screen when switching fails, so it can be tried again", async () => {
    const confirmRecoveryCodes = vi
      .fn<SecondFactorApi["confirmRecoveryCodes"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({});
    const { container } = mount(fakeApi({ confirmRecoveryCodes }));
    await click(container, "復旧用コードを作り直す");
    await saved(container);
    await click(container, "このコードに切り替える");
    await findByRole(container, "alert");
    await findByRole(container, "list", { name: "新しい復旧用コード" });
    await click(container, "このコードに切り替える");
    await waitFor(() => expect(confirmRecoveryCodes).toHaveBeenCalledTimes(2));
    expect(confirmRecoveryCodes).toHaveBeenLastCalledWith("OFFER");
    await waitFor(() => expect(container.textContent).toContain("前のコードは使えなくなりました"));
  });

  it("says the old codes still work when the offer ran out", async () => {
    const api = fakeApi({
      confirmRecoveryCodes: vi.fn(async () => {
        throw new SecondFactorError("invalid_offer");
      }),
    });
    const { container } = mount(api);
    await click(container, "復旧用コードを作り直す");
    await saved(container);
    await click(container, "このコードに切り替える");
    expect((await findByRole(container, "alert")).textContent).toContain(
      "前のコードはそのまま使えます",
    );
    expect(queryByRole(container, "list", { name: "新しい復旧用コード" })).toBeNull();
  });

  it("can leave the new codes without switching", async () => {
    const api = fakeApi();
    const { container } = mount(api);
    await click(container, "復旧用コードを作り直す");
    await findByRole(container, "list", { name: "新しい復旧用コード" });
    await click(container, "やめる");
    expect(queryByRole(container, "list", { name: "新しい復旧用コード" })).toBeNull();
    expect(api.confirmRecoveryCodes).not.toHaveBeenCalled();
  });
});
