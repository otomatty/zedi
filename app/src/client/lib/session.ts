/** Response of `GET /api/me`. */
export interface Me {
  user: { id: string; email: string; name: string };
  defaultNoteId: string;
}

/** Client-side view of the auth session. */
export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; me: Me }
  /** `/api/me` could not be reached and nothing was cached (offline before the first visit). */
  | { status: "unavailable" };

/**
 * Tiny observable session store; `fetchMe` resolves null when there is no session.
 * 小さなセッションストア。`fetchMe` はセッションがなければ null を返す。
 */
export function createSessionStore(fetchMe: () => Promise<Me | null>) {
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
        set(me ? { status: "signedIn", me } : { status: "signedOut" });
      } catch {
        set({ status: "unavailable" });
      }
    },
    signOut() {
      set({ status: "signedOut" });
    },
  };
}
