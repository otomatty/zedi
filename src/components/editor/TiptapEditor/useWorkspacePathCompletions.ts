/**
 * Debounced workspace path suggestions for agent slash args (Tauri only).
 * エージェントスラッシュ引数向けワークスペースパス候補（Tauri のみ）。
 */

import { useEffect, useState } from "react";
import { listNoteWorkspaceEntries } from "@/lib/noteWorkspace/noteWorkspaceIo";
import { listWorkspaceDirectoryEntries } from "@/lib/workspace/bridge";

/**
 * Parses `args` into a directory to list and an optional filename prefix filter.
 * `args` を列挙するディレクトリとファイル名プレフィックスに分解する。
 */
export function parsePathCompletionArgs(args: string): { dir: string; filePrefix: string } {
  const p = args.trim();
  if (!p) return { dir: "", filePrefix: "" };
  const normalized = p.replace(/\\/g, "/");
  if (normalized.endsWith("/")) {
    return { dir: normalized.replace(/\/+$/, ""), filePrefix: "" };
  }
  const idx = normalized.lastIndexOf("/");
  if (idx === -1) {
    return { dir: "", filePrefix: normalized };
  }
  return {
    dir: normalized.slice(0, idx),
    filePrefix: normalized.slice(idx + 1),
  };
}

/**
 * Loads directory entry names for slash path completion (max 40).
 * スラッシュのパス補完用にディレクトリエントリを読む（最大 40 件）。
 */
export function useWorkspacePathCompletions(
  args: string,
  enabled: boolean,
  /** When set, list under the registered workspace for this note (Issue #461). Else process cwd. */
  noteWorkspaceNoteId: string | null,
): string[] {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => setItems([]));
      return;
    }
    const { dir, filePrefix } = parsePathCompletionArgs(args);
    let cancelled = false;
    const t = window.setTimeout(() => {
      const promise = noteWorkspaceNoteId
        ? listNoteWorkspaceEntries(noteWorkspaceNoteId, dir)
        : listWorkspaceDirectoryEntries(dir);
      void promise
        .then((names) => {
          if (cancelled) return;
          const fp = filePrefix.toLowerCase();
          const filtered = fp ? names.filter((n) => n.toLowerCase().startsWith(fp)) : names;
          setItems(filtered.slice(0, 40));
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [args, enabled, noteWorkspaceNoteId]);

  return items;
}
