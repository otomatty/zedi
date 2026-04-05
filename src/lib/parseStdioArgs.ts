/**
 * stdio MCP の「引数」テキストをトークン配列に分割する（Issue #463）。
 * Splits a stdio MCP "arguments" string into tokens (Issue #463).
 *
 * スペース区切りに加え、二重引用・単一引用で囲まれたトークンをサポートする。
 * Supports quoted tokens in addition to whitespace splitting.
 */

/**
 * Parses a command-line style argument string into argv-style tokens.
 * シェル風のクォートを解釈して argv 風のトークン配列にする。
 */
export function parseStdioArgsLine(args: string): string[] {
  const trimmed = args.trim();
  if (!trimmed) return [];

  const tokens = trimmed.match(/(?:[^\s"']+|"(?:[^"\\]|\\.)*"|'[^']*')+/g);
  if (!tokens) return [];

  return tokens.map((t) => {
    if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
      return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
      return t.slice(1, -1);
    }
    return t;
  });
}
