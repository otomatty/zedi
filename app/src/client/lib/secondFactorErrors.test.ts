import { describe, expect, it } from "vitest";
import { SecondFactorError } from "../secondFactorApi";
import { PasskeyPromptError, messageFor, prompt, refusedAs } from "./secondFactorErrors";

describe("messageFor", () => {
  it.each([
    ["invalid_code", "コードが正しくありません"],
    ["invalid_passkey", "パスキーを確認できませんでした"],
    ["reverification_required", "もう一度確認してください"],
    ["last_factor", "最後の確認方法は削除できません"],
  ] as const)("explains %s", (reason, text) => {
    expect(messageFor(new SecondFactorError(reason))).toContain(text);
  });

  it("says how long to wait after too many attempts", () => {
    expect(messageFor(new SecondFactorError("too_many_attempts", 125))).toContain("3 分");
  });

  it("explains a cancelled passkey prompt", () => {
    expect(messageFor(new PasskeyPromptError("cancelled"))).toContain("取り消されました");
  });

  it("falls back to a general message", () => {
    expect(messageFor(new Error("x"))).toContain("時間をおいて");
  });
});

describe("prompt", () => {
  it("passes the prompt's result through and sorts its failures", async () => {
    expect(await prompt(async () => 1)).toBe(1);
    const cancelled = Object.assign(new Error("x"), { name: "NotAllowedError" });
    await expect(
      prompt(async () => {
        throw cancelled;
      }),
    ).rejects.toMatchObject({ failure: "cancelled" });
  });
});

describe("refusedAs", () => {
  it("matches a refusal by its reason", () => {
    expect(refusedAs(new SecondFactorError("last_factor"), "last_factor")).toBe(true);
    expect(refusedAs(new SecondFactorError("not_found"), "last_factor")).toBe(false);
    expect(refusedAs(new Error("last_factor"), "last_factor")).toBe(false);
  });
});
