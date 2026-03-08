/**
 * Converts [[Title]] in AI markdown to [Title](wiki:Title) so we can render as AIChatWikiLink.
 */
export function replaceWikiLinksInMarkdown(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, title: string) => {
    const t = title.trim();
    return t ? `[${t}](wiki:${encodeURIComponent(t)})` : `[[${title}]]`;
  });
}
