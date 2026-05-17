/**
 * `/api/sources/pdf` クライアントと React Query フック群。
 *
 * Client + React Query hooks for the PDF source / highlight endpoints.
 *
 * 設計上の注意 / Design notes:
 *   - PDF 本体（バイナリ）はここでは触らない。サーバが受け取るのはハッシュ・サイズ・
 *     ページ数・ハイライト / メモのみ。バイナリは Tauri 側ローカルレジストリに留まる。
 *   - PDF binaries are never sent through these endpoints — only highlight
 *     metadata, page counts, and content hashes. The bytes live exclusively on
 *     the user's filesystem via the Tauri registry.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Allowed highlight colors (mirrors the server enum). */
export const PDF_HIGHLIGHT_COLORS = ["yellow", "green", "blue", "red", "purple"] as const;
/** Highlight color literal type derived from {@link PDF_HIGHLIGHT_COLORS}. */
export type PdfHighlightColor = (typeof PDF_HIGHLIGHT_COLORS)[number];

/** Rect in PDF user-space coordinates. Mirrors the server `PdfHighlightRect`. */
export interface PdfHighlightRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Highlight row as returned by the API. */
export interface PdfHighlight {
  id: string;
  sourceId: string;
  ownerId: string;
  derivedPageId: string | null;
  /**
   * 派生ページ（`derivedPageId`）の所属ノート ID。「派生ページを開く」リンクの
   * 遷移先 `/notes/:noteId/:pageId` を組み立てるためにサーバが left join で
   * 同梱する（Issue #889 Phase 3 で `/pages/:id` を廃止）。派生ページが無い
   * ハイライトでは `null`。
   *
   * Owning note id of the derived page, returned by the server via a left
   * join with `pages`. Used to build the `/notes/:noteId/:pageId` URL for the
   * "Open derived page" link (Issue #889 Phase 3 retired `/pages/:id`).
   * `null` when the highlight has no derived page yet.
   */
  derivedPageNoteId: string | null;
  pdfPage: number;
  rects: PdfHighlightRect[];
  text: string;
  color: PdfHighlightColor;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Free-form PDF metadata extracted from XMP / Info dictionary. */
export interface PdfSourceMetadata {
  pdfTitle?: string;
  pdfAuthor?: string;
  pdfCreatedAt?: string;
  [key: string]: unknown;
}

/** POST /api/sources/pdf request body. */
export interface RegisterPdfSourceBody {
  sha256: string;
  byteSize: number;
  pageCount?: number;
  displayName?: string;
  metadata?: PdfSourceMetadata;
}

/** POST /api/sources/pdf response. */
export interface RegisterPdfSourceResponse {
  sourceId: string;
  deduped: boolean;
}

/** POST /api/sources/pdf/:sourceId/highlights request body. */
export interface CreatePdfHighlightBody {
  pdfPage: number;
  rects: PdfHighlightRect[];
  text: string;
  color?: PdfHighlightColor;
  note?: string | null;
}

/** Patchable fields on a highlight. */
export interface UpdatePdfHighlightBody {
  color?: PdfHighlightColor;
  note?: string | null;
}

/** POST /derive-page body. */
export interface DerivePageBody {
  noteId?: string | null;
  title?: string;
  contentPreview?: string;
  templateContent?: string;
}

/**
 * POST /derive-page response.
 *
 * Two shapes are returned:
 *   - `alreadyDerived: true` → only `pageId` is guaranteed (idempotent path).
 *   - First-time derivation → every field is populated.
 *
 * 冪等で再呼び出しした場合は pageId のみが必須、初回時は全フィールドが入る。
 */
export interface DerivePageResponse {
  pageId: string;
  alreadyDerived?: boolean;
  noteId?: string | null;
  sectionAnchor?: string;
  templateContent?: string | null;
  title?: string | null;
  contentPreview?: string | null;
  createdAt?: string;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string) ?? "";
}

async function jsonFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: "include",
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
    ...rest,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string } | null;
      if (body?.message) message = body.message;
    } catch {
      // ignore
    }
    throw new Error(`API ${res.status}: ${message}`);
  }
  return (await res.json()) as T;
}

// ── Low-level API calls ─────────────────────────────────────────────────────

/**
 * PDF ソースを登録する（ハッシュで dedup）。
 * Register a PDF source (dedup by content hash).
 */
export function registerPdfSourceApi(
  body: RegisterPdfSourceBody,
): Promise<RegisterPdfSourceResponse> {
  return jsonFetch<RegisterPdfSourceResponse>("/api/sources/pdf", {
    method: "POST",
    json: body,
  });
}

/** PDF ソースの page_count を後追いで反映する。Backfill page_count from pdf.js. */
export function patchPdfSourcePageCount(
  sourceId: string,
  pageCount: number,
): Promise<{ sourceId: string; pageCount: number }> {
  return jsonFetch<{ sourceId: string; pageCount: number }>(
    `/api/sources/pdf/${encodeURIComponent(sourceId)}/page-count`,
    {
      method: "PATCH",
      json: { pageCount },
    },
  );
}

