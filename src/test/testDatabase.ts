/**
 * Test helpers for Tiptap content (no database).
 */

/**
 * Tiptap JSON content with WikiLinks
 */
export function createWikiLinkContent(links: string[]): string {
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: links.map((title) => ({
          type: "text",
          text: `[[${title}]]`,
          marks: [
            {
              type: "wikiLink",
              attrs: {
                title,
                exists: false,
                referenced: false,
              },
            },
          ],
        })),
      },
    ],
  };
  return JSON.stringify(content);
}

/**
 * Create plain text Tiptap content
 */
export function createPlainTextContent(text: string): string {
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    ],
  };
  return JSON.stringify(content);
}
