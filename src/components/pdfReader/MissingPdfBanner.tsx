/**
 * 元 PDF ファイルが見つからない（移動・削除された）ときに表示するバナー。
 *
 * Banner shown over the reader when the registered PDF cannot be located on
 * the user's filesystem. The highlights and derived pages stay readable (they
 * live in Postgres), so this surface is non-destructive — the user can:
 *   1. Re-attach the file via a file dialog (preferred)
 *   2. Forget the source (registry only; the `sources` row is preserved so
 *      citations on derived pages keep working)
 *
 * Phase 1 (issue otomatty/zedi#389) の Open Question #1 への回答。
 */
import { useState } from "react";
import {
  attachPdfSourcePath,
  forgetPdfSource,
  registerPdfSource,
  type RegisteredPdfSource,
} from "@/lib/pdfKnowledge/tauriBridge";

/**
 * Props for the missing-PDF banner.
 * 欠損バナーの Props 型。
 */
export interface MissingPdfBannerProps {
  sourceId: string;
  /** Called after a successful re-attach so the parent re-runs `verify_pdf_source`. */
  onReattachComplete?: () => void;
  /** Called after the user chooses to forget the source. */
  onForget?: () => void;
}

/**
 * Banner component shown over the reader when the underlying PDF cannot be
 * located. Offers two non-destructive actions: re-attach (re-runs
 * `register_pdf_source` + `attach_pdf_source_path`) and forget (registry
 * entry only; the `sources` row stays so citations on derived pages keep
 * working).
 * 欠損時のバナー UI。再アタッチ / 忘却の 2 アクションを提供する。
 */
export function MissingPdfBanner({
  sourceId,
  onReattachComplete,
  onForget,
}: MissingPdfBannerProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReattach() {
    setError(null);
    setPending(true);
    try {
      // 動的 import: Tauri ランタイム外では拾わない。
      // Dynamic import so the web bundle never resolves @tauri-apps/plugin-dialog.
      const dialog = (await import("@tauri-apps/plugin-dialog")) as {
        open: (opts: {
          multiple?: boolean;
          filters?: { name: string; extensions: string[] }[];
        }) => Promise<string | string[] | null>;
      };
      const picked = await dialog.open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!picked || Array.isArray(picked)) {
        setPending(false);
        return;
      }
      const info: RegisteredPdfSource = await registerPdfSource(picked);
      await attachPdfSourcePath({
        sourceId,
        absolutePath: picked,
        sha256: info.sha256,
      });
      onReattachComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function handleForget() {
    setError(null);
    setPending(true);
    try {
      await forgetPdfSource(sourceId);
      onForget?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="min-w-[280px] flex-1">
        元 PDF ファイルが見つかりません。再アタッチしてください。
        <br />
        The original PDF file could not be found on this device. Re-attach to keep using it.
      </p>
      <button
        type="button"
        onClick={handleReattach}
        disabled={pending}
        className="rounded bg-amber-600 px-3 py-1.5 text-white disabled:opacity-50"
      >
        {pending ? "…" : "PDF を再アタッチ / Re-attach"}
      </button>
      <button
        type="button"
        onClick={handleForget}
        disabled={pending}
        className="rounded border border-amber-400 px-3 py-1.5 disabled:opacity-50"
      >
        このソースを忘れる / Forget
      </button>
      {error && <p className="text-destructive basis-full text-xs">{error}</p>}
    </div>
  );
}
