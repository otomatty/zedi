/**
 * PDF 知識化ビューアのルートコンポーネント。
 *
 * Phase 1 (issue otomatty/zedi#389) のスキャフォールド: ルート + プラットフォーム
 * ガード + 「次の PR で pdf.js ビューアを実装」のプレースホルダ。
 *
 * Scaffold for the PDF knowledge viewer. The full pdf.js integration ships in
 * the follow-up PR; this component currently:
 *   - Routes the user from `/sources/:sourceId/pdf` into the right shell
 *   - Gates non-Tauri platforms to {@link PdfReaderUnsupported}
 *   - Exercises the Tauri bridge with `verify_pdf_source` so the missing-file
 *     banner path is wired even before the canvas viewer lands
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { isTauriDesktop } from "@/lib/platform";
import {
  type PdfVerifyResult,
  verifyPdfSource,
  PdfKnowledgeUnsupportedError,
} from "@/lib/pdfKnowledge/tauriBridge";
import { usePdfHighlights } from "@/lib/pdfKnowledge/highlightsApi";
import { PdfReaderUnsupported } from "./PdfReaderUnsupported";
import { MissingPdfBanner } from "./MissingPdfBanner";

/**
 * 機能の入り口となる React コンポーネント。プラットフォームガードと
 * 起動時 verify、欠損バナーをこの 1 つにまとめる。
 * Top-level component for the PDF knowledge feature; centralises the platform
 * gate, startup verify, and the missing-file banner.
 */
export function PdfReader() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const [verify, setVerify] = useState<PdfVerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // Bumped after a successful re-attach so the verify effect re-runs and
  // reflects the file's new state (Gemini review on PR #858).
  // 再アタッチ成功時にこのカウンタを進めて verify を再実行する。
  const [verifyCounter, setVerifyCounter] = useState(0);
  const highlightsQuery = usePdfHighlights(sourceId);

  useEffect(() => {
    if (!sourceId || !isTauriDesktop()) return;
    let cancelled = false;
    verifyPdfSource(sourceId)
      .then((result) => {
        if (cancelled) return;
        setVerify(result);
        setVerifyError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PdfKnowledgeUnsupportedError) return;
        setVerifyError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, verifyCounter]);

  if (!isTauriDesktop()) {
    return <PdfReaderUnsupported />;
  }

  if (!sourceId) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        sourceId が指定されていません / Missing sourceId in route.
      </div>
    );
  }

  const fileMissing = verify !== null && !verify.exists;

  return (
    <div className="flex h-full flex-col">
      {fileMissing && (
        <MissingPdfBanner
          sourceId={sourceId}
          onReattachComplete={() => setVerifyCounter((c) => c + 1)}
        />
      )}
      <div className="grid h-full grid-cols-[1fr_320px] gap-0">
        <main className="overflow-auto p-6">
          {/*
            TODO(issue #389 follow-up): pdf.js (`pdfjs-dist`) を導入して
            `readPdfBytes(sourceId)` → Uint8Array → `pdfjsLib.getDocument(...)` の
            初期化、ページごとのキャンバスレンダリング、テキスト選択レイヤを
            実装する。本 PR は足場のみ。
            TODO(follow-up): wire up `pdfjs-dist` to render canvases from the
            bytes returned by `readPdfBytes`, attach the text-selection layer,
            and surface a HighlightToolbar on selection. The current PR is
            scaffold-only.
          */}
          <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
            <p className="font-medium">
              PDF ビューアは次の PR で実装予定 / PDF viewer comes in a follow-up PR.
            </p>
            <p className="mt-2">
              データモデル・Tauri ブリッジ・API・派生ページ生成は配線済みです。
            </p>
            <p className="mt-2">
              The data model, Tauri bridge, API, and derive-page flow are already wired; only the
              rendering layer is pending.
            </p>
            {verifyError && <p className="text-destructive mt-4">verify error: {verifyError}</p>}
            {verify && (
              <p className="mt-4 text-xs">
                verify: exists={String(verify.exists)} sizeChanged={String(verify.sizeChanged)}{" "}
                mtimeChanged={String(verify.mtimeChanged)}
              </p>
            )}
          </div>
        </main>
        <aside className="overflow-auto border-l p-4 text-sm">
          <h2 className="mb-2 font-medium">ハイライト / Highlights</h2>
          {highlightsQuery.isLoading && <p className="text-muted-foreground">読み込み中…</p>}
          {highlightsQuery.error && (
            <p className="text-destructive text-xs">{(highlightsQuery.error as Error).message}</p>
          )}
          {highlightsQuery.data?.highlights.length === 0 && (
            <p className="text-muted-foreground">まだハイライトはありません。</p>
          )}
          <ul className="space-y-2">
            {highlightsQuery.data?.highlights.map((h) => (
              <li key={h.id} className="rounded border p-2">
                <p className="text-muted-foreground text-xs">p.{h.pdfPage}</p>
                <p className="text-sm">{h.text.slice(0, 200)}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
