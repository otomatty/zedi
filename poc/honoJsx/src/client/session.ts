import { useCallback, useSyncExternalStore } from "hono/jsx/dom";
import { fetchMe } from "./api";
import { createSessionStore, type SessionState } from "./lib/session";

/** App-wide session store backed by `GET /api/me`. */
export const session = createSessionStore(fetchMe);

/**
 * Subscribes a component to the session state.
 * セッション状態を購読するフック。
 */
export function useSession(): SessionState {
  const subscribe = useCallback((notify: () => void) => session.subscribe(notify), []);
  return useSyncExternalStore(subscribe, session.get);
}
