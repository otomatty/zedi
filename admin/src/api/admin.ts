import { adminFetch } from "./client";

export interface AdminMe {
  id: string;
  email: string | null;
  role: "admin";
}

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

export async function getAdminMe(): Promise<AdminMe | null> {
  const res = await adminFetch("/api/admin/me");
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return null;
    throw new Error(await getErrorMessage(res, "Failed to fetch admin info"));
  }
  return res.json();
}

export async function getAiModels(): Promise<AiModelAdmin[]> {
  const res = await adminFetch("/api/ai/admin/models");
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to fetch AI models"));
  }
  const data = await res.json();
  return data.models ?? [];
}

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

export interface SyncResultItem {
  provider: string;
  fetched: number;
  upserted: number;
  filtered?: number;
  deactivated?: number;
  pricingSource?: string;
  error?: string;
}

export interface SyncPreviewItem {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  tierRequired: "free" | "pro";
  isActive: boolean;
}

export interface SyncPreviewResult {
  provider: string;
  toAdd: SyncPreviewItem[];
  toDeactivate: SyncPreviewItem[];
  error?: string;
}

export async function previewSyncAiModels(): Promise<SyncPreviewResult[]> {
  const res = await adminFetch("/api/ai/admin/sync-models/preview", { method: "POST" });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Preview failed"));
  }
  const data = await res.json();
  return data.results ?? [];
}

export async function syncAiModels(): Promise<SyncResultItem[]> {
  const res = await adminFetch("/api/ai/admin/sync-models", { method: "POST" });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Sync failed"));
  }
  const data = await res.json();
  return data.results ?? [];
}
