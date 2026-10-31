/** Response of `GET /api/me`. */
export interface Me {
  user: { id: string; email: string; name: string };
  defaultNoteId: string;
}

/** Client-side view of the auth session. */
export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  /** Signed in with Google, but the second factor is still to be registered or entered. */
  | { status: "secondFactor" }
  | { status: "signedIn"; me: Me }
  /** `/api/me` could not be reached and nothing was cached (offline before the first visit). */
  | { status: "unavailable" };

/**
 * Tiny observable session store; `fetchMe` resolves null when there is no session and
 * `"secondFactor"` when the session has not passed the second factor yet.
 * 小さなセッションストア。`fetchMe` はセッションがなければ null、2 段階目の前なら `"secondFactor"`。
 */
export function createSessionStore(fetchMe: () => Promise<Me | null | "secondFactor">) {
  let state: SessionState = { status: "loading" };
  const listeners = new Set<() => void>();
  const set = (next: SessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refresh() {
      try {
        const me = await fetchMe();
        if (me === "secondFactor") set({ status: "secondFactor" });
        else set(me ? { status: "signedIn", me } : { status: "signedOut" });
      } catch {
        set({ status: "unavailable" });
      }
    },
    signOut() {
      set({ status: "signedOut" });
    },
  };
}
