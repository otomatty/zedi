/**
 * Whether Claude Code slash agent commands should appear (desktop + CLI installed).
 * Claude Code スラッシュが表示されるか（デスクトップ + CLI 導入済み）。
 */

import { useEffect, useState } from "react";
import { isTauriDesktop } from "@/lib/platform";

/**
 * Resolves availability once on mount (matches {@link createClaudeCodeProvider}).
 * マウント時に 1 回解決する（createClaudeCodeProvider と同条件）。
 */
export function useClaudeAgentSlashAvailability(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!isTauriDesktop()) {
      setAvailable(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { createClaudeCodeProvider } = await import("@/lib/aiProviders/claudeCodeProvider");
        const provider = createClaudeCodeProvider();
        const ok = await provider.isAvailable();
        if (!cancelled) setAvailable(ok);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
