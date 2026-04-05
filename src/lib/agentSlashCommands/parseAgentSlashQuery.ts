/**
 * Parses `/`-menu query text for agent commands (first token + args).
 * エージェントコマンド向けに `/` メニューのクエリを解析する（先頭トークン + 引数）。
 */

import type { AgentSlashCommandId } from "./types";

/** Longest-prefix metadata for each agent command. / 各エージェントコマンドの最長一致メタデータ */
export const AGENT_SLASH_PREFIXES: ReadonlyArray<{
  id: AgentSlashCommandId;
  /** Primary command token after `/` (no leading slash). / `/` 直後の主トークン */
  prefix: string;
  /** Extra single-token prefixes for filtering (optional). / フィルタ用の別名トークン */
  aliases?: readonly string[];
}> = [
  { id: "agent-analyze", prefix: "analyze" },
  { id: "agent-git-summary", prefix: "git-summary", aliases: ["git"] },
  { id: "agent-run", prefix: "run" },
  { id: "agent-research", prefix: "research" },
  { id: "agent-review", prefix: "review" },
  { id: "agent-test", prefix: "test" },
  { id: "agent-explain", prefix: "explain" },
  { id: "agent-summarize", prefix: "summarize" },
];

/**
 * Returns args text after the command prefix for a full-line query.
 * 行全体のクエリから、コマンド接頭辞以降の引数文字列を返す。
 */
export function extractArgsAfterPrefix(commandPrefix: string, query: string): string {
  const trimmed = query.trim();
  const escaped = commandPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}(?:\\s+(.*))?$`, "s");
  const m = trimmed.match(re);
  if (!m) return "";
  return (m[1] ?? "").trim();
}

/**
 * Finds which agent command matches the first token of `query` (longest prefix wins).
 * `query` の先頭トークンに一致するエージェントコマンドを返す（最長一致）。
 */
export function matchAgentSlashByQuery(query: string): {
  id: AgentSlashCommandId;
  prefix: string;
  args: string;
} | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  if (!firstToken) return null;

  const candidates = [...AGENT_SLASH_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);

  for (const c of candidates) {
    if (firstToken === c.prefix || c.aliases?.includes(firstToken)) {
      const argsFromPrimary = extractArgsAfterPrefix(c.prefix, trimmed);
      if (argsFromPrimary || trimmed === c.prefix || trimmed.startsWith(`${c.prefix} `)) {
        return { id: c.id, prefix: c.prefix, args: argsFromPrimary };
      }
      for (const al of c.aliases ?? []) {
        const fromAlias = extractArgsAfterPrefix(al, trimmed);
        if (trimmed.startsWith(`${al} `) || trimmed === al) {
          return { id: c.id, prefix: c.prefix, args: fromAlias };
        }
      }
      return { id: c.id, prefix: c.prefix, args: "" };
    }
  }

  for (const c of candidates) {
    if (c.prefix.startsWith(firstToken) && firstToken.length >= 1) {
      return { id: c.id, prefix: c.prefix, args: "" };
    }
  }
  return null;
}

/** Agent commands that support workspace path completion. / ワークスペースパス補完が有効なコマンド */
export const PATH_COMPLETABLE_AGENT_IDS: ReadonlySet<AgentSlashCommandId> = new Set([
  "agent-analyze",
  "agent-review",
  "agent-test",
  "agent-run",
]);

/**
 * Whether to show path completion rows (args part after a space).
 * パス補完行を出すか（スペース以降の引数部分）。
 */
export function shouldOfferPathCompletion(query: string): boolean {
  const m = matchAgentSlashByQuery(query);
  if (!m || !PATH_COMPLETABLE_AGENT_IDS.has(m.id)) return false;
  return /\s/.test(query);
}

/**
 * Resolves args for a known command when the user picked a menu entry.
 * メニュー選択時に、既知コマンドに対する引数を解決する。
 */
export function resolveArgsForSelectedAgent(
  commandPrefix: string,
  aliases: readonly string[] | undefined,
  query: string,
): string {
  const trimmed = query.trim();
  if (!trimmed) return "";
  const primary = extractArgsAfterPrefix(commandPrefix, trimmed);
  if (trimmed === commandPrefix || trimmed.startsWith(`${commandPrefix} `)) {
    return primary;
  }
  for (const al of aliases ?? []) {
    const fromAlias = extractArgsAfterPrefix(al, trimmed);
    if (trimmed === al || trimmed.startsWith(`${al} `)) {
      return fromAlias;
    }
  }
  return "";
}
