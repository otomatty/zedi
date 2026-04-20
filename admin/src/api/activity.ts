import { adminFetch, getErrorMessage } from "./client";

/**
 * 活動ログの種別。
 * Activity kind enumeration.
 */
export type ActivityKind =
  | "clip_ingest"
  | "chat_promote"
  | "lint_run"
  | "wiki_generate"
  | "index_build"
  | "wiki_schema_update";

/**
 * 活動ログの起点（user / ai / system）。
 * Activity actor.
 */
export type ActivityActor = "user" | "ai" | "system";

/**
 * 1 件の活動ログ。
 * A single activity entry.
 */
export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  actor: ActivityActor;
  target_page_ids: string[];
  detail: Record<string, unknown> | null;
  created_at: string;
}

/**
 * 活動ログ取得レスポンス。
 * Response from GET /api/activity.
 */
export interface ActivityListResponse {
  entries: ActivityEntry[];
  total: number;
  limit: number;
}

/**
 * 一覧クエリパラメータ。
 * List query parameters.
 */
export interface ActivityListParams {
  kind?: ActivityKind;
  actor?: ActivityActor;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/**
 * 自分の活動ログを取得する。
 * Fetches the current user's activity entries.
 *
 * @param params - フィルタ・ページング / Filters and paging
 */
export async function listActivity(params: ActivityListParams = {}): Promise<ActivityListResponse> {
  const query = new URLSearchParams();
  if (params.kind) query.set("kind", params.kind);
  if (params.actor) query.set("actor", params.actor);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  if (typeof params.offset === "number") query.set("offset", String(params.offset));
  const qs = query.toString();
  const path = qs ? `/api/activity?${qs}` : "/api/activity";

  const res = await adminFetch(path);
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to fetch activity entries"));
  }
  return res.json();
}
