/**
 * 「Open PDF」ボタンが行う一連の処理を 1 つのフックにまとめる。
 *
 * Encapsulates the full register-then-attach-then-navigate flow triggered by
 * the user clicking "Open PDF". Splitting this out of the button component
 * keeps the UI side declarative and lets us unit-test the orchestration.
 *
 * ステップ / Steps:
 *   1. Tauri のファイルダイアログで PDF を選ばせる (`.pdf` フィルタ)。
 *   2. `registerPdfSource(absolutePath)` で SHA-256 / displayName / byteSize を計算。
 *   3. `registerPdfSourceApi(...)` でサーバに登録 (重複は dedup される)。
 *   4. `attachPdfSourcePath(...)` で Tauri 側のレジストリにパスを紐付け。
 *   5. `navigate('/sources/${sourceId}/pdf')` で即時遷移。
 *
 * いずれかのステップで失敗した場合は `useToast` でエラーを通知し、`error` state を返す。
 * Errors at any step surface via `useToast()` and the returned `error` state.
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@zedi/ui";
import { isTauriDesktop } from "@/lib/platform";
import {
  attachPdfSourcePath,
  registerPdfSource,
  PdfKnowledgeUnsupportedError,
} from "@/lib/pdfKnowledge/tauriBridge";
import { registerPdfSourceApi } from "@/lib/pdfKnowledge/highlightsApi";

/** Return shape of {@link useOpenPdfFlow}. */
export interface UseOpenPdfFlowResult {
  /** Trigger the flow. Safe to ignore the returned promise. */
  open: () => Promise<void>;
  /** True while the flow is in progress. */
  isPending: boolean;
  /** Last error from the flow, if any (null after the next attempt). */
  error: Error | null;
}

/**
 * Tauri のダイアログプラグインを動的 import するためのヘルパ。
 * Dynamic-import wrapper for `@tauri-apps/plugin-dialog`. Kept as a module
 * function so tests can override it via `vi.mock`.
 */
async function loadDialogPlugin(): Promise<{
  open: (opts: {
    multiple?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | string[] | null>;
}> {
  return (await import("@tauri-apps/plugin-dialog")) as {
    open: (opts: {
      multiple?: boolean;
      filters?: { name: string; extensions: string[] }[];
    }) => Promise<string | string[] | null>;
  };
}

/**
 * Hook that exposes the "Open PDF" flow.
 */
export function useOpenPdfFlow(): UseOpenPdfFlowResult {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const open = useCallback(async () => {
    if (!isTauriDesktop()) {
      // Should not happen — the button is hidden on web — but stay defensive.
      // Web ビルドでも UI が漏れた場合の防衛。
      return;
    }
    setError(null);
    setIsPending(true);
    try {
      const dialog = await loadDialogPlugin();
      const picked = await dialog.open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!picked || Array.isArray(picked)) {
        // User cancelled — silent exit, no toast.
        return;
      }
      const info = await registerPdfSource(picked);
      const reg = await registerPdfSourceApi({
        sha256: info.sha256,
        byteSize: info.byteSize,
        displayName: info.displayName,
      });
      await attachPdfSourcePath({
        sourceId: reg.sourceId,
        absolutePath: picked,
        sha256: info.sha256,
      });
      navigate(`/sources/${reg.sourceId}/pdf`);
    } catch (err) {
      if (err instanceof PdfKnowledgeUnsupportedError) {
        // Same as the gate above — ignore.
        return;
      }
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      toast({
        title: "PDF を開けませんでした / Could not open PDF",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  }, [navigate, toast]);

  return { open, isPending, error };
}
