/**
 * Full-bleed overlay while a Claude Code slash command runs.
 * Claude Code スラッシュ実行中のオーバーレイ。
 */

import React, { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

interface SlashAgentLoadingOverlayProps {
  /** i18n label (e.g. editor.slashAgentRunning). / 表示ラベル */
  label: string;
}

/**
 * Blocks interaction with the editor shell while the agent runs.
 * エージェント実行中はエディタ操作をブロックする表示。
 */
export function SlashAgentLoadingOverlay({ label }: SlashAgentLoadingOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="bg-background/80 absolute inset-0 z-40 flex items-center justify-center outline-none"
      aria-busy="true"
      aria-live="polite"
      role="presentation"
      onKeyDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="border-border bg-popover text-foreground flex items-center gap-2 rounded-lg border px-4 py-3 shadow-md">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
