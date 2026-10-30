import { describe, expect, it } from "vitest";
import { api, me, signIn, uniqueEmail } from "./helpers";

describe("auth (Better Auth on D1)", () => {
  it("rejects API calls without a session", async () => {
    expect((await api("/api/me", null)).status).toBe(401);
  });

  it("signs in with a magic link and provisions a default note for a new user", async () => {
    const email = uniqueEmail("alice");
    const cookie = await signIn(email);
    const profile = await me(cookie);
    expect(profile.user.email).toBe(email);
    expect(profile.defaultNoteId).toMatch(/.+/);
  });

  it("reuses the same user and default note on a second sign-in", async () => {
    const email = uniqueEmail("repeat");
    const first = await me(await signIn(email));
    const second = await me(await signIn(email));
    expect(second.user.id).toBe(first.user.id);
    expect(second.defaultNoteId).toBe(first.defaultNoteId);
  });

  it("invalidates the session on sign-out", async () => {
    const cookie = await signIn(uniqueEmail("bye"));
    const res = await api("/api/auth/sign-out", cookie, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    const cleared = res.headers
      .getSetCookie()
      .map((c: string) => c.split(";")[0])
      .join("; ");
    expect((await api("/api/me", cleared)).status).toBe(401);
  });
});
