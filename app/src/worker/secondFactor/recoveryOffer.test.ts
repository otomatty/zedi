import { describe, expect, it } from "vitest";
import { OFFER_TTL_MS, openOffer, sealOffer } from "./recoveryOffer";
import { sealSecret } from "./secretBox";

const KEY = "better-auth-secret-for-tests-000000000000";
const NOW = Date.UTC(2026, 9, 31, 10, 0, 0);
const OFFER = {
  userId: "user-1",
  sessionId: "session-1",
  batch: "batch-1",
  hashes: ["hash-a", "hash-b"],
};
const FOR = { userId: "user-1", sessionId: "session-1" };

describe("recovery code offers", () => {
  it("opens for the same user and session until it expires", async () => {
    const sealed = await sealOffer(KEY, { ...OFFER, now: NOW });
    const opened = { batch: "batch-1", hashes: ["hash-a", "hash-b"] };
    expect(await openOffer(KEY, sealed, { ...FOR, now: NOW })).toEqual(opened);
    expect(await openOffer(KEY, sealed, { ...FOR, now: NOW + OFFER_TTL_MS - 1 })).toEqual(opened);
    expect(await openOffer(KEY, sealed, { ...FOR, now: NOW + OFFER_TTL_MS })).toBeNull();
  });

  it("lasts ten minutes, long enough to save the codes", () => {
    expect(OFFER_TTL_MS).toBe(10 * 60_000);
  });

  it("does not open for another user or another session", async () => {
    const sealed = await sealOffer(KEY, { ...OFFER, now: NOW });
    expect(await openOffer(KEY, sealed, { ...FOR, userId: "user-2", now: NOW })).toBeNull();
    expect(await openOffer(KEY, sealed, { ...FOR, sessionId: "session-2", now: NOW })).toBeNull();
  });

  it("does not show the hashes, and rejects a changed or malformed offer", async () => {
    const sealed = await sealOffer(KEY, { ...OFFER, now: NOW });
    expect(sealed).not.toContain("hash-a");
    const flipped = `${sealed.slice(0, -1)}${sealed.endsWith("0") ? "1" : "0"}`;
    expect(await openOffer(KEY, flipped, { ...FOR, now: NOW })).toBeNull();
    expect(await openOffer(KEY, "", { ...FOR, now: NOW })).toBeNull();
    expect(await openOffer(`${KEY}-other`, sealed, { ...FOR, now: NOW })).toBeNull();
  });

  it("rejects a box sealed for another purpose", async () => {
    const payload = JSON.stringify({
      u: "user-1",
      s: "session-1",
      b: "batch-1",
      h: [],
      e: NOW + 1,
    });
    expect(await openOffer(KEY, await sealSecret(KEY, payload), { ...FOR, now: NOW })).toBeNull();
  });

  it.each([
    ["not JSON", "x"],
    ["no hashes", JSON.stringify({ u: "user-1", s: "session-1", b: "batch-1", e: NOW + 1 })],
    [
      "hashes that are not strings",
      JSON.stringify({ u: "user-1", s: "session-1", b: "batch-1", h: [1], e: NOW + 1 }),
    ],
    ["no batch", JSON.stringify({ u: "user-1", s: "session-1", h: ["a"], e: NOW + 1 })],
    ["no expiry", JSON.stringify({ u: "user-1", s: "session-1", b: "batch-1", h: ["a"] })],
  ])("rejects a payload with %s", async (_, payload) => {
    const sealed = await sealSecret(KEY, payload, "recovery-code-offer");
    expect(await openOffer(KEY, sealed, { ...FOR, now: NOW })).toBeNull();
  });
});
