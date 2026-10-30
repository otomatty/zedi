/** Shortest term the FTS5 trigram tokenizer can match. */
const MIN_TRIGRAM_CHARS = 3;
const MAX_TERMS = 8;

/**
 * How to search pages: an FTS5 MATCH expression for long terms plus LIKE patterns
 * (escaped with `\`) for terms the trigram index cannot match.
 * 検索方法。3 文字以上は FTS5 trigram の MATCH、それ未満は LIKE（`\` でエスケープ）。
 */
export interface SearchPlan {
  match: string | null;
  likes: string[];
}

const quoteFtsTerm = (term: string) => `"${term.replaceAll('"', '""')}"`;
const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Splits a user query into whitespace-separated terms (AND semantics) and plans the search.
 * ユーザー入力を空白区切りの語（AND）に分け、検索方法を決める。
 */
export function buildSearchPlan(query: string): SearchPlan | null {
  const terms = [...new Set(query.trim().split(/\s+/u).filter(Boolean))].slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  const long = terms.filter((t) => [...t].length >= MIN_TRIGRAM_CHARS);
  const short = terms.filter((t) => [...t].length < MIN_TRIGRAM_CHARS);
  return {
    match: long.length > 0 ? long.map(quoteFtsTerm).join(" ") : null,
    likes: short.map((t) => `%${escapeLike(t)}%`),
  };
}
