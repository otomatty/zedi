import { describe, expect, it, vi } from "vitest";
import { createSessionStore, type Me } from "./session";

const me: Me = { user: { id: "u1", email: "a@example.com", name: "" }, defaultNoteId: "n1" };

describe("createSessionStore", () => {
  it("starts loading, then becomes signed in when /api/me succeeds", async () => {
    const store = createSessionStore(async () => me);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get()).toEqual({ status: "loading" });
    await store.refresh();
    expect(store.get()).toEqual({ status: "signedIn", me });
    expect(listener).toHaveBeenCalled();
  });

  it("becomes signed out when there is no session", async () => {
    const store = createSessionStore(async () => null);
    await store.refresh();
    expect(store.get()).toEqual({ status: "signedOut" });
  });

  it("can be reset to signed out (after sign-out)", async () => {
    const store = createSessionStore(async () => me);
    await store.refresh();
    store.signOut();
    expect(store.get()).toEqual({ status: "signedOut" });
  });
});
