/**
 * `verify_pdf_source` を React Query 化したフック。
 *
 * Replaces the bespoke `useState&lt;PdfVerifyResult&gt;` + `verifyCounter`
 * effect that lived inside `PdfReader.tsx` (see CodeRabbit / Gemini review of
 * PR #858). The query is gated on `isTauriDesktop()`; on the web bundle it
 * stays disabled rather than throwing, so the same component file can be
 * imported by the SSR / web build without runtime errors.
 *
 * 再アタッチ完了後は呼び出し側で {@link UseQueryResult.refetch} を呼ぶことで再検証する。
 * Callers refresh by invoking `verifyQuery.refetch()` from the
 * `MissingPdfBanner.onReattachComplete` callback.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { isTauriDesktop } from "@/lib/platform";
import { type PdfVerifyResult, verifyPdfSource, PdfKnowledgeUnsupportedError } from "./tauriBridge";
import { pdfKnowledgeKeys } from "./highlightsApi";

/**
 * 与えられた `sourceId` に対し `verify_pdf_source` を `useQuery` で実行する。
 * Run `verify_pdf_source` for the given `sourceId` through React Query.
 *
 * @param sourceId - 対象 PDF ソースの id。 falsy なら disabled。
 *   The target PDF source id; the query is disabled while falsy.
 * @returns `UseQueryResult&lt;PdfVerifyResult | null, Error&gt;`. `null` だけは
 *   Tauri 非対応環境での防御的フォールバックで使う（実運用では `enabled` で
 *   防がれる）。 `null` only appears as a defensive fallback should the bridge
 *   throw {@link PdfKnowledgeUnsupportedError} despite `enabled: false`.
 */
export function usePdfSourceVerify(
  sourceId: string | undefined,
): UseQueryResult<PdfVerifyResult | null, Error> {
  return useQuery<PdfVerifyResult | null, Error>({
    queryKey: pdfKnowledgeKeys.verify(sourceId ?? ""),
    queryFn: async () => {
      if (!sourceId) throw new Error("usePdfSourceVerify: sourceId is required");
      try {
        return await verifyPdfSource(sourceId);
      } catch (err) {
        if (err instanceof PdfKnowledgeUnsupportedError) return null;
        throw err;
      }
    },
    enabled: Boolean(sourceId) && isTauriDesktop(),
    staleTime: 60_000,
    // The user can flip back to the app after moving / restoring the file;
    // re-probing on focus keeps the missing-banner state honest without
    // requiring a manual refresh.
    // タブを切り替えてファイルを操作した場合に備え focus で再検証する。
    refetchOnWindowFocus: true,
  });
}
