import { getAuth } from "../auth";
import type { Env } from "../env";
import { getPageAccess } from "../services/access";

/** Header the Worker sets (never trusted from the client) to tell the room the caller's role. */
export const ROLE_HEADER = "x-zedi-role";

/**
 * Authorizes a WebSocket upgrade to a page room: 401 without a session, 404 without access
 * (existence is not revealed). On success the request is forwarded with the role header.
 * ページ部屋への WebSocket 接続を認可する。未ログインは 401、権限なしは 404。
 */
export async function authorizeRealtime(
  request: Request,
  env: Env,
  pageId: string,
): Promise<Request | Response> {
  const session = await getAuth(env, request.url).api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const page = await getPageAccess(env.DB, session.user.id, pageId);
  if (!page) return new Response("Not found", { status: 404 });
  const forwarded = new Request(request);
  forwarded.headers.set(ROLE_HEADER, page.role);
  return forwarded;
}
