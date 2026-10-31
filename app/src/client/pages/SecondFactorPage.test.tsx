// @vitest-environment happy-dom
import { findByLabelText, findByRole, fireEvent, waitFor } from "@testing-library/dom";
import { render, useState } from "hono/jsx/dom";
import { describe, expect, it, vi } from "vitest";
import { SecondFactorError, type SecondFactorApi } from "../secondFactorApi";
import { SecondFactorPage } from "./SecondFactorPage";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/Zedi:a%40test.zedi-note.app?secret=${SECRET}&issuer=Zedi`;
const CODES = Array.from({ length: 10 }, (_, i) => `AAAA-BBBB-CCCC-${String(i).padStart(4, "0")}`);

function fakeApi(overrides: Partial<SecondFactorApi> = {}): SecondFactorApi {
  return {
    status: vi.fn(async () => ({ verified: false, totp: false, recoveryCodesRemaining: 0 })),
    startEnrollment: vi.fn(async () => ({ secret: SECRET, uri: URI })),
    confirmEnrollment: vi.fn(async () => ({ recoveryCodes: CODES })),
    verifyTotp: vi.fn(async () => ({})),
    verifyRecoveryCode: vi.fn(async () => ({ recoveryCodesRemaining: 9 })),
    ...overrides,
  };
}

const enrolled = () =>
  vi.fn(async () => ({ verified: false, totp: true, recoveryCodesRemaining: 10 }));

function mount(api: SecondFactorApi, signOutWorks = true) {
  const container = document.createElement("div");
  document.body.append(container);
  const onSessionChange = vi.fn();
  const onSignOut = vi.fn(async () => signOutWorks);
  render(
    <SecondFactorPage api={api} onSessionChange={onSessionChange} onSignOut={onSignOut} />,
    container,
  );
  return { container, onSessionChange, onSignOut };
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

describe("SecondFactorPage: registering an authenticator app", () => {
  it("shows the QR code and the secret, and takes the first code", async () => {
    const api = fakeApi();
    const { container } = mount(api);

    expect(await findByRole(container, "img", { name: "認証アプリ用の QR コード" })).toBeTruthy();
    expect(container.querySelector("[data-testid=totp-secret]")?.textContent).toBe(
      "JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP",
    );
    const open = await findByRole(container, "link", { name: "この端末の認証アプリで開く" });
    expect(open.getAttribute("href")).toBe(URI);

    await enter(container, "6 桁のコード", "123 456", "登録する");
    await waitFor(() => expect(api.confirmEnrollment).toHaveBeenCalledWith("123 456"));
  });

  it("shows the recovery codes once, and continues only after the user says they saved them", async () => {
    const { container, onSessionChange } = mount(fakeApi());
    await enter(container, "6 桁のコード", "123456", "登録する");

    const list = await findByRole(container, "list", { name: "復旧用コード" });
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(CODES);
    expect(onSessionChange).not.toHaveBeenCalled();

    fireEvent.click(await findByRole(container, "button", { name: "保存しました" }));
    expect(onSessionChange).toHaveBeenCalledTimes(1);
  });

  it("says a wrong code is wrong, and lets the user try again", async () => {
    const confirmEnrollment = vi
      .fn<SecondFactorApi["confirmEnrollment"]>()
      .mockRejectedValueOnce(new SecondFactorError("invalid_code"))
      .mockResolvedValueOnce({ recoveryCodes: CODES });
    const { container } = mount(fakeApi({ confirmEnrollment }));

    await enter(container, "6 桁のコード", "000000", "登録する");
    expect((await findByRole(container, "alert")).textContent).toContain(
      "コードが正しくありません",
    );

    await enter(container, "6 桁のコード", "123456", "登録する");
    expect(await findByRole(container, "list", { name: "復旧用コード" })).toBeTruthy();
  });

  it("keeps the same secret when the parent re-renders with a new callback", async () => {
    // 親の再描画で登録をやり直すと、読み取った QR コードの秘密鍵が無効になってしまう。
    // Restarting enrollment on a parent re-render would invalidate the QR code just scanned.
    const api = fakeApi();
    const container = document.createElement("div");
    document.body.append(container);
    function Parent() {
      const [renders, setRenders] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setRenders((n) => n + 1)}>
            再描画 {renders}
          </button>
          <SecondFactorPage api={api} onSessionChange={() => {}} onSignOut={async () => true} />
        </div>
      );
    }
    render(<Parent />, container);
    await findByRole(container, "img", { name: "認証アプリ用の QR コード" });

    fireEvent.click(await findByRole(container, "button", { name: "再描画 0" }));
    await findByRole(container, "button", { name: "再描画 1" });
    // Effects run after the DOM updates; give a restart the chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(api.startEnrollment).toHaveBeenCalledTimes(1);
    expect(api.status).toHaveBeenCalledTimes(1);
  });

  it("asks for the app's code instead when an app was registered in the meantime", async () => {
    const api = fakeApi({
      startEnrollment: vi.fn(async () => {
        throw new SecondFactorError("already_enrolled");
      }),
    });
    const { container } = mount(api);
    expect(await findByRole(container, "button", { name: "確認する" })).toBeTruthy();
    expect(container.querySelector("[data-testid=totp-secret]")).toBeNull();
  });
});

describe("SecondFactorPage: signing in with a registered app", () => {
  it("takes the app's code", async () => {
    const api = fakeApi({ status: enrolled() });
    const { container, onSessionChange } = mount(api);

    await enter(container, "6 桁のコード", "123456", "確認する");

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
    expect(api.verifyTotp).toHaveBeenCalledWith("123456");
    expect(api.startEnrollment).not.toHaveBeenCalled();
  });

  it("takes a recovery code when the app is not at hand", async () => {
    const api = fakeApi({ status: enrolled() });
    const { container, onSessionChange } = mount(api);

    fireEvent.click(await findByRole(container, "button", { name: "復旧用コードを使う" }));
    await enter(container, "復旧用コード", "AAAA-BBBB-CCCC-0001", "確認する");

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
    expect(api.verifyRecoveryCode).toHaveBeenCalledWith("AAAA-BBBB-CCCC-0001");
    fireEvent.click(await findByRole(container, "button", { name: "認証アプリのコードを使う" }));
    expect(await findByLabelText(container, "6 桁のコード")).toBeTruthy();
  });

  it("says how long to wait after too many attempts", async () => {
    const api = fakeApi({
      status: enrolled(),
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
      status: enrolled(),
      verifyTotp: vi.fn(async () => {
        throw new SecondFactorError("unauthorized");
      }),
    });
    const { container, onSessionChange } = mount(api);

    await enter(container, "6 桁のコード", "123456", "確認する");

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledTimes(1));
  });
});

describe("SecondFactorPage: around the forms", () => {
  it("shows an error with a retry when the status cannot be loaded", async () => {
    const status = vi
      .fn<SecondFactorApi["status"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ verified: false, totp: true, recoveryCodesRemaining: 10 });
    const { container } = mount(fakeApi({ status }));

    expect((await findByRole(container, "alert")).textContent).toContain("読み込めませんでした");
    fireEvent.click(await findByRole(container, "button", { name: "再読み込み" }));

    expect(await findByRole(container, "button", { name: "確認する" })).toBeTruthy();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("offers to sign out", async () => {
    const { container, onSignOut } = mount(fakeApi({ status: enrolled() }));
    fireEvent.click(await findByRole(container, "button", { name: "サインアウト" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("says so when signing out fails", async () => {
    const { container } = mount(fakeApi({ status: enrolled() }), false);
    fireEvent.click(await findByRole(container, "button", { name: "サインアウト" }));
    expect((await findByRole(container, "alert")).textContent).toContain(
      "サインアウトできませんでした",
    );
  });
});
