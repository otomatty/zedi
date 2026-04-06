/**
 * Pure helpers for merging block + agent slash menu items.
 * ブロック＋エージェントのスラッシュ項目をマージする純粋ヘルパー。
 */

import type { Editor } from "@tiptap/core";
import type { AgentSlashCommandId } from "@/lib/agentSlashCommands/types";
import { AGENT_SLASH_PREFIXES } from "@/lib/agentSlashCommands/parseAgentSlashQuery";
import {
  slashCommandItems,
  filterSlashCommandItems,
  type SlashCommandItem,
} from "./slashCommandItems";
import { parsePathCompletionArgs } from "./useWorkspacePathCompletions";

/** One row in the unified slash menu. / 統合スラッシュメニューの 1 行 */
export type UnifiedSlashMenuItem =
  | { kind: "block"; item: SlashCommandItem }
  | { kind: "agent"; id: AgentSlashCommandId };

type TFunction = (key: string) => string;

/**
 * Filters agent command ids by query (title / aliases / prefix).
 * クエリでエージェントコマンド ID を絞り込む。
 */
export function filterAgentSlashItems(query: string, t: TFunction): AgentSlashCommandId[] {
  const q = query.toLowerCase().trim();
  const firstToken = q.split(/\s+/)[0] ?? "";
  const out: AgentSlashCommandId[] = [];
  for (const def of AGENT_SLASH_PREFIXES) {
    if (!q) {
      out.push(def.id);
      continue;
    }
    const title = t(`editor.slash.${def.id}.title`).toLowerCase();
    const aliasesStr = t(`editor.slash.${def.id}.aliases`);
    const aliases = aliasesStr ? aliasesStr.split(",").map((s) => s.trim().toLowerCase()) : [];
    let ok = false;
    if (firstToken && title.includes(firstToken)) ok = true;
    else if (
      firstToken &&
      aliases.some(
        (a) =>
          (firstToken.length >= 2 && a.includes(firstToken)) ||
          firstToken.startsWith(a) ||
          a.startsWith(firstToken),
      )
    )
      ok = true;
    else if (def.prefix.startsWith(firstToken) || firstToken.startsWith(def.prefix)) ok = true;
    else if (def.aliases?.some((a) => a.startsWith(firstToken) || firstToken.startsWith(a)))
      ok = true;
    if (ok) out.push(def.id);
  }
  return out;
}

/**
 * Merges filtered block items and (optionally) agent items.
 * ブロック項目と（任意で）エージェント項目をマージする。
 */
export function mergeSlashItems(
  query: string,
  editor: Editor,
  t: TFunction,
  claudeAgentAvailable: boolean,
): UnifiedSlashMenuItem[] {
  const blocks = filterSlashCommandItems([...slashCommandItems], query, editor, t).map((item) => ({
    kind: "block" as const,
    item,
  }));
  if (!claudeAgentAvailable) return blocks;
  const agents = filterAgentSlashItems(query, t).map((id) => ({ kind: "agent" as const, id }));
  return [...blocks, ...agents];
}

/**
 * Builds new path args after the user picks a directory entry.
 * ディレクトリ候補選択後の新しいパス引数を組み立てる。
 */
export function buildNewArgsFromPick(currentArgs: string, picked: string): string {
  const { dir, filePrefix } = parsePathCompletionArgs(currentArgs);
  if (!filePrefix) {
    return dir ? `${dir}/${picked}` : picked;
  }
  const base = dir ? `${dir}/` : "";
  return `${base}${picked}`;
}
