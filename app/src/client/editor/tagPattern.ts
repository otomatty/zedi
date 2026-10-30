/**
 * Input-rule pattern: `#tag` followed by a space, at the start of text or after whitespace.
 * Tag characters are letters (incl. CJK), digits, `_` and `-`.
 * 入力ルール用: 行頭または空白の直後の `#タグ` + 空白。
 */
export const TAG_INPUT_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+) $/u;

/**
 * Returns the tag just completed at the end of `text`, or null.
 * `text` の末尾で確定したタグ名を返す（なければ null）。
 */
export function extractTagAtEnd(text: string): string | null {
  return TAG_INPUT_PATTERN.exec(text)?.[1] ?? null;
}
