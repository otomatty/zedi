import { describe, expect, it } from "vitest";
import {
  RECENT_SECOND_FACTOR_MS,
  UNVERIFIED_SESSION_TTL_MS,
  recentlyVerified,
  secondFactorState,
} from "./state";

const created = new Date("2026-10-31T00:00:00Z");
const after = (ms: number) => created.getTime() + ms;

describe("secondFactorState", () => {
  it("keeps an unverified session usable for the second step for ten minutes", () => {
    expect(UNVERIFIED_SESSION_TTL_MS).toBe(10 * 60_000);
    const session = { createdAt: created, secondFactorAt: null };
    expect(secondFactorState(session, after(0))).toBe("pending");
    expect(secondFactorState(session, after(UNVERIFIED_SESSION_TTL_MS - 1))).toBe("pending");
    expect(secondFactorState(session, after(UNVERIFIED_SESSION_TTL_MS))).toBe("expired");
  });

  it("treats a missing second-factor time like an unverified session", () => {
    expect(secondFactorState({ createdAt: created }, after(0))).toBe("pending");
  });

  it("keeps a verified session verified for as long as the session lives", () => {
    const session = { createdAt: created, secondFactorAt: new Date(after(60_000)) };
    expect(secondFactorState(session, after(60_000))).toBe("verified");
    expect(secondFactorState(session, after(6 * 24 * 60 * 60_000))).toBe("verified");
  });
});

describe("recentlyVerified", () => {
  it("allows five minutes after the second step for adding another method", () => {
    expect(RECENT_SECOND_FACTOR_MS).toBe(5 * 60_000);
    const at = created.getTime();
    expect(recentlyVerified(at, after(0))).toBe(true);
    expect(recentlyVerified(at, after(RECENT_SECOND_FACTOR_MS - 1))).toBe(true);
    expect(recentlyVerified(at, after(RECENT_SECOND_FACTOR_MS))).toBe(false);
  });

  it("is never true for a session that has not passed the second step", () => {
    expect(recentlyVerified(null, after(0))).toBe(false);
  });
});
