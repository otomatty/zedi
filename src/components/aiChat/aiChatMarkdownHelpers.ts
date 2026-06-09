const PLACEHOLDER_PREFIX = "\u0001WIKI_PH\u0002";
const PLACEHOLDER_SUFFIX = "\u0002WIKI_PH\u0001";

/**
 * Converts [[Title]] in AI markdown to [Title](wiki:Title) so we can render as AIChatWikiLink.
 * Skips code fences (```...```) and inline code (`...`) so literal [[...]] in code is not altered.
 */
export function replaceWikiLinksInMarkdown(content: string): string {
  const codeChunks: string[] = [];

  const withPlaceholders = content
    // Fenced code blocks (```...```)
    .replace(/```[\s\S]*?```/g, (match) => {
      const id = codeChunks.length;
      codeChunks.push(match);
      return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
    })
    // Inline code (`...`), minimal: non-greedy, no nested backticks
    .replace(/`[^`]*`/g, (match) => {
      const id = codeChunks.length;
      codeChunks.push(match);
      return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
    });

  const withWikiLinks = withPlaceholders.replace(/\[\[([^\]]+)\]\]/g, (_, title: string) => {
    const t = title.trim();
    return t ? `[${t}](wiki:${encodeURIComponent(t)})` : `[[${title}]]`;
  });

  let out = withWikiLinks;
  for (let i = 0; i < codeChunks.length; i++) {
    const placeholder = `${PLACEHOLDER_PREFIX}${i}${PLACEHOLDER_SUFFIX}`;
    out = out.split(placeholder).join(codeChunks[i]);
  }
  return out;
}
