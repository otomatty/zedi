import { describe, expect, it } from "vitest";
import { inspectSql, normalizeEmail, resetStatements } from "./adminReset";

describe("clearing a user's second factor (admin recovery)", () => {
  it("names the user by the address, lowercased and trimmed", () => {
    expect(normalizeEmail("  Someone@Example.COM ")).toBe("someone@example.com");
    for (const sql of [
      ...resetStatements("Someone@Example.COM"),
      inspectSql("Someone@Example.COM"),
    ]) {
      expect(sql).toContain("'someone@example.com'");
    }
  });

  it("doubles quotes, so an address with an apostrophe stays one SQL string", () => {
    for (const sql of [
      ...resetStatements("o'brien@example.com"),
      inspectSql("o'brien@example.com"),
    ]) {
      expect(sql).toContain("'o''brien@example.com'");
      expect(sql).not.toMatch(/[^']'brien/);
    }
  });

  it.each([
    "",
    "no-at-sign",
    "a@b@example.com",
    "a b@example.com",
    "a@example.com; DROP TABLE user",
    'a"b@example.com',
    "a\\b@example.com",
    "a@exa\nmple.com",
    "a@localhost",
  ])("refuses %j", (email) => {
    expect(() => resetStatements(email)).toThrow();
    expect(() => inspectSql(email)).toThrow();
  });

  it("clears the passkeys, the app, the recovery codes and the attempt count, then ends the sessions", () => {
    const tables = resetStatements("someone@example.com").map(
      (sql) => /^DELETE FROM (\w+) /.exec(sql)?.[1],
    );
    expect(tables).toEqual([
      "webauthn_challenges",
      "passkeys",
      "totp_factors",
      "recovery_codes",
      "second_factor_attempts",
      "session",
    ]);
  });

  it("writes one statement per line, so they can go in a file for wrangler", () => {
    for (const sql of resetStatements("someone@example.com")) expect(sql).not.toContain("\n");
  });

  it("never deletes the account, its Google link or its notes", () => {
    const all = resetStatements("someone@example.com").join("\n");
    expect(all).not.toMatch(/DELETE FROM (user|account|notes|note_members|pages)\b/);
  });

  it("inspects the account with one query", () => {
    const sql = inspectSql("someone@example.com");
    expect(sql).toMatch(/^SELECT /);
    expect(sql).not.toContain(";");
  });
});
