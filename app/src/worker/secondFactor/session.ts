import { getAuth } from "../auth";
import type { Env } from "../env";
import { secondFactorState, type SecondFactorState } from "./state";
import { deleteSession } from "./store";

/** The signed-in session and where it stands on the second factor. */
export interface CurrentSession {
  sessionId: string;
  user: { id: string; email: string; name: string };
  state: SecondFactorState;
}

/**
 * Reads the request's session. An unverified session that ran out of time is deleted and
 * reported as `expired`, so every caller turns it away. With `fresh`, the session is read from
 * D1 rather than the five-minute cookie cache, so a session already ended (signed out, or
 * cleared by the admin's recovery) is not found.
 * リクエストのセッションを読む。期限切れの未確認セッションは消して `expired` を返す。`fresh` なら
 * Cookie キャッシュではなく D1 から読むので、終えたセッションは見つからない。
 */
export async function currentSession(
  env: Env,
  request: Request,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<CurrentSession | null> {
  const found = await getAuth(env, request.url).api.getSession({
    headers: request.headers,
    query: { disableCookieCache: fresh },
  });
  if (!found) return null;
  const state = secondFactorState(found.session, Date.now());
  if (state === "expired") await deleteSession(env.DB, found.session.id);
  const { id, email, name } = found.user;
  return { sessionId: found.session.id, user: { id, email, name }, state };
}