/** PDF ソースのハイライト一覧を取得する。Fetch all highlights for a source. */
export function listPdfHighlightsApi(sourceId: string): Promise<{ highlights: PdfHighlight[] }> {
  return jsonFetch<{ highlights: PdfHighlight[] }>(
    `/api/sources/pdf/${encodeURIComponent(sourceId)}/highlights`,
  );
}

/** ハイライトを作成する。Create a highlight. */
export function createPdfHighlightApi(
  sourceId: string,
  body: CreatePdfHighlightBody,
): Promise<{ highlight: PdfHighlight }> {
  return jsonFetch<{ highlight: PdfHighlight }>(
    `/api/sources/pdf/${encodeURIComponent(sourceId)}/highlights`,
    { method: "POST", json: body },
  );
}

/** ハイライトを部分更新する。Patch color / note on an existing highlight. */
export function updatePdfHighlightApi(
  sourceId: string,
  highlightId: string,
  body: UpdatePdfHighlightBody,
): Promise<{ highlight: PdfHighlight }> {
  return jsonFetch<{ highlight: PdfHighlight }>(
    `/api/sources/pdf/${encodeURIComponent(sourceId)}/highlights/${encodeURIComponent(highlightId)}`,
    { method: "PATCH", json: body },
  );
}

/** ハイライトを削除する。Delete a highlight. */
export function deletePdfHighlightApi(
  sourceId: string,
  highlightId: string,
): Promise<{ deleted?: string }> {
  return jsonFetch<{ deleted?: string }>(
    `/api/sources/pdf/${encodeURIComponent(sourceId)}/highlights/${encodeURIComponent(highlightId)}`,
    { method: "DELETE" },
  );
}

/** ハイライトから派生 Zedi ページを作成する。Derive a Zedi page from a highlight. */
export function derivePageFromHighlightApi(
  sourceId: string,
  highlightId: string,
  body: DerivePageBody,
): Promise<DerivePageResponse> {
  return jsonFetch<DerivePageResponse>(
    `/api/sources/pdf/${encodeURIComponent(sourceId)}/highlights/${encodeURIComponent(highlightId)}/derive-page`,
    { method: "POST", json: body },
  );
}

// ── React Query hooks ───────────────────────────────────────────────────────

/** Query key factory for PDF resources. */
export const pdfKnowledgeKeys = {
  all: ["pdfKnowledge"] as const,
  highlights: (sourceId: string) => [...pdfKnowledgeKeys.all, "highlights", sourceId] as const,
  /**
   * verify_pdf_source の結果をキャッシュするためのキー。
   * Key for caching the local `verify_pdf_source` probe result.
   */
  verify: (sourceId: string) => [...pdfKnowledgeKeys.all, "verify", sourceId] as const,
};

/** ハイライト一覧を購読する。Subscribe to a source's highlights. */
export function usePdfHighlights(sourceId: string | undefined) {
  return useQuery({
    queryKey: pdfKnowledgeKeys.highlights(sourceId ?? ""),
    queryFn: () => {
      // `enabled` ガード越しでしか呼ばれないため、ここで未定義 sourceId に到達したら
      // 上流の呼び出し側のバグ。型から `!` を取り除くために明示的に throw する。
      // `enabled` below guards this; throw if we ever get here without a sourceId
      // so the bug surfaces instead of being hidden by a non-null assertion.
      if (!sourceId) throw new Error("usePdfHighlights: sourceId is required");
      return listPdfHighlightsApi(sourceId);
    },
    enabled: Boolean(sourceId),
    staleTime: 30_000,
  });
}

/** ハイライト作成 mutation。Mutation: create a highlight. */
export function useCreatePdfHighlight(sourceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePdfHighlightBody) => createPdfHighlightApi(sourceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdfKnowledgeKeys.highlights(sourceId) });
    },
  });
}

/** ハイライト更新 mutation。Mutation: patch a highlight. */
export function useUpdatePdfHighlight(sourceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ highlightId, body }: { highlightId: string; body: UpdatePdfHighlightBody }) =>
      updatePdfHighlightApi(sourceId, highlightId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdfKnowledgeKeys.highlights(sourceId) });
    },
  });
}

/** ハイライト削除 mutation。Mutation: delete a highlight. */
export function useDeletePdfHighlight(sourceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (highlightId: string) => deletePdfHighlightApi(sourceId, highlightId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdfKnowledgeKeys.highlights(sourceId) });
    },
  });
}

/** 派生ページ作成 mutation。Mutation: derive a Zedi page from a highlight. */
export function useDerivePageFromHighlight(sourceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ highlightId, body }: { highlightId: string; body: DerivePageBody }) =>
      derivePageFromHighlightApi(sourceId, highlightId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdfKnowledgeKeys.highlights(sourceId) });
    },
  });
}
