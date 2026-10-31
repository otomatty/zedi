// @vitest-environment happy-dom
import { findByRole, fireEvent, waitFor } from "@testing-library/dom";
import { render } from "hono/jsx/dom";
import { describe, expect, it, vi } from "vitest";
import { SignInPage, type SignInOptions } from "./SignInPage";

function mount(options: SignInOptions | Error, startSignIn = vi.fn(async () => {})) {
  const container = document.createElement("div");
  document.body.append(container);
  const loadOptions = async () => {
    if (options instanceof Error) throw options;
    return options;
  };
  render(<SignInPage loadOptions={loadOptions} startSignIn={startSignIn} />, container);
  return { container, startSignIn };
}

describe("SignInPage", () => {
  it("offers Google and starts its sign-in", async () => {
    const { container, startSignIn } = mount({ google: true, testIdp: false });

    fireEvent.click(await findByRole(container, "button", { name: "Google でサインイン" }));

    await waitFor(() => expect(startSignIn).toHaveBeenCalledWith("google"));
    expect(container.textContent).not.toContain("テスト用 IdP");
  });

  it("offers the test IdP only where the server enables it", async () => {
    const { container, startSignIn } = mount({ google: false, testIdp: true });

    fireEvent.click(await findByRole(container, "button", { name: "テスト用 IdP でサインイン" }));

    await waitFor(() => expect(startSignIn).toHaveBeenCalledWith("test-idp"));
    expect(container.querySelector("[data-testid=sign-in-google]")).toBeNull();
  });

  it("no longer asks for an e-mail address", async () => {
    // マジックリンクは廃止した。メールアドレスの入力欄は出さない。
    // Magic links are gone, so there is no e-mail field.
    const { container } = mount({ google: true, testIdp: true });
    await findByRole(container, "button", { name: "Google でサインイン" });
    expect(container.querySelector("input[type=email]")).toBeNull();
  });

  it("says so when no provider is available", async () => {
    const { container } = mount({ google: false, testIdp: false });
    expect((await findByRole(container, "alert")).textContent).toContain("サインインの方法");
  });

  it("shows an error and lets the user retry when the options cannot be loaded", async () => {
    const loadOptions = vi
      .fn<() => Promise<SignInOptions>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ google: true, testIdp: false });
    const container = document.createElement("div");
    document.body.append(container);
    render(<SignInPage loadOptions={loadOptions} startSignIn={vi.fn()} />, container);

    expect((await findByRole(container, "alert")).textContent).toContain("読み込めませんでした");
    fireEvent.click(await findByRole(container, "button", { name: "再読み込み" }));

    expect(await findByRole(container, "button", { name: "Google でサインイン" })).toBeTruthy();
    expect(loadOptions).toHaveBeenCalledTimes(2);
  });

  it("shows an error when the sign-in cannot start, and keeps the button usable", async () => {
    const startSignIn = vi.fn(async () => {
      throw new Error("network");
    });
    const { container } = mount({ google: true, testIdp: false }, startSignIn);
    const button = await findByRole(container, "button", { name: "Google でサインイン" });

    fireEvent.click(button);

    expect((await findByRole(container, "alert")).textContent).toContain("開始できませんでした");
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
