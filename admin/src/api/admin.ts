import { adminFetch } from "./client";

/** 現在ログイン中の管理者情報 / Current admin user info */
export interface AdminMe {
  id: string;
  email: string | null;
  role: "admin";
}

/** ユーザー役割 / User role */
export type UserRole = "user" | "admin";

/** 管理者画面で表示するユーザー情報 / User info for admin UI */
export interface UserAdmin {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

/** AI モデル管理用のモデル情報 / AI model info for admin */
export interface AiModelAdmin {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  tierRequired: "free" | "pro";
  inputCostUnits: number;
  outputCostUnits: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => ({ message: res.statusText }));
  return (err as { message?: string }).message ?? fallback;
}

/**
 * 現在ログイン中の管理者情報を取得する。
 * Fetches current admin user info.
 *
 * @returns 管理者情報。未認証の場合は null / AdminMe or null if unauthenticated
 */
export async function getAdminMe(): Promise<AdminMe | null> {
  const res = await adminFetch("/api/admin/me");
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return null;
    throw new Error(await getErrorMessage(res, "Failed to fetch admin info"));
  }
  return res.json();
}

/**
 * AI モデル一覧を取得する。
 * Fetches AI model list.
 *
 * @returns モデル配列 / Array of AiModelAdmin
 */
export async function getAiModels(): Promise<AiModelAdmin[]> {
  const res = await adminFetch("/api/ai/admin/models");
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to fetch AI models"));
  }
  const data = await res.json();
  return data.models ?? [];
}

/**
 * AI モデルを 1 件更新する。
 * Updates a single AI model.
 *
 * @param id - モデル ID / Model ID
 * @param body - 更新するフィールド / Fields to update
 * @returns 更新後のモデル / Updated model
 */
export async function patchAiModel(
  id: string,
  body: Partial<
    Pick<
      AiModelAdmin,
      | "displayName"
      | "tierRequired"
      | "inputCostUnits"
      | "outputCostUnits"
      | "isActive"
      | "sortOrder"
    >
  >,
): Promise<AiModelAdmin> {
  const res = await adminFetch(`/api/ai/admin/models/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to update AI model"));
  }
  const data = await res.json();
  return data.model;
}

/**
 * AI モデルを一括更新する。
 * Bulk updates AI models.
 *
 * @param updates - 更新内容の配列 / Array of updates
 * @returns 更新件数とモデル配列 / Updated count and model array
 */
export async function patchAiModelsBulk(
  updates: Array<{
    id: string;
    displayName?: string;
    tierRequired?: "free" | "pro";
    isActive?: boolean;
    sortOrder?: number;
  }>,
): Promise<{ updated: number; models: AiModelAdmin[] }> {
  const res = await adminFetch("/api/ai/admin/models/bulk", {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to bulk update AI models"));
  }
  return res.json();
}

/** 同期処理 1 プロバイダ分の結果 / Sync result per provider */
export interface SyncResultItem {
  provider: string;
  fetched: number;
  upserted: number;
  filtered?: number;
  deactivated?: number;
  pricingSource?: string;
  error?: string;
}

/** 同期プレビューで表示するモデル項目 / Model item in sync preview */
export interface SyncPreviewItem {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  tierRequired: "free" | "pro";
  isActive: boolean;
}

/** 同期プレビューの結果（1 プロバイダ分）/ Sync preview result per provider */
export interface SyncPreviewResult {
  provider: string;
  toAdd: SyncPreviewItem[];
  toDeactivate: SyncPreviewItem[];
  error?: string;
}

/**
 * AI モデル同期のプレビューを取得する。
 * Previews AI model sync changes.
 *
 * @returns プロバイダ別のプレビュー結果 / Preview results per provider
 */
export async function previewSyncAiModels(): Promise<SyncPreviewResult[]> {
  const res = await adminFetch("/api/ai/admin/sync-models/preview", { method: "POST" });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Preview failed"));
  }
  const data = await res.json();
  return data.results ?? [];
}

/**
 * AI モデルを外部ソースから同期する。
 * Syncs AI models from external sources.
 *
 * @returns プロバイダ別の同期結果 / Sync results per provider
 */
export async function syncAiModels(): Promise<SyncResultItem[]> {
  const res = await adminFetch("/api/ai/admin/sync-models", { method: "POST" });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Sync failed"));
  }
  const data = await res.json();
  return data.results ?? [];
}

/** ユーザー一覧取得のクエリパラメータ / Query params for user list */
export interface GetUsersParams {
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * ユーザー一覧を取得する。
 * Fetches user list with optional search/pagination.
 *
 * @param params - 検索・ページネーション / Search and pagination
 * @returns ユーザー配列と総件数 / Users array and total count
 */
export async function getUsers(params?: GetUsersParams): Promise<{
  users: UserAdmin[];
  total: number;
}> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  const res = await adminFetch(`/api/admin/users${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to fetch users"));
  }
  return res.json();
}

/**
 * ユーザーの役割を更新する。
 * Updates user role.
 *
 * @param id - ユーザー ID / User ID
 * @param role - 新しい役割 / New role
 * @returns 更新後のユーザー情報 / Updated user
 */
export async function patchUserRole(id: string, role: UserRole): Promise<{ user: UserAdmin }> {
  const res = await adminFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to update user role"));
  }
  return res.json();
}
