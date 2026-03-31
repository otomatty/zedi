import { describe, expect, it } from "vitest";
import { decideAuthWhenApiInternalUrlMissing, isTruthyEnvFlag } from "./dev-auth-bypass.js";

describe("isTruthyEnvFlag", () => {
  it("treats 1, true, yes as true (case-insensitive)", () => {
    expect(isTruthyEnvFlag("true")).toBe(true);
    expect(isTruthyEnvFlag("TRUE")).toBe(true);
    expect(isTruthyEnvFlag("1")).toBe(true);
    expect(isTruthyEnvFlag("yes")).toBe(true);
    expect(isTruthyEnvFlag("  true  ")).toBe(true);
  });

  it("rejects other strings and empty", () => {
    expect(isTruthyEnvFlag(undefined)).toBe(false);
    expect(isTruthyEnvFlag("")).toBe(false);
    expect(isTruthyEnvFlag("false")).toBe(false);
    expect(isTruthyEnvFlag("0")).toBe(false);
    expect(isTruthyEnvFlag("on")).toBe(false);
  });
});

describe("decideAuthWhenApiInternalUrlMissing", () => {
  it("always throws in production", () => {
    expect(decideAuthWhenApiInternalUrlMissing("production", undefined)).toEqual({
      action: "throw",
      message: "API_INTERNAL_URL must be set in production",
    });
    expect(decideAuthWhenApiInternalUrlMissing("production", "true")).toEqual({
      action: "throw",
      message: "API_INTERNAL_URL must be set in production",
    });
  });

  it("throws in non-production when dev flag is unset", () => {
    const d = decideAuthWhenApiInternalUrlMissing("development", undefined);
    expect(d.action).toBe("throw");
    if (d.action === "throw") {
      expect(d.message).toContain("API_INTERNAL_URL");
    }
  });

  it("allows dev bypass in non-production when HOCUSPOCUS_DEV_MODE is true", () => {
    expect(decideAuthWhenApiInternalUrlMissing("development", "true")).toEqual({
      action: "dev_bypass",
    });
    expect(decideAuthWhenApiInternalUrlMissing(undefined, "1")).toEqual({
      action: "dev_bypass",
    });
  });
});
